import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import * as admin from 'firebase-admin';

export class AiEmbeddingsService {
  private vertexAi?: VertexAI;

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

  /**
   * Splits a large text into smaller chunks of approximately `chunkSize` characters,
   * trying to break at paragraphs or sentences.
   */
  chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    if (!text) return [];
    
    // Simpele chunking logic (kan later intelligenter met zinsherkenning)
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const word of words) {
      if (currentChunk.length + word.length > chunkSize) {
        chunks.push(currentChunk.trim());
        // Start next chunk with the last few words to create overlap
        const previousWords = currentChunk.split(/\s+/);
        const overlapWords = previousWords.slice(-Math.floor(overlap / 5)); // Approx words
        currentChunk = overlapWords.join(" ") + " " + word + " ";
      } else {
        currentChunk += word + " ";
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Generates a vector embedding for a given text using Vertex AI REST API.
   */
  async getEmbedding(text: string): Promise<number[]> {
    try {
      let projectId = process.env.GCLOUD_PROJECT;
      if (!projectId && process.env.FIREBASE_CONFIG) {
          try {
              projectId = JSON.parse(process.env.FIREBASE_CONFIG).projectId;
          } catch (e) {
              projectId = 'future-factory-377ef';
          }
      }
      projectId = projectId || 'future-factory-377ef';
      const location = 'europe-west1';
      
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const token = tokenResponse.token;
      
      const response = await fetch(`https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-004:predict`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instances: [
            { content: text }
          ]
        })
      });
      
      const data = await response.json() as any;
      if (!response.ok) {
        throw new Error(`Embedding API error: ${JSON.stringify(data)}`);
      }
      return data.predictions[0].embeddings.values;
    } catch (e) {
      console.error("Failed to generate embedding:", e);
      throw new Error("Embedding generation failed.");
    }
  }

  /**
   * Generates embeddings for all chunks of a document and saves them in Firestore
   * under a `chunks` subcollection.
   */
  async indexDocument(docId: string, fullText: string, metadata: any = {}) {
    const db = admin.firestore();
    const docRef = db.collection('future-factory/settings/ai_documents/knowledge/records').doc(docId);
    
    const chunks = this.chunkText(fullText);
    const chunksCol = docRef.collection('chunks');
    
    console.log(`Indexing document ${docId}: generated ${chunks.length} chunks.`);

    let chunkIndex = 0;
    for (const chunk of chunks) {
      try {
        const embedding = await this.getEmbedding(chunk);
        
        await chunksCol.doc(`chunk_${chunkIndex}`).set({
          chunkIndex,
          text: chunk,
          embedding, // Sla de raw number[] array op
          documentId: docId,
          sourceFileName: metadata.fileName || 'Onbekend Document',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        chunkIndex++;
      } catch (e) {
        console.error(`Failed to index chunk ${chunkIndex} for doc ${docId}`, e);
      }
    }
    
    // Update parent doc om aan te geven dat indexering klaar is
    await docRef.update({
      isIndexed: true,
      indexedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Calculates the cosine similarity between two vectors.
   * Returns a value between -1 and 1.
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const aiEmbeddingsService = new AiEmbeddingsService();
