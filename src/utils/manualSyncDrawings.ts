import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../config/firebase";
import i18n from "../i18n";

type ProductMatch = {
  id: string;
  name?: string;
  [key: string]: unknown;
};

type SyncResultItem = {
  code: string;
  found: boolean;
  product?: string;
  saved?: boolean;
  fullProduct?: ProductMatch;
  sourceFields: string[];
  viaConversion?: boolean;
  removed?: boolean;
  conversionTarget?: string | null;
};

type SyncProgressCallback = (current: number, total: number, results: SyncResultItem[]) => void;

/**
 * Triggert de Cloud Function 'manualSyncDrawings' om overeenkomsten tussen Planning items en Product Catalogus
 * te zoeken en in de Conversion Matrix op te slaan.
 */
export const manualSyncDrawings = async (onProgress?: SyncProgressCallback): Promise<SyncResultItem[]> => {
  try {
    // Aangezien dit nu via de backend loopt, hebben we geen actieve progress per item meer, 
    // we laten de teller tijdelijk op 'bezig' staan en vullen alles in als het klaar is.
    if (onProgress) {
        onProgress(0, 1, []);
    }

    const functions = getFunctions(app, "europe-west1");
    const syncDrawingsFn = httpsCallable<void, { success: boolean, results: SyncResultItem[], savedCount: number }>(functions, "manualSyncDrawings");
    
    const response = await syncDrawingsFn();
    const data = response.data;
    
    if (onProgress && data.results) {
        onProgress(data.results.length, data.results.length, data.results);
    }

    return data.results || [];
  } catch (error) {
    console.error(i18n.t("manualsync.error", "Manual Sync Error:"), error);
    throw error;
  }
};