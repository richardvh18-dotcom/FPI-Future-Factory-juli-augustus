import * as functions from 'firebase-functions/v1';
import { aiCopilotService } from '../services/ai/aiCopilotService';
import { aiEmbeddingsService } from '../services/ai/aiEmbeddingsService';
import { aiUsageTracker } from '../services/ai/aiUsageTracker';
import { validateCallableData } from '../utils/validatedCallable';
import { copilotCallableSchema, embeddingsCallableSchema } from '../utils/callableSchemas';

/**
 * HTTPS Callable for the Agentic Copilot
 * Clients send a query (and optionally chat history)
 * The Copilot Agent Loop executes, returning the final answer and any tools it called.
 */
export const askCopilot = functions
  .region('europe-west1')
  .runWith({
    timeoutSeconds: 120, // Copilot might take longer with multiple function calls
    memory: '1GB'
  })
  .https.onCall(async (rawData: unknown, context: functions.https.CallableContext) => {
    // 1. Check Authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Je moet ingelogd zijn om de Copilot te gebruiken.'
      );
    }

    try {
      const { query, history } = validateCallableData(copilotCallableSchema, rawData);

      if (!query || typeof query !== 'string') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Een geldige query is vereist.'
        );
      }

      const role = context.auth.token.role as string || 'operator';
      const uid = context.auth.uid;

      // Rate Limiting check
      try {
        await aiUsageTracker.checkQuota(uid, role);
      } catch (quotaError: any) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          quotaError.message
        );
      }

      // 2. Call the Copilot Service
      const result = await aiCopilotService.askCopilot(query, history || [], role);

      // Log successful usage
      await aiUsageTracker.logUsage(uid, query, role);

      return {
        success: true,
        answer: result.answer,
        toolCalls: result.toolCalls
      };
    } catch (error: any) {
      console.error('askCopilot error:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Fout bij het verwerken van de Copilot aanvraag.',
        error.message
      );
    }
  });

/**
 * HTTPS Callable om document embeddings the genereren na upload
 */
export const generateDocumentEmbeddings = functions
  .region('europe-west1')
  .runWith({
    timeoutSeconds: 300, // Kan lang duren voor grote PDFs
    memory: '1GB'
  })
  .https.onCall(async (rawData: unknown, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Je moet ingelogd zijn.'
      );
    }

    try {
      const { docId, fullText, fileName } = validateCallableData(embeddingsCallableSchema, rawData);

      if (!docId || !fullText) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Ontbrekende parameters (docId, fullText).'
        );
      }

      await aiEmbeddingsService.indexDocument(docId, fullText, { fileName });

      return { success: true };
    } catch (error: any) {
      console.error('generateDocumentEmbeddings error:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Fout bij het genereren van embeddings.',
        error.message
      );
    }
  });
