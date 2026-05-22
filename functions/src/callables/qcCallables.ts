import * as functions from "firebase-functions";
import { withAudit } from "../utils/withAudit";
import { saveQcMeasurementService, saveQcInspectionService } from "../services/qcService";

export const saveQcMeasurement = functions.https.onCall(
  withAudit("QC_MEASUREMENT_ADD", async (data: any, context: any) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Gebruiker is niet ingelogd.");
    }
    if (!data.lotNumber || (data.brix === null && data.tg === null)) {
      throw new functions.https.HttpsError("invalid-argument", "Vul een geldig lotnummer en minimaal Brix of Tg in.");
    }
    return await saveQcMeasurementService(data);
  })
);

export const saveQcInspection = functions.https.onCall(
  withAudit("QC_INSPECTION_ADD", async (data: any, context: any) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Gebruiker is niet ingelogd.");
    }
    if (!data.lotNumber || !data.result) {
      throw new functions.https.HttpsError("invalid-argument", "Ontbrekende verplichte velden.");
    }
    return await saveQcInspectionService(data);
  })
);