import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const saveQcMeasurementService = async (payload: any) => {
  const db = getFirestore();
  
  let trackedRef = null;
  if (payload.lotNumber) {
    const lotUpper = String(payload.lotNumber).trim().toUpperCase();
    const trackingQuery = await db.collectionGroup("items")
      .where("lotNumber", "==", lotUpper)
      .limit(1)
      .get();
      
    if (trackingQuery.empty) {
      throw new Error(`Lotnummer ${lotUpper} is niet gevonden in de database. QC metingen moeten aan een bestaand productdossier gekoppeld worden.`);
    }
    trackedRef = trackingQuery.docs[0].ref;
  }

  const docRef = db.collection("future-factory/production/qc_measurements").doc();
  
  const batch = db.batch();
  batch.set(docRef, {
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (trackedRef) {
    const updateData: any = {};
    if (payload.brix !== undefined && payload.brix !== null && !isNaN(payload.brix)) updateData["measurements.Brix"] = payload.brix;
    if (payload.tg !== undefined && payload.tg !== null && !isNaN(payload.tg)) updateData["measurements.Tg"] = payload.tg;
    if (payload.resinBatch) updateData.resinBatch = payload.resinBatch;
    if (Object.keys(updateData).length > 0) batch.update(trackedRef, updateData);
  }

  await batch.commit();
  return { ok: true, id: docRef.id };
};

export const saveQcInspectionService = async (payload: any) => {
  const db = getFirestore();
  
  let trackedRef = null;
  if (payload.lotNumber) {
    const lotUpper = String(payload.lotNumber).trim().toUpperCase();
    const trackingQuery = await db.collectionGroup("items")
      .where("lotNumber", "==", lotUpper)
      .limit(1)
      .get();
      
    if (trackingQuery.empty) {
      throw new Error(`Lotnummer ${lotUpper} is niet gevonden in de database. Inspecties moeten aan een bestaand product gekoppeld worden.`);
    }
    trackedRef = trackingQuery.docs[0].ref;
  }

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