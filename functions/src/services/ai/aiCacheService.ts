import * as admin from 'firebase-admin';
import { aiEmbeddingsService } from './aiEmbeddingsService';

export class AiCacheService {
  /**
   * Zoekt in de cache naar een eerdere soortgelijke vraag.
   * Retourneert de response als we een match > 0.95 (cosine similarity) vinden.
   */
  async checkCache(query: string, queryVector: number[]): Promise<any | null> {
    try {
      const db = admin.firestore();
      // Omdat we in Firebase geen native vector search index vereisen voor deze MVP,
      // kunnen we een tijdgebonden query doen om te zoeken in recente vragen.
      // Echter, als we echt schalen, moeten we de Gemini Vector API of Firestore Vector Search inschakelen.
      // Voor nu filteren we de laatste 1000 vragen in het geheugen.
      
      const cacheRef = db.collection('future-factory/settings/ai_cache');
      // Haal maximaal de laatste 200 opgeslagen vragen op om door te zoeken (in-memory cosine sim)
      const snap = await cacheRef.orderBy('createdAt', 'desc').limit(200).get();
      
      let bestMatch: any = null;
      let highestScore = 0;

      snap.forEach(doc => {
        const data = doc.data();
        if (data.embedding && Array.isArray(data.embedding)) {
          const score = aiEmbeddingsService.cosineSimilarity(queryVector, data.embedding);
          if (score > highestScore) {
            highestScore = score;
            bestMatch = data;
          }
        }
      });

      // Semantic Cache threshold: 0.95 similarity = vrijwel identieke vraag
      if (highestScore >= 0.95 && bestMatch) {
        console.log(`Cache HIT voor vraag: "${query}" (score: ${highestScore})`);
        return bestMatch.response;
      }
      
      return null;
    } catch (e) {
      console.error("Fout in semantic cache check:", e);
      return null; // Bij cache falen gaan we gewoon door naar de dure LLM call
    }
  }

  /**
   * Slaat een succesvol antwoord op in de semantic cache.
   */
  async saveToCache(query: string, queryVector: number[], response: any): Promise<void> {
    try {
      const db = admin.firestore();
      const cacheRef = db.collection('future-factory/settings/ai_cache');
      
      await cacheRef.add({
        query,
        embedding: queryVector,
        response,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error("Fout bij opslaan in semantic cache:", e);
    }
  }
}

export const aiCacheService = new AiCacheService();
