import { getFirestore, FieldValue } from "firebase-admin/firestore";

const normalizeDepartmentName = (department?: string): string => {
  const value = String(department || "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (lower === "fittings") return "Fittings";
  if (lower === "spoolbouw") return "Spoolbouw";
  if (lower === "buizen") return "Buizen";

  return value;
};

const resolveTrackedRef = async (db: FirebaseFirestore.Firestore, payload: any) => {
  if (!payload?.lotNumber) return null;

  const lotUpper = String(payload.lotNumber).trim().toUpperCase();

  if (payload.trackedProductPath) {
    const explicitRef = db.doc(String(payload.trackedProductPath));
    const explicitSnap = await explicitRef.get();
    if (explicitSnap.exists) {
      return explicitRef;
    }
  }

  const rootTrackingQuery = await db
    .collection("future-factory/production/tracked_products")
    .where("lotNumber", "==", lotUpper)
    .limit(1)
    .get();

  if (!rootTrackingQuery.empty) {
    return rootTrackingQuery.docs[0].ref;
  }

  const scopedTrackingQuery = await db
    .collectionGroup("items")
    .where("lotNumber", "==", lotUpper)
    .limit(1)
    .get();

  if (!scopedTrackingQuery.empty) {
    return scopedTrackingQuery.docs[0].ref;
  }

  // Alleen BH18-lots (met 418) moeten altijd aan een bestaand productdossier gekoppeld zijn.
  if (lotUpper.includes("418")) {
    throw new Error(`Lotnummer ${lotUpper} is niet gevonden in de database. QC metingen moeten aan een bestaand productdossier gekoppeld worden.`);
  }

  // Voor overige machines mag QC tijdelijk zonder gekoppeld tracked product worden opgeslagen.
  return null;
};

export const saveQcMeasurementService = async (payload: any) => {
  const db = getFirestore();

  const trackedRef = await resolveTrackedRef(db, payload);

  const docRef = db.collection("future-factory/production/qc_measurements").doc();
  
  const batch = db.batch();
  batch.set(docRef, {
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (trackedRef) {
    const updateData: any = {};
    const addIfDefined = (key: string, value: unknown) => {
      if (value !== undefined) {
        updateData[key] = value;
      }
    };

    if (payload.type === "brix") {
      addIfDefined("measurements.Brix", payload.refractiveIndex);
      addIfDefined("measurements.Brix_Area", payload.area);
      addIfDefined("measurements.Brix_Ratio", payload.mixingRatio);
      addIfDefined("measurements.Brix_Department", normalizeDepartmentName(payload.department));
      addIfDefined("measurements.Brix_Kitchen", payload.kitchen);
      addIfDefined("measurements.Brix_TapPoint", payload.tapPoint);
      addIfDefined("measurements.Brix_Shift", payload.shift);
      addIfDefined("measurements.Brix_VisualCheck", payload.visualCheckOk);
      addIfDefined("measurements.Brix_ResinWeight", payload.resinWeight);
      addIfDefined("measurements.Brix_HardenerWeight", payload.hardenerWeight);
      addIfDefined("measurements.Brix_TableRef", payload.tableRef);
    } else if (payload.tg !== undefined && payload.tg !== null && !isNaN(payload.tg)) {
      addIfDefined("measurements.Tg", payload.tg);
      if (payload.resinBatch) {
        updateData.resinBatch = payload.resinBatch;
      }
    }
    if (Object.keys(updateData).length > 0) batch.update(trackedRef, updateData);
  }

  await batch.commit();
  return { ok: true, id: docRef.id };
};

export const saveQcInspectionService = async (payload: any) => {
  const db = getFirestore();

  const trackedRef = await resolveTrackedRef(db, payload);

  const docRef = db.collection("future-factory/production/qc_inspections").doc();
  
  const batch = db.batch();
  batch.set(docRef, {
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
  });

  if (trackedRef) {
    batch.update(trackedRef, {
      "inspection.status": payload.result === "OK" ? "Goedgekeurd" : "Afgekeurd",
      "inspection.lastNote": payload.note || "",
      "inspection.updatedAt": FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return { ok: true, id: docRef.id };
};

export const updateQcMeasurementService = async (payload: any) => {
  const db = getFirestore();

  const measurementId = String(payload?.measurementId || "").trim();
  if (!measurementId) {
    throw new Error("measurementId is verplicht.");
  }

  const measurementRef = db.doc(`future-factory/production/qc_measurements/${measurementId}`);
  const measurementSnap = await measurementRef.get();
  if (!measurementSnap.exists) {
    throw new Error(`QC meting ${measurementId} is niet gevonden.`);
  }

  const existing = measurementSnap.data() || {};
  const resolvedType = String(payload?.type || existing.type || "").toLowerCase();

  const nextLotNumber = String(payload?.lotNumber || existing.lotNumber || "").trim().toUpperCase();
  const nextTrackedProductPath = payload?.trackedProductPath ?? existing.trackedProductPath ?? null;

  const updatePayload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  const assignIfDefined = (key: string, value: unknown) => {
    if (value !== undefined) {
      updatePayload[key] = value;
    }
  };

  assignIfDefined("lotNumber", nextLotNumber || undefined);
  assignIfDefined("type", payload?.type);
  assignIfDefined("notes", payload?.notes);
  assignIfDefined("measuredAt", payload?.measuredAt);
  assignIfDefined("actorLabel", payload?.actorLabel);
  assignIfDefined("source", payload?.source);
  assignIfDefined("trackedProductPath", nextTrackedProductPath);

  assignIfDefined("department", payload?.department ? normalizeDepartmentName(payload.department) : payload?.department);
  assignIfDefined("kitchen", payload?.kitchen);
  assignIfDefined("tapPoint", payload?.tapPoint);
  assignIfDefined("shift", payload?.shift);
  assignIfDefined("resinWeight", payload?.resinWeight);
  assignIfDefined("hardenerWeight", payload?.hardenerWeight);
  assignIfDefined("refractiveIndex", payload?.refractiveIndex);
  assignIfDefined("visualCheckOk", payload?.visualCheckOk);
  assignIfDefined("tableRef", payload?.tableRef);
  assignIfDefined("mixingRatio", payload?.mixingRatio);
  assignIfDefined("area", payload?.area);
  assignIfDefined("brix", payload?.brix);
  assignIfDefined("resinBatch", payload?.resinBatch);
  assignIfDefined("tg", payload?.tg);

  const batch = db.batch();
  batch.update(measurementRef, updatePayload);

  const trackedRef = await resolveTrackedRef(db, {
    lotNumber: nextLotNumber,
    trackedProductPath: nextTrackedProductPath,
  });

  if (trackedRef && resolvedType === "brix") {
    const merged = {
      ...existing,
      ...payload,
      lotNumber: nextLotNumber,
      department: payload?.department ? normalizeDepartmentName(payload.department) : normalizeDepartmentName(existing.department),
    };

    const trackedUpdate: Record<string, unknown> = {};
    const addIfDefined = (key: string, value: unknown) => {
      if (value !== undefined) {
        trackedUpdate[key] = value;
      }
    };

    addIfDefined("measurements.Brix", merged.refractiveIndex);
    addIfDefined("measurements.Brix_Area", merged.area);
    addIfDefined("measurements.Brix_Ratio", merged.mixingRatio);
    addIfDefined("measurements.Brix_Department", merged.department);
    addIfDefined("measurements.Brix_Kitchen", merged.kitchen);
    addIfDefined("measurements.Brix_TapPoint", merged.tapPoint);
    addIfDefined("measurements.Brix_Shift", merged.shift);
    addIfDefined("measurements.Brix_VisualCheck", merged.visualCheckOk);
    addIfDefined("measurements.Brix_ResinWeight", merged.resinWeight);
    addIfDefined("measurements.Brix_HardenerWeight", merged.hardenerWeight);
    addIfDefined("measurements.Brix_TableRef", merged.tableRef);

    if (Object.keys(trackedUpdate).length > 0) {
      batch.update(trackedRef, trackedUpdate);
    }
  }

  await batch.commit();
  return { ok: true, id: measurementId };
};