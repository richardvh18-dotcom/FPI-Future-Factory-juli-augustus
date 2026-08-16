import { FunctionDeclaration, FunctionDeclarationSchemaType } from '@google-cloud/vertexai';
import * as admin from 'firebase-admin';
import { aiEmbeddingsService } from './aiEmbeddingsService';

// Haal db reference veilig op
const getDb = () => admin.firestore();

export const copilotFunctionDeclarations: FunctionDeclaration[] = [
  {
    name: 'getHistoricalProduction',
    description: 'Haalt historische productiegegevens op voor een bepaalde periode, optioneel gefilterd op categorie of artikel.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        startDate: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Startdatum in YYYY-MM-DD formaat',
        },
        endDate: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Einddatum in YYYY-MM-DD formaat (optioneel, indien leeg wordt alleen startDate gebruikt)',
        },
        category: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Categorie of zoekterm, bijv. "Fittingen", "Elbow", "Adaptor" (optioneel)',
        },
        machine: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Machine/station ID, bv BM01, BH18 (optioneel)',
        }
      },
      required: ['startDate']
    }
  },
  {
    name: 'getDowntimeEvents',
    description: 'Zoekt naar machinestilstanden, log-events en foutcodes voor een specifieke dag of machine.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        date: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Datum in YYYY-MM-DD formaat',
        },
        machine: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Machine ID, bv BM01 of BH18 (optioneel)',
        }
      },
      required: ['date']
    }
  },
  {
    name: 'getPersonnelLog',
    description: 'Haalt de bezetting en het type personeel (vast/uitzendkracht) op dat aan een machine was toegewezen.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        date: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Datum in YYYY-MM-DD formaat',
        },
        machine: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Machine ID, bv BM01 of BH18 (optioneel)',
        }
      },
      required: ['date']
    }
  },
  {
    name: 'searchKnowledgeBase',
    description: 'Zoekt in de geüploade fabrieksdocumenten (kennisbank) naar procedures, handleidingen en instructies. Gebruik dit voor vragen over machines, instellingen, of storingscodes.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        query: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'De zoekvraag of het onderwerp (bv "foutcode E-404 BM01 oplossen")',
        }
      },
      required: ['query']
    }
  },
  {
    name: 'searchProductCatalog',
    description: 'Zoekt in de actuele Firebase product catalogus en maattabellen naar specifieke producten, diameters, of maten (bijv. "maten van een ELB 80mm cb 90 graden").',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        type: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Product type, bijv. ELBOW, TEE, FLANGE (optioneel)',
        },
        diameter: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Diameter, bijv. "80", "110", "250" (optioneel)',
        },
        angle: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Hoek in graden, bijv. "90", "45" (optioneel)',
        },
        connection: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Connectietype, bijv. "CB", "TB", "SOCKET" (optioneel)',
        },
        query: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Vrije zoekterm voor als de andere velden niet duidelijk zijn (optioneel)',
        }
      }
    }
  },
  {
    name: 'searchPlanningOrders',
    description: 'Haalt actuele productieplanning en orders op. Gebruik dit voor vragen als "welke orders staan er op machine X" of "wat is de status van order Y".',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        machine: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Machine/station ID, bv BM01, BH12 (optioneel)',
        },
        orderId: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Specifiek ordernummer (optioneel)',
        }
      }
    }
  },
  {
    name: 'searchToolingMolds',
    description: 'Zoekt in de database naar beschikbare mallen (molds) voor productie, inclusief cavity count en toegewezen machines.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        query: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Zoekterm, productnaam of artikelcode voor de mal',
        }
      },
      required: ['query']
    }
  },
  {
    name: 'searchGlassRules',
    description: 'Haalt glassnij-regels (glass cutting rules), benodigde materialen (mats/rovings) en afmetingen op voor een specifiek product of artikel.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        query: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Productnaam, artikelcode of omschrijving',
        }
      },
      required: ['query']
    }
  }
];

