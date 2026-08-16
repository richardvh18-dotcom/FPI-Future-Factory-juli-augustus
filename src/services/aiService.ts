/**
 * AI Service - Google Gemini Integration
 * Exclusief voor Firebase/Google ecosystem
 * 
 * Setup:
 * API key wordt uitsluitend server-side geconfigureerd
 * via Firebase Functions config/environment.
 */

import { collection, collectionGroup, query, getDocs, addDoc, setDoc, getDoc, doc, limit, orderBy, where, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import app, { auth, db, logActivity } from '../config/firebase';
import { PATHS, getPathString, getPlanningArchivePath } from '../config/dbPaths';
import i18n from '../i18n';
import { fetchScopedEfficiencyHours } from '../utils/efficiencyScopedReader';


import * as contextProviders from './ai/contextProviders';
import * as promptBuilders from './ai/promptBuilders';
import * as cloudFunctionProxies from './ai/cloudFunctionProxies';

export type AiDocument = {
  id: string;
  fileName?: string;
  parsed?: boolean;
  characterCount?: number;
  fullText?: string;
  analysis?: {
    title?: string;
    summary?: string;
    keyFacts?: string[];
    tags?: string[];
    fullContext?: string;
    processes?: string[];
    partNumbers?: string[];
    tolerances?: string[];
    warnings?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CatalogProduct = {
  id: string;
  name?: string;
  sku?: string;
  description?: string;
  specifications?: unknown;
  tolerance?: unknown;
  toleranceRange?: string;
  diameter?: string | number;
  length?: string | number;
  width?: string | number;
  height?: string | number;
  quantity?: number;
  minStock?: number;
  reserved?: number;
  [key: string]: unknown;
};

export type AiMemory = {
  id: string;
  topic?: string;
  content?: string;
  keywords?: string[];
  active?: boolean;
  [key: string]: unknown;
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const SYSTEM_PROMPT_BUDGET = 11500;

export const AI_TRACKING_READ_LIMIT = 600;
export const AI_OCCUPANCY_READ_LIMIT = 300;
export const AI_PLANNING_READ_LIMIT = 400;
export const AI_SCOPED_ORDERS_READ_LIMIT = 600;
export const AI_SCOPED_ITEMS_READ_LIMIT = 1200;
export const AI_ARCHIVE_READ_LIMIT = 800;

type RecordLike = Record<string, unknown>;
type FirestoreDocLike = {
  id: string;
  data: () => RecordLike;
  ref?: { path: string };
};
type FirestoreSnapshotLike = {
  docs: FirestoreDocLike[];
};

export const clamp = (value: string, maxChars: number): string => String(value || '').slice(0, maxChars);
export const asRecord = (value: unknown): RecordLike | null => {
  if (typeof value === 'object' && value !== null) {
    return value as RecordLike;
  }
  return null;
};

class AIService {
  public availableModel: string;
  public functions: Functions;
  public aiProxyGenerate: unknown;
  public askCopilotCallable: unknown;

  constructor() {
    this.availableModel = 'gemini-2.5-flash';
    this.functions = getFunctions(app, 'europe-west1');
    this.aiProxyGenerate = httpsCallable<unknown, unknown>(this.functions, 'aiProxyGenerate');
    this.askCopilotCallable = httpsCallable<unknown, unknown>(this.functions, 'askCopilot');
    
    // Expose debug functie globally voor troubleshooting
    if (typeof window !== 'undefined') {
      const debugWindow = window as Window & { aiDebug?: unknown };
      debugWindow.aiDebug = {
        listDocuments: () => this.debugListDocuments(),
        searchDocuments: (term: string) => this.debugSearchDocuments(term),
        testContext: (query: string) => this.debugTestContext(query)
      };
    }
  }

  isConfigured() {
    return import.meta.env.VITE_DISABLE_AI !== 'true';
  }

  /**
   * Debug: Lijst alle AI documenten
   */
  async debugListDocuments() {
    try {
      const docs = await this.getAiDocuments(50);
      docs.forEach((doc, idx) => { /* empty */ });
      return docs;
    } catch (error) {
      console.error('Debug error:', error);
      return [];
    }
  }

  /**
   * Debug: Test document search
   */
  async debugSearchDocuments(searchTerm: string) {
    const terms = this.extractSearchTerms(searchTerm);
    const results = await this.searchAiDocuments(searchTerm);
    results.forEach((doc, idx) => { /* empty */ });
    return results;
  }

  /**
   * Debug: Test context generation
   */
  async debugTestContext(query: string) {
    const context = await this.getRelevantContext(query);
    return context;
  }

  /**
   * Haal productie orders op uit de database
   * Zoekt in digital_planning en tracked_products en subcollecties
   * @param {number} limitCount - Maximaal aantal orders
   * @returns {Promise<Array>} Array met productie orders
   */
  async getProductionOrders(limitCount = 50) {
    return contextProviders.getProductionOrders(limitCount);
  }

  /**
   * Zoek productie orders op titel/beschrijving/ordernummer
   * Probeert eerst ordernummers eruit te trekken uit de query
   * @param {string} searchTerm - Zoekterm
   * @returns {Promise<Array>} Gevonden orders met volledige informatie
   */
  async searchProductionOrders(searchTerm: string) {
    return contextProviders.searchProductionOrders(searchTerm);
  }

  /**
   * Haal catalogus producten op
   * @param {number} limitCount - Maximaal aantal producten
   * @returns {Promise<Array>} Array met catalog products
   */
  async getCatalogProducts(limitCount = 50): Promise<CatalogProduct[]> {
    return contextProviders.getCatalogProducts(limitCount);
  }

  /**
   * Haal meest recente productie activiteit op gesorteerd op timestamp
   * Gebruikt voor vragen als "welk lotnummer als laatste gebruikt?" of "wat is recentste lot?"
   * @param {number} limitCount - Maximaal aantal items
   * @returns {Promise<Array>} Array met meest recente activiteit
   */
  async getRecentProductionActivity(limitCount = 10) {
    return contextProviders.getRecentProductionActivity(limitCount);
  }

  /**
   * Haal productie tijden op uit TIME_LOGS en EFFICIENCY_HOURS
   * Gebruikt voor vragen over cyclustijden, bewerkingstijden, efficiëntie
   * @param {number} limitCount - Maximaal aantal items
   * @returns {Promise<Array>} Array met tijdregistraties
   */
  async getProductionTimes(limitCount = 20) {
    return contextProviders.getProductionTimes(limitCount);
  }

  /**
   * Haal geanalyseerde AI documenten op
   * @param {number} limitCount - Maximaal aantal documenten
   * @returns {Promise<Array>} Array met documenten
   */
  async getAiDocuments(limitCount = 20): Promise<AiDocument[]> {
    return contextProviders.getAiDocuments(limitCount);
  }

  /**
   * Berekent werkbelasting + beschikbare capaciteit voor de komende weken.
   * Gebruikt voor vragen als:
   * - "Kan ik een order van 130 uur inplannen vóór donderdag over 2 weken?"
   * - "Welke orders lopen achterstand op?"
   * - "Wat is mijn vrije capaciteit volgende week?"
   * @returns {Promise<string>} Geformateerde capaciteits-context string
   */
  async getCapacityContext() {
    return contextProviders.getCapacityContext();
  }

  /**
   * Parse what-if/planning scenario uit vrije tekst.
   * Ondersteunt o.a. uitstel in dagen, extra capaciteit en voorrang op orders.
   */
  parsePlanningScenario(query: string) {
    return contextProviders.parsePlanningScenario(query);
  }

  /**
   * Voorspellende planning op basis van resterende uren, deadlines en beschikbare dagcapaciteit.
   * Resultaat: ETA per order, risicoscore en prioriteitenlijst.
   */
  async getPredictivePlanningContext(scenario: unknown = null) {
    return contextProviders.getPredictivePlanningContext(scenario);
  }

  /**
   * Extract belangrijke zoektermen uit een vraag
   * Verwijdert stopwoorden en haalt key terms eruit
   */
  extractSearchTerms(query: string) {
    return contextProviders.extractSearchTerms(query);
  }

  /**
   * Extraheer herkenbare entiteiten uit de vraag:
   * ordernummers, itemcodes/sku-achtige tokens en maatwaarden.
   */
  extractEntityTokens(query: string) {
    return contextProviders.extractEntityTokens(query);
  }

  /**
   * Compacte live snapshot die ALTIJD wordt toegevoegd,
   * zodat de AI basis-inzicht heeft in orders/capaciteit/voorraad.
   */
  async getOperationalSnapshotContext() {
    return contextProviders.getOperationalSnapshotContext();
  }

  composeSystemPrompt(basePrompt: string, dbContext: string) {
    return promptBuilders.composeSystemPrompt(basePrompt, dbContext);
  }

  /**
   * Zoek in AI documenten op basis van zoekterm
   * @param {string} searchTerm - Zoekterm
   * @returns {Promise<Array>} Gevonden documenten
   */
  async searchAiDocuments(searchTerm: string): Promise<AiDocument[]> {
    return contextProviders.searchAiDocuments(searchTerm);
  }

  /**
   * Zoek catalog producten op naam, maten of toleranties
   * @param {string} searchTerm - Zoekterm
   * @returns {Promise<Array>} Gevonden producten
   */
  async searchCatalogProducts(searchTerm: string): Promise<CatalogProduct[]> {
    return contextProviders.searchCatalogProducts(searchTerm);
  }

  /**
   * Get relevante data context voor AI op basis van query
   * @param {string} userQuery - De gebruikersvraag
   * @returns {Promise<string>} Geformateerde context string
   */
  async getRelevantContext(userQuery: string) {
    try {
      let contextData = '';
      const queryStr = userQuery.toLowerCase();
      const entities = this.extractEntityTokens(userQuery);
      const scenario = this.parsePlanningScenario(userQuery);
      

      // ALTIJD eerst een compacte live snapshot toevoegen.
      try {
        contextData += await this.getOperationalSnapshotContext();
      } catch (err) {
        console.warn('Kon operationele snapshot niet toevoegen:', err);
      }

      // GEHEUGEN: Eerder geleerde feiten uit goedgekeurde antwoorden
      try {
        const memories = await this.getRelevantMemories(userQuery);
        if (memories.length > 0) {
          contextData += '\n\n## GELEERD GEHEUGEN (goedgekeurde antwoorden):\n';
          memories.forEach(mem => {
            contextData += `- **${mem.topic}**: ${mem.content}\n`;
          });
          contextData += '\n';
        }
      } catch (err) { console.warn('Kon geheugen niet laden voor context:', err); }

      // EERSTE: Probeer ALTIJD document context te vinden
      // Doe een brede zoekactie in alle documenten
      const docs = await this.searchAiDocuments(userQuery);
      
      if (docs.length > 0) {
        contextData += `\n\n${i18n.t("ai.context.relevant_docs", "📚 RELEVANTE DOCUMENTEN:")}\n`;
        contextData += '='.repeat(60) + '\n';

        docs.slice(0, 3).forEach((docItem, idx) => {
          contextData += `\n[Document ${idx + 1}]\n`;
          contextData += `Bestand: ${docItem.fileName || 'Onbekend'}\n`;
          if (docItem.analysis?.title) contextData += `Titel: ${docItem.analysis.title}\n`;
          if (docItem.analysis?.summary) contextData += `Samenvatting: ${docItem.analysis.summary}\n`;
          
          // Voeg fullContext toe als die beschikbaar is voor uitgebreidere informatie
          if (docItem.analysis?.fullContext) {
            contextData += `Volledige Context: ${docItem.analysis.fullContext}\n`;
          }
          
          if (docItem.analysis?.keyFacts?.length) contextData += `Kernpunten: ${docItem.analysis.keyFacts.join('; ')}\n`;
          if (docItem.analysis?.processes?.length) contextData += `Processen: ${docItem.analysis.processes.join('; ')}\n`;
          if (docItem.analysis?.partNumbers?.length) contextData += `Part Numbers: ${docItem.analysis.partNumbers.join(', ')}\n`;
          if (docItem.analysis?.tolerances?.length) contextData += `Toleranties: ${docItem.analysis.tolerances.join('; ')}\n`;
          if (docItem.analysis?.warnings?.length) contextData += `Waarschuwingen: ${docItem.analysis.warnings.join('; ')}\n`;
          if (docItem.analysis?.tags?.length) contextData += `Tags: ${docItem.analysis.tags.join(', ')}\n`;
          
          // Als fullText beschikbaar is, voeg een deel toe (max 5000 chars per document)
          if (docItem.fullText) {
            const textSnippet = docItem.fullText.slice(0, 5000);
            contextData += `\nDocument Text Excerpt:\n${textSnippet}\n`;
            if (docItem.fullText.length > 5000) {
              contextData += `... (${docItem.fullText.length - 5000} meer karakters beschikbaar)\n`;
            }
          }
        });

        contextData += '\n' + '='.repeat(60) + '\n';
      }
      
      // Controleer altijd op ordernummers of productie gerelateerde vragen
      const isOrderRelated = queryStr.includes('order') || 
                            queryStr.includes('n2') || 
                            queryStr.includes('status') ||
                            queryStr.includes('klaar') ||
                            queryStr.includes('gereed') ||
                            queryStr.includes('hoeveel') ||
                            queryStr.includes('productie') ||
                            queryStr.includes('progress') ||
                            queryStr.includes('nog') ||
                            queryStr.includes('gemaakt') ||
                            queryStr.includes('lot') ||
                            /\b\d{10,20}\b/.test(queryStr) ||
                            entities.orderIds.length > 0 ||
                            entities.lotIds.length > 0 ||
                            entities.codeTokens.length > 0;
      
      if (isOrderRelated || queryStr.includes('product')) {
        const orders = await this.searchProductionOrders(userQuery);
        
        if (orders.length > 0) {
          contextData += `\n\n${i18n.t("ai.context.prod_orders", "📦 PRODUCTIE ORDER INFORMATIE:")}\n`;
          contextData += '='.repeat(60) + '\n';
          
          orders.slice(0, 3).forEach((orderLike, idx) => {
            const order = orderLike as Record<string, unknown>;
            contextData += `\n[Order ${idx + 1}]\n`;
            contextData += `Ordernummer: ${String(order.orderId || order.orderNumber || order.id || 'N/A')}\n`;
            if (order.lotNumber) contextData += `Lotnummer: ${String(order.lotNumber)}\n`;

            if (order.name) contextData += `Product Naam: ${String(order.name)}\n`;
            if (order.sku) contextData += `SKU: ${String(order.sku)}\n`;
            if (order.description) contextData += `Beschrijving: ${String(order.description)}\n`;

            if (order.status) contextData += `Status: ${String(order.status)}\n`;
            if (order.workstation) contextData += `Werkstation: ${String(order.workstation)}\n`;
            if (order.operator) contextData += `Operator: ${String(order.operator)}\n`;

            if (order.quantity !== undefined) {
              contextData += `Total Hoeveelheid: ${String(order.quantity)} stuks\n`;
            }
            if (order.completed !== undefined) {
              contextData += `Afgerond: ${String(order.completed)} stuks\n`;
            }
            if (order.remaining !== undefined) {
              contextData += `Nog te doen: ${String(order.remaining)} stuks\n`;
            } else if (order.quantity && order.completed) {
              const remaining = Number(order.quantity) - Number(order.completed);
              contextData += `Nog te doen: ${remaining} stuks\n`;
            }

            if (order.progress !== undefined) {
              contextData += `Progress: ${String(order.progress)}%\n`;
            } else if (order.quantity && order.completed) {
              const percent = Math.round((Number(order.completed) / Number(order.quantity)) * 100);
              contextData += `Progress: ${percent}%\n`;
            }

            if (order.startDate) contextData += `Startdatum: ${String(order.startDate)}\n`;
            if (order.dueDate) contextData += `Vervaldatum: ${String(order.dueDate)}\n`;
            if (order.completedDate) contextData += `Voltooid op: ${String(order.completedDate)}\n`;

            if (order.specifications) contextData += `Specificaties: ${JSON.stringify(order.specifications)}\n`;
            if (order.tolerances) contextData += `Toleranties: ${JSON.stringify(order.tolerances)}\n`;

            if (order.qualityStatus) contextData += `Kwaliteit Status: ${String(order.qualityStatus)}\n`;
            if (order.defects) contextData += `Geconstateerde afwijkingen: ${String(order.defects)}\n`;
            if (order.notes) contextData += `Opmerkingen: ${String(order.notes)}\n`;

            Object.keys(order).forEach((key) => {
              if (!['id', 'orderId', 'orderNumber', 'lotNumber', 'name', 'sku', 'description', 'status', 'workstation',
                'operator', 'quantity', 'completed', 'remaining', 'progress', 'startDate',
                'dueDate', 'completedDate', 'specifications', 'tolerances', 'qualityStatus',
                'defects', 'notes'].includes(key)) {
                const value = order[key];
                if (value !== null && value !== undefined && value !== '') {
                  contextData += `${key}: ${JSON.stringify(value)}\n`;
                }
              }
            });
          });
          
          contextData += '\n' + '='.repeat(60) + '\n';
        } else {
          contextData += `\n\n${i18n.t("ai.context.no_orders_found", "⚠️ Geen productie orders gevonden in database voor:")} ${userQuery}\n`;
        }
      }

      // Vragen over meest recente lot / laatste activiteit
      const isRecentQuery = queryStr.includes('laatste') ||
                            queryStr.includes('recent') ||
                            queryStr.includes('nieuwste') ||
                            queryStr.includes('laats') ||
                            (queryStr.includes('lot') && (queryStr.includes('welk') || queryStr.includes('wat') || queryStr.includes('nummer')));

      if (isRecentQuery) {
        try {
          const recent = await this.getRecentProductionActivity(10);
          if (recent.length > 0) {
            contextData += `\n\n📋 RECENTSTE PRODUCTIE ACTIVITEIT:\n`;
            contextData += '='.repeat(60) + '\n';

            recent.slice(0, 5).forEach((itemLike, idx) => {
              const item = itemLike as Record<string, unknown>;
              contextData += `\n[Activiteit ${idx + 1}]\n`;
              const orderId = String(item.orderId || item.orderNumber || item.id || 'N/A');
              contextData += `Order: ${orderId}\n`;

              const lotNr = item.lotNumber || item.lot || item.batchNumber || item.batch || item.lotId;
              if (lotNr) contextData += `Lotnummer: ${String(lotNr)}\n`;

              const productName = item.name || item.productName || item.title || item.itemCode;
              if (productName) contextData += `Product: ${String(productName)}\n`;
              if (item.sku) contextData += `SKU: ${String(item.sku)}\n`;

              const ts = item.timestamp || item.createdAt || item.updatedAt || item.completedAt;
              if (ts) {
                const date = ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate?: unknown }).toDate === 'function'
                  ? (ts as { toDate: () => Date }).toDate().toLocaleString('nl-NL')
                  : new Date(String(ts)).toLocaleString('nl-NL');
                contextData += `Tijdstip: ${date}\n`;
              }

              if (item.status) contextData += `Status: ${String(item.status)}\n`;
              if (item.operator) contextData += `Operator: ${String(item.operator)}\n`;
              if (item.workstation || item.workcenter) contextData += `Werkstation: ${String(item.workstation || item.workcenter)}\n`;
            });

            contextData += '\n' + '='.repeat(60) + '\n';
          }
        } catch (err) {
          console.warn('Kon recente activiteit niet laden:', err);
        }
      }

      // Vragen over productie tijden / uren / efficiëntie
      const isTimeQuery = queryStr.includes('tijd') ||
                          queryStr.includes('uren') ||
                          queryStr.includes('uur') ||
                          queryStr.includes('effici') ||
                          queryStr.includes('hoelang') ||
                          queryStr.includes('duur') ||
                          queryStr.includes('cyclustijd') ||
                          queryStr.includes('bewerkingstijd') ||
                          queryStr.includes('instelttijd') ||
                          queryStr.includes('takt');

      if (isTimeQuery) {
        try {
          const times = await this.getProductionTimes(100);
          if (times.length > 0) {
            contextData += `\n\n⏱️ PRODUCTIE TIJDEN:\n`;
            contextData += '='.repeat(60) + '\n';

            times.slice(0, 10).forEach((itemLike, idx) => {
              const item = itemLike as Record<string, unknown>;
              contextData += `\n[Tijdregistratie ${idx + 1}]\n`;
              const productName = item.name || item.productName || item.itemCode || item.sku;
              if (productName) contextData += `Product: ${String(productName)}\n`;
              const orderId = String(item.orderId || item.orderNumber || item.id || 'N/A');
              contextData += `Order: ${orderId}\n`;
              if (item.workstation || item.workcenter) contextData += `Werkstation: ${String(item.workstation || item.workcenter)}\n`;
              if (item.operator) contextData += `Operator: ${String(item.operator)}\n`;
              if (item.duration !== undefined) contextData += `Duur: ${String(item.duration)} min\n`;
              if (item.setupTime !== undefined) contextData += `Instelttijd: ${String(item.setupTime)} min\n`;
              if (item.cycleTime !== undefined) contextData += `Cyclustijd: ${String(item.cycleTime)} sec\n`;
              if (item.totalTime !== undefined) contextData += `Totale tijd: ${String(item.totalTime)} min\n`;
              if (item.startTime) contextData += `Starttijd: ${String(item.startTime)}\n`;
              if (item.endTime) contextData += `Eindtijd: ${String(item.endTime)}\n`;
              if (item.quantity !== undefined) contextData += `Aantal: ${String(item.quantity)}\n`;
              if (item.efficiency !== undefined) contextData += `Efficiëntie: ${String(item.efficiency)}%\n`;
              const ts = item.timestamp || item.createdAt;
              if (ts) {
                const date = ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate?: unknown }).toDate === 'function'
                  ? (ts as { toDate: () => Date }).toDate().toLocaleString('nl-NL')
                  : new Date(String(ts)).toLocaleString('nl-NL');
                contextData += `Datum: ${date}\n`;
              }
              Object.keys(item).forEach((key) => {
                if (!['id', 'orderId', 'orderNumber', 'name', 'productName', 'itemCode', 'sku',
                       'workstation', 'workcenter', 'operator', 'duration', 'setupTime', 'cycleTime',
                       'totalTime', 'startTime', 'endTime', 'quantity', 'efficiency', 'timestamp',
                       'createdAt', 'source'].includes(key)) {
                  const value = item[key];
                  if (value !== null && value !== undefined && value !== '') {
                    contextData += `${key}: ${JSON.stringify(value)}\n`;
                  }
                }
              });
            });

            contextData += '\n' + '='.repeat(60) + '\n';
          }
        } catch (err) {
          console.warn('Kon productie tijden niet laden:', err);
        }
      }

      // Vragen over capaciteitsplanning, werkdruk, achterstand, inplannen
      const isCapacityQuery =
        queryStr.includes('werkuur') || queryStr.includes('werkuren') ||
        queryStr.includes('capaciteit') || queryStr.includes('werkdruk') ||
        queryStr.includes('inplannen') || queryStr.includes('inplan') ||
        queryStr.includes('achterstand') || queryStr.includes('achter') ||
        queryStr.includes('deadline') || queryStr.includes('klaar voor') ||
        queryStr.includes('klaar op') || queryStr.includes('hoeveel uur') ||
        queryStr.includes('beschikbaar') || queryStr.includes('vrije') ||
        queryStr.includes('passen') ||
        /\d+\s*(uur|werkuur|manuur)/i.test(userQuery) ||
        !!scenario;

      if (isCapacityQuery) {
        try {
          const capacityCtx = await this.getCapacityContext();
          contextData += capacityCtx;
        } catch (err) {
          console.warn('Kon capaciteitscontext niet laden:', err);
        }

        try {
          const predictiveCtx = await this.getPredictivePlanningContext(scenario);
          contextData += predictiveCtx;
        } catch (err) {
          console.warn('Kon voorspellende planning niet laden:', err);
        }
      }

      // Controleer op catalog/maten/toleranties vragen
      if (queryStr.includes('maat') || 
          queryStr.includes('tolerantie') ||
          queryStr.includes('diameter') ||
          queryStr.includes('lengte') ||
          queryStr.includes('catalog') ||
          queryStr.includes('spec') ||
          entities.codeTokens.length > 0 ||
          entities.dimensions.length > 0 ||
          entities.numericHints.length > 0) {
        const products = await this.searchCatalogProducts(userQuery);
        if (products.length > 0) {
          contextData += `\n\n${i18n.t("ai.context.catalog_info", "📋 CATALOGUS PRODUCT INFORMATIE:")}\n`;
          contextData += '='.repeat(60) + '\n';
          
          products.slice(0, 3).forEach((product, idx) => {
            contextData += `\n[Product ${idx + 1}]\n`;
            contextData += `Productnaam: ${product.name || product.sku}\n`;
            
            if (product.sku) contextData += `SKU: ${product.sku}\n`;
            if (product.description) contextData += `Beschrijving: ${product.description}\n`;
            
            // Maten
            if (product.diameter) contextData += `Diameter: ${product.diameter}mm\n`;
            if (product.length) contextData += `Lengte: ${product.length}mm\n`;
            if (product.width) contextData += `Breedte: ${product.width}mm\n`;
            if (product.height) contextData += `Hoogte: ${product.height}mm\n`;
            
            // Toleranties
            if (product.tolerance) contextData += `Tolerantie: ${JSON.stringify(product.tolerance)}\n`;
            if (product.toleranceRange) contextData += `Tolerantie Range: ${product.toleranceRange}\n`;
            
            // Specificaties
            if (product.specifications) {
              contextData += `Specificaties: ${JSON.stringify(product.specifications)}\n`;
            }
            
            // Stock informatie
            if (product.quantity !== undefined) contextData += `Beschikbare Hoeveelheid: ${product.quantity}\n`;
            if (product.minStock) contextData += `Min. Voorraad: ${product.minStock}\n`;
            if (product.reserved) contextData += `Gereserveerd: ${product.reserved}\n`;
          });
          
          contextData += '\n' + '='.repeat(60) + '\n';
        }
      }
      
      contextData = clamp(contextData, 7800);

      if (contextData.length > 100) { /* empty */ } else { /* empty */ }
      return contextData;
    } catch (error) {
      console.error('Error getting context:', error);
      return `\n\n${i18n.t("ai.context.error", "⚠️ Fout bij ophalen contextgegevens:")} ${getErrorMessage(error)}\n`;
    }
  }

  async getAvailableModel() {
    return this.availableModel;
  }

  async chat(messages: unknown[], systemPrompt: string | null = null, options = { /* empty */ }) {
    if (!this.isConfigured()) {
      throw new Error(i18n.t("gemini.api_disabled", "AI functionaliteit is uitgeschakeld."));
    }

    if (!auth.currentUser) {
      throw new Error(i18n.t("gemini.auth_required", "Je moet ingelogd zijn om AI te gebruiken."));
    }

    // Haal beschikbare model op
    const modelName = await this.getAvailableModel();

    try {
      return await this.chatGoogle(messages, systemPrompt || '', modelName, options);
    } catch (error) {
      console.error('AI Chat Error:', error);
      throw error;
    }
  }

  /**
   * Enhanced chat met automatische context van productie orders en catalogus
   * @param {Array} messages - Chat messages
   * @param {string} systemPrompt - System prompt
   * @param {boolean} includeContext - Include productie data context
   * @returns {Promise<string>} Response
   */
  async chatWithContext(messages: unknown[], systemPrompt: string | null = null, includeContext = true, options = { /* empty */ }) {
    if (!this.isConfigured()) {
      throw new Error('AI functionaliteit is uitgeschakeld');
    }

    let enhancedSystemPrompt = systemPrompt || '';

    if (includeContext && messages.length > 0) {
      const lastUserMessage = messages[messages.length - 1];
      if (
        lastUserMessage &&
        typeof lastUserMessage === 'object' &&
        'role' in lastUserMessage &&
        'content' in lastUserMessage &&
        (lastUserMessage as { role?: unknown }).role === 'user'
      ) {
        const content = (lastUserMessage as { content?: unknown }).content;
        const context = await this.getRelevantContext(typeof content === 'string' ? content : '');

        if (context && context.trim().length > 0) {
          enhancedSystemPrompt = this.composeSystemPrompt(enhancedSystemPrompt, context);
        }
      }
    }

    return this.chat(messages, enhancedSystemPrompt, options);
  }

  async chatGoogle(messages: unknown[], systemPrompt: string, modelName: string, options = { /* empty */ }) {
    try {
      const response = await (this.aiProxyGenerate as (payload: Record<string, unknown>) => Promise<unknown>)({
        messages,
        systemPrompt: systemPrompt || '',
        modelName,
      });

      const payload = response as { data?: { text?: string } } | undefined;
      const text = payload?.data?.text;
      if (!text) {
        throw new Error(i18n.t("gemini.no_answer", "Geen antwoord ontvangen van AI"));
      }

      return text;
    } catch (error: unknown) {
      console.error('AI proxy error:', error);

      const err = error as { code?: string; message?: string } | undefined;
      if (err?.code === 'resource-exhausted') {
        throw new Error(i18n.t("gemini.rate_limit", "Te veel AI aanvragen. Probeer het over een minuut opnieuw."));
      }

      if (err?.code === 'unauthenticated') {
        throw new Error(i18n.t("gemini.auth_required", "Je moet ingelogd zijn om AI te gebruiken."));
      }

      throw new Error(err?.message || i18n.t("gemini.proxy_error", "AI proxy request mislukt"));
    }
  }

  async askCopilot(query: string, history: unknown[] = []) {
    if (!this.isConfigured()) {
      throw new Error(i18n.t("gemini.api_disabled", "AI functionaliteit is uitgeschakeld."));
    }
    
    if (!auth.currentUser) {
      throw new Error(i18n.t("gemini.auth_required", "Je moet ingelogd zijn om AI te gebruiken."));
    }
    
    try {
      const response = await (this.askCopilotCallable as (payload: Record<string, unknown>) => Promise<unknown>)({
        query,
        history,
      });

      const payload = response as { data?: { success?: boolean; answer?: string; toolCalls?: unknown[] } } | undefined;
      
      if (!payload?.data?.success) {
        throw new Error(i18n.t("gemini.no_answer", "Geen geldig antwoord ontvangen van Copilot"));
      }

      return {
        answer: payload.data.answer,
        toolCalls: payload.data.toolCalls || []
      };
    } catch (error: unknown) {
      console.error('Copilot proxy error:', error);
      throw error;
    }
  }

  /**
   * Sla een geleerd feit op in het AI geheugen (Firestore)
   * Wordt opgeslagen wanneer de gebruiker een antwoord goedkeurt (thumbs up)
   */
  async saveMemory({ topic, content, sourceQuestion = "", sourceAnswer = "", userId = null, category = "approved_answer" }: Record<string, unknown>) {
    try {
      const safeTopic = typeof topic === 'string' ? topic : '';
      const safeContent = typeof content === 'string' ? content : '';
      const safeSourceQuestion = typeof sourceQuestion === 'string' ? sourceQuestion : '';
      const safeUserId = typeof userId === 'string' ? userId : null;
      const keywords = [...new Set([
        ...this.extractSearchTerms(safeTopic),
        ...this.extractSearchTerms(safeSourceQuestion),
      ])];
      await addDoc(collection(db, getPathString(PATHS.AI_MEMORY)), {
        category,
        topic: safeTopic,
        content: safeContent,
        sourceQuestion: safeSourceQuestion,
        sourceAnswer,
        userId: safeUserId,
        keywords,
        learnedAt: serverTimestamp(),
        useCount: 0,
        active: true,
      });
      await logActivity(
        safeUserId || 'system',
        'AI_MEMORY_SAVE',
        `AI memory opgeslagen: ${safeTopic || 'zonder onderwerp'}`
      );
    } catch (error) {
      console.error('Error saving AI memory:', error);
      throw error;
    }
  }

  /**
   * Laad relevante herinneringen op basis van de gebruikersvraag
   * Filtert client-side op keyword overlap
   */
  async getRelevantMemories(userQuery: string): Promise<AiMemory[]> {
    try {
      const memRef = collection(db, getPathString(PATHS.AI_MEMORY));
      const q = query(memRef, limit(60));
      const snap = await getDocs(q);
      const memories = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as AiMemory))
        .filter(m => m.active !== false);

      const terms = this.extractSearchTerms(userQuery);
      if (terms.length === 0) return [];

      return memories
        .filter(mem => {
          const haystack = `${mem.topic || ''} ${mem.content || ''} ${(mem.keywords || []).join(' ')}`.toLowerCase();
          return terms.some(t => haystack.includes(t));
        })
        .slice(0, 5);
    } catch (error) {
      console.error('Error fetching AI memories:', error);
      return [];
    }
  }

  /**
   * Sla de volledige gesprekgeschiedenis op per gebruiker (max 50 berichten)
   */
  async saveConversation({ userId, sessionId, messages }: Record<string, unknown>) {
    if (!userId || !sessionId) return;
    try {
      const safeUserId = typeof userId === 'string' ? userId : '';
      const safeSessionId = typeof sessionId === 'string' ? sessionId : '';
      if (!safeUserId || !safeSessionId) return;
      const conversationRef = doc(db, getPathString(PATHS.AI_CONVERSATIONS), safeSessionId);

      const safeMessages = Array.isArray(messages) ? messages : [];
      const toSave = safeMessages.slice(-50).map((m) => {
        const message = m as Record<string, unknown>;
        const role = typeof message.role === 'string' ? message.role : 'user';
        const content = typeof message.content === 'string' ? message.content : '';
        return {
          role,
          content: content.substring(0, 2000),
          timestamp: (message.timestamp as string | undefined) || new Date().toISOString(),
        };
      });

      await setDoc(conversationRef, {
        userId: safeUserId,
        messages: toSave,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await logActivity(
        safeUserId,
        'AI_CONVERSATION_SAVE',
        `AI conversatie opgeslagen (${toSave.length} berichten)`
      );
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }

  /**
   * Laad de meest recente gesprekgeschiedenis van een gebruiker
   * @returns {{ messages: Array, sessionId: string } | null}
   */
  async loadRecentConversation(userId: string) {
    if (!userId) return null;
    try {
      const q = query(
        collection(db, getPathString(PATHS.AI_CONVERSATIONS)),
        where('userId', '==', userId),
        orderBy('updatedAt', 'desc'),
        limit(1)
      );
      
      const snap = await getDocs(q);
      if (snap.empty) return null;
      
      const docData = snap.docs[0];
      return { sessionId: docData.id, ...docData.data() };
    } catch (error) {
      console.error('Error loading conversation:', error);
      return null;
    }
  }

  async generateFlashcards(topic: string, systemPrompt: string | undefined) {
    const messages = [
      {
        role: 'user',
        content: `Generate educational flashcards about: ${topic}. Return ONLY valid JSON in the format specified in the system prompt.`,
      },
    ];

    const response = await this.chat(messages, systemPrompt || '');
    
    // Try to parse JSON from response
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      return JSON.parse(cleanedResponse);
    } catch (error) {
      console.error('Failed to parse flashcard JSON:', error);
      throw new Error(i18n.t("ai.flashcard_error", "AI returned invalid flashcard format"), { cause: error });
    }
  }
}

export const aiService = new AIService();
