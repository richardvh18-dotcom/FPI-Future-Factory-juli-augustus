import { VertexAI, GenerateContentRequest } from '@google-cloud/vertexai';
import * as admin from 'firebase-admin';
import { copilotFunctionDeclarations, copilotToolImplementations } from './aiCopilotTools';
import { aiCacheService } from './aiCacheService';
import { aiEmbeddingsService } from './aiEmbeddingsService';

export class AiCopilotService {
  private modelName: string;
  private vertexAi?: VertexAI;

  constructor() {
    this.modelName = 'gemini-2.5-flash';
  }

  private getVertexAi(): VertexAI {
    if (!this.vertexAi) {
      let projectId = process.env.GCLOUD_PROJECT;
      if (!projectId && process.env.FIREBASE_CONFIG) {
          try {
              projectId = JSON.parse(process.env.FIREBASE_CONFIG).projectId;
          } catch (e) {
              projectId = 'fpi-future-factory';
          }
      }
      this.vertexAi = new VertexAI({ project: projectId || 'fpi-future-factory', location: 'europe-west1' });
    }
    return this.vertexAi;
  }

  async buildDynamicSystemInstruction(): Promise<string> {
    try {
      const db = admin.firestore();
      const rulesSnap = await db.collection('future-factory/settings/ai_factory_rules')
        .where('isActive', '==', true)
        .get();

      let dynamicRules = "";
      rulesSnap.forEach(doc => {
        dynamicRules += `- ${doc.data().rule}\n`;
      });

      const today = new Date().toISOString().split('T')[0];
      const baseInstruction = `Je bent de Future Factory Plant Manager Copilot. Vandaag is het ${today}. Houd je strikt aan deze actuele fabrieksregels:
- Wanneer een gebruiker (Operator of Teamleader) vraagt om een "Overzicht" voor een machine, roep dan getHistoricalProduction aan (voor gisteren) EN searchPlanningOrders (voor de actuele lijst) en som overzichtelijk de ordernummers en omschrijvingen op.\n`;
      
      return baseInstruction + dynamicRules;
    } catch (e) {
      console.warn("Failed to build dynamic rules:", e);
      return "Je bent de Future Factory Plant Manager Copilot. Beantwoord vragen bondig en feitelijk gebaseerd op de tools.";
    }
  }

  async askCopilot(query: string, history: any[] = [], role: string = 'operator'): Promise<any> {
    // 1. Semantic Cache Check (Cost Control)
    let queryVector: number[] = [];
    try {
      queryVector = await aiEmbeddingsService.getEmbedding(query);
      const cachedResponse = await aiCacheService.checkCache(query, queryVector);
      if (cachedResponse) {
        return cachedResponse;
      }
    } catch (e) {
      console.warn("Kon cache niet checken, we vallen terug op live generatie:", e);
    }

    let allowedDeclarations = copilotFunctionDeclarations;
    
    // RBAC: Operators krijgen alleen relevante informatie voor de vloer.
    if (role === 'operator' || role === 'standard') {
      allowedDeclarations = copilotFunctionDeclarations.filter(t => 
        ['searchKnowledgeBase', 'searchProductCatalog', 'searchPlanningOrders', 'searchToolingMolds', 'searchGlassRules', 'getHistoricalProduction'].includes(t.name)
      );
    }
    // teamleader, planner, admin, engineer krijgen momenteel alle beschikbare tools
    
    const generativeModel = this.getVertexAi().getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: 0.2,
      },
      tools: [{ functionDeclarations: allowedDeclarations }]
    });

    const systemInstruction = await this.buildDynamicSystemInstruction();

    const chatSession = generativeModel.startChat({
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      history: history,
      tools: [{ functionDeclarations: allowedDeclarations }]
    });

    try {
        const result = await chatSession.sendMessage(query);
        const response = result.response;
        
        // Check if the model wants to call a function
        if (response.candidates && response.candidates[0].content.parts) {
        const parts = response.candidates[0].content.parts;
        const functionCalls = parts.filter(p => p.functionCall);
        
        if (functionCalls.length > 0) {
            // Collect function responses
            const functionResponses: any[] = [];
            const toolCallsInfo: any[] = [];

            for (const call of functionCalls) {
            const fnCall = call.functionCall!;
            const fnName = fnCall.name;
            const fnArgs = fnCall.args;
            
            if (fnName in copilotToolImplementations) {
                toolCallsInfo.push({ name: fnName, args: fnArgs });
                // @ts-ignore
                const res = await copilotToolImplementations[fnName](fnArgs);
                functionResponses.push({
                functionResponse: {
                    name: fnName,
                    response: { name: fnName, content: res }
                }
                });
            }
            }
            
            if (functionResponses.length > 0) {
            // Send function responses back to the model
            const followUpResult = await chatSession.sendMessage(functionResponses);
            const followUpText = followUpResult.response.candidates?.[0]?.content.parts?.[0]?.text || "Er is een fout opgetreden na het ophalen van data.";
            
            const finalResult = {
                answer: followUpText,
                toolCalls: toolCallsInfo
            };
            if (queryVector.length > 0) {
              await aiCacheService.saveToCache(query, queryVector, finalResult);
            }
            return finalResult;
            }
        }
        }

        const text = response.candidates?.[0]?.content.parts?.[0]?.text || "Ik kon geen antwoord genereren.";
        const finalResult = {
        answer: text,
        toolCalls: []
        };
        if (queryVector.length > 0) {
          await aiCacheService.saveToCache(query, queryVector, finalResult);
        }
        return finalResult;
    } catch (e: any) {
        console.error("Copilot Error:", e);
        throw e;
    }
  }
}

export const aiCopilotService = new AiCopilotService();