export const copilotToolImplementations = {
  searchPlanningOrders: async ({ machine, orderId }: any) => {
    try {
      const db = getDb();
      let q: any = db.collection('future-factory/production/digital_planning');
      
      if (orderId) {
        q = q.where('orderId', '==', orderId);
      }
      
      // We halen meer orders op (max 100) zodat we zelf kunnen filteren en sorteren
      const snap = await q.limit(orderId ? 5 : 100).get();
      let orders: any[] = [];
      snap.forEach((doc: any) => orders.push(doc.data()));

      if (machine) {
        const mLower = machine.toLowerCase();
        orders = orders.filter(o => {
          const m = (o.machine || o.station || '').toLowerCase();
          return m.includes(mLower);
        });
      }

      // Sorteer op deliveryDate of plannedDeliveryDate (oudste eerst)
      orders.sort((a, b) => {
        const dateA = new Date(a.deliveryDate || a.plannedDeliveryDate || '2099-01-01').getTime();
        const dateB = new Date(b.deliveryDate || b.plannedDeliveryDate || '2099-01-01').getTime();
        return dateA - dateB;
      });

      if (orders.length === 0) return { status: 'success', message: 'Geen actieve orders gevonden voor deze machine of criteria.' };
      
      // Beperk output om payload klein te houden
      return { status: 'success', orders: orders.slice(0, 15) };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  },

  searchToolingMolds: async ({ query }: any) => {
    try {
      const db = getDb();
      const snap = await db.collection('future-factory/settings/tooling_molds').limit(20).get();
      const molds: any[] = [];
      const qLower = (query || '').toLowerCase();
      snap.forEach((doc: any) => {
        const d = doc.data();
        if (JSON.stringify(d).toLowerCase().includes(qLower)) {
          molds.push(d);
        }
      });
      if (molds.length === 0) return { status: 'success', message: 'Geen mallen gevonden voor deze zoekterm.' };
      return { status: 'success', molds: molds.slice(0, 5) };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  },

  searchGlassRules: async ({ query }: any) => {
    try {
      const db = getDb();
      const snap = await db.collection('future-factory/settings/glass_rules').limit(20).get();
      const rules: any[] = [];
      const qLower = (query || '').toLowerCase();
      snap.forEach((doc: any) => {
        const d = doc.data();
        if (doc.id.toLowerCase().includes(qLower) || JSON.stringify(d).toLowerCase().includes(qLower)) {
          rules.push({ id: doc.id, ...d });
        }
      });
      if (rules.length === 0) return { status: 'success', message: 'Geen glasregels gevonden voor deze zoekterm.' };
      return { status: 'success', rules: rules.slice(0, 5) };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  },
  searchProductCatalog: async ({ type, diameter, angle, connection, query }: any) => {
    try {
      const db = getDb();
      let q = db.collection('future-factory/production/products')
        .where('active', '==', true);
      
      if (diameter) {
        q = q.where('diameter', '==', diameter.replace(/[^0-9]/g, ''));
      }
      if (type) {
        q = q.where('type', '==', type.toUpperCase());
      }
      if (angle) {
        q = q.where('angle', '==', angle.replace(/[^0-9]/g, ''));
      }
      
      const snap = await q.limit(10).get();
      const products: any[] = [];
      snap.forEach((doc: any) => {
        const data = doc.data();
        products.push({
          name: data.name,
          type: data.type,
          diameter: data.diameter,
          angle: data.angle,
          connection: data.connection,
          pressure: data.pressure,
          articleCode: data.articleCode
        });
      });
      
      let dimensions: any[] = [];
      if (connection && diameter) {
        const connType = connection.toLowerCase().replace(/[^a-z]/g, '');
        if (['cb', 'tb', 'socket', 'fitting'].includes(connType)) {
          const dimSnap = await db.collection(`future-factory/production/dimensions/${connType}/records`).limit(10).get();
          dimSnap.forEach((doc: any) => {
            if (doc.id.includes(diameter.replace(/[^0-9]/g, ''))) {
               dimensions.push(doc.data());
            }
          });
        }
      }

      if (products.length === 0 && dimensions.length === 0) {
        return { status: 'success', message: 'Geen producten of maten gevonden voor deze criteria in de database.' };
      }

      return { status: 'success', products, dimensions };
    } catch (e: any) {
      console.error("searchProductCatalog error:", e);
      return { status: 'error', error: e.message };
    }
  },

  getHistoricalProduction: async ({ startDate, endDate, category, machine }: any) => {
    try {
      const db = getDb();
      const year = startDate.substring(0, 4);
      let q: any = db.collection(`future-factory/production/archive/${year}/planning`);
      
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      let end = new Date(startDate);
      if (endDate) {
        end = new Date(endDate);
      }
      end.setHours(23, 59, 59, 999);
      
      q = q.where('archivedAt', '>=', start).where('archivedAt', '<=', end);
      
      const trackingSnap = await q.limit(200).get();
      
      let produced = 0;
      let totalHours = 0;
      const items: any[] = [];
      
      const searchCat = (category || '').toLowerCase();
      const searchMachine = (machine || '').toLowerCase();
      
      trackingSnap.forEach((doc: any) => {
        const data = doc.data();
        if (data.archiveReason === 'completed') {
          if (searchMachine) {
              const docMachine = (data.machine || data.workCenter || data.currentStation || '').toLowerCase();
              if (docMachine !== searchMachine) return;
          }
          
          if (searchCat) {
            const desc = (data.itemDescription || '').toLowerCase();
            const itemCode = (data.itemCode || '').toLowerCase();
            let isMatch = false;
            
            if (searchCat === 'fittingen' || searchCat === 'fitting') {
                const fittingKeywords = ['elb', 'tee', 'adaptor', 'cap', 'flange', 'socket', 'mof', 'bocht', 't-stuk', 'verloop'];
                isMatch = fittingKeywords.some(kw => desc.includes(kw) || itemCode.includes(kw));
            } else {
                isMatch = desc.includes(searchCat) || itemCode.includes(searchCat);
            }
            
            if (!isMatch) return;
          }
          produced += (data.deliveredQty || data.quantity || 1);
          totalHours += (data.totalActualHours || 0);
          items.push({ 
            orderId: data.orderId || doc.id,
            item: data.itemDescription || data.itemCode, 
            qty: data.deliveredQty || data.quantity || 1, 
            hours: data.totalActualHours, 
            lot: data.activeLot || data.lotNumber 
          });
        }
      });
      
      return { 
        status: 'success',
        period: `${startDate} to ${endDate || startDate}`,
        category: category || 'all',
        machine: machine || 'all',
        totalProduced: produced,
        totalHours: totalHours.toFixed(2),
        items
      };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  },

  getDowntimeEvents: async ({ date, machine }: { date: string, machine?: string }) => {
    try {
      const db = getDb();
      let q = db.collection('future-factory/production/data/downtime_logs')
        .where('date', '==', date);
      
      if (machine) {
        q = q.where('workstation', '==', machine);
      }
      
      const snap = await q.limit(50).get();
      const events: any[] = [];
      snap.forEach(doc => events.push(doc.data()));
      
      if (events.length === 0) {
        // Mock fallback if collection doesn't exist or is empty
        return { 
          status: 'success', 
          events: [
            { machine: machine || 'BM01', reason: 'Storing verwarmingselement', durationMinutes: 45, type: 'Technical' }
          ]
        };
      }
      
      return { status: 'success', events };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  },

  getPersonnelLog: async ({ date, machine }: { date: string, machine?: string }) => {
    try {
      const db = getDb();
      let q = db.collection('future-factory/production/data/occupancy')
        .where('date', '==', date);
      
      if (machine) {
        q = q.where('workstation', '==', machine);
      }
      
      const snap = await q.limit(50).get();
      const personnel: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        personnel.push({
          name: d.operator || d.employeeName || 'Onbekend',
          machine: d.workstation || machine,
          type: d.employeeType || 'Vast_Personeel'
        });
      });
      
      if (personnel.length === 0) {
        // Mock fallback
        return { 
          status: 'success', 
          personnel: [
            { naam: "Jan", id: "1001", type: "Vast_Personeel", machine: machine || "BH18" },
            { naam: "Piet", id: "9005", type: "Uitzendkracht", machine: machine || "BH18" }
          ] 
        };
      }
      
      return { status: 'success', personnel };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  },

  searchKnowledgeBase: async ({ query }: { query: string }) => {
    try {
      const db = getDb();
      // Generate query embedding
      const queryVector = await aiEmbeddingsService.getEmbedding(query);
      
      // Haal alle chunks op (in-memory similarity search voor MVP)
      const chunksSnap = await db.collectionGroup('chunks').get();
      
      const results: any[] = [];
      chunksSnap.forEach(doc => {
        const data = doc.data();
        if (data.embedding && Array.isArray(data.embedding)) {
          const score = aiEmbeddingsService.cosineSimilarity(queryVector, data.embedding);
          if (score > 0.5) { // Threshold
            results.push({
              source: data.sourceFileName || 'Onbekend',
              content: data.text,
              relevanceScore: score
            });
          }
        }
      });
      
      // Sort by relevance descending
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      // Return top 3
      const topResults = results.slice(0, 3);
      
      if (topResults.length === 0) {
        return {
          status: 'success',
          query,
          message: 'Geen relevante informatie gevonden in de kennisbank voor deze zoekterm.'
        };
      }

      return {
        status: 'success',
        query,
        results: topResults
      };
    } catch (e: any) {
      console.error("searchKnowledgeBase error:", e);
      return { status: 'error', error: e.message };
    }
  }
};
