import { onCall, HttpsError } from "firebase-functions/v2/https";
import { saveQcMeasurementService, saveQcInspectionService, updateQcMeasurementService } from "../services/qcService";

// resolveUserRoleForContext is CommonJS-exported in this codebase.
const { resolveUserRoleForContext } = require("../auth/resolveUserRole");

const toHttpsError = (error: unknown, fallbackMessage: string): HttpsError => {
  if (error instanceof HttpsError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error || fallbackMessage);
  const lower = message.toLowerCase();

  if (lower.includes("niet gevonden") || lower.includes("lotnummer")) {
    return new HttpsError("failed-precondition", message);
  }

  return new HttpsError("internal", fallbackMessage);
};

export const saveQcMeasurement = onCall(async (request) => {
  const data = request.data as any;

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Gebruiker is niet ingelogd.");
  }

  if (!data?.lotNumber || (data.brix === null && data.tg === null)) {
    throw new HttpsError("invalid-argument", "Vul een geldig lotnummer en minimaal Brix of Tg in.");
  }

  try {
    return await saveQcMeasurementService(data);
  } catch (error) {
    throw toHttpsError(error, "QC meting opslaan is mislukt.");
  }
});

export const saveQcInspection = onCall(async (request) => {
  const data = request.data as any;

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Gebruiker is niet ingelogd.");
  }

  if (!data?.lotNumber || !data.result) {
    throw new HttpsError("invalid-argument", "Ontbrekende verplichte velden.");
  }

  try {
    return await saveQcInspectionService(data);
  } catch (error) {
    throw toHttpsError(error, "QC inspectie opslaan is mislukt.");
  }
});

export const updateQcMeasurement = onCall(async (request) => {
  const data = request.data as any;

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Gebruiker is niet ingelogd.");
  }

  const userRole = String(await resolveUserRoleForContext({ auth: request.auth }) || "").toLowerCase();
  if (userRole !== "admin") {
    throw new HttpsError("permission-denied", "Alleen admins mogen QC metingen bewerken.");
  }

  if (!data?.measurementId) {
    throw new HttpsError("invalid-argument", "measurementId is verplicht.");
  }

  try {
    return await updateQcMeasurementService(data);
  } catch (error) {
    throw toHttpsError(error, "QC meting bewerken is mislukt.");
  }
});