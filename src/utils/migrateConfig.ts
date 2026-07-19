import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";
import {
  ALL_PRODUCT_TYPES,
  PRODUCT_LABELS,
  CONNECTION_TYPES,
  STANDARD_DIAMETERS,
  STANDARD_PRESSURES,
} from "../data/constants";

/**
 * Eenmalig script om hardcoded arrays in constants.ts te migreren naar Firestore collecties.
 */
export const migrateHardcodedConfigToFirestore = async () => {
  try {
    console.log("🚀 Start migratie van hardcoded configs naar Firestore...");
    
    const batch = writeBatch(db);

    const migraties = [
      { path: PATHS.CONFIG_PRODUCT_TYPES, data: ALL_PRODUCT_TYPES, idPrefix: "pt" },
      { path: PATHS.CONFIG_PRODUCT_LABELS, data: PRODUCT_LABELS, idPrefix: "pl" },
      { path: PATHS.CONFIG_CONNECTION_TYPES, data: CONNECTION_TYPES, idPrefix: "ct" },
      { path: PATHS.CONFIG_DIAMETERS, data: STANDARD_DIAMETERS, idPrefix: "dia" },
      { path: PATHS.CONFIG_PRESSURES, data: STANDARD_PRESSURES, idPrefix: "press" },
    ];

    for (const { path, data, idPrefix } of migraties) {
      if (!path) {
        console.warn(`⚠️ Pad niet gevonden voor migratie (prefix: ${idPrefix})`);
        continue;
      }

      const collPath = getPathString(path);
      const collRef = collection(db, collPath);

      console.log(`Schrijven naar collectie: ${collPath}`);

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        // Maak een 'veilig' doc ID gebaseerd op de waarde (spaties en speciale tekens eruit)
        const safeId = String(item).toLowerCase().replace(/[^a-z0-9]/g, "_");
        const docRef = doc(collRef, safeId || `${idPrefix}_${i}`);

        batch.set(docRef, {
          value: item,
          label: String(item),
          isActive: true,
          order: i,
          migratedAt: new Date().toISOString()
        }, { merge: true }); // merge = true voorkomt overschrijven als ze al ge-edit zijn
      }
    }

    // Specifieke hardcoded printer routing rules naar db (basis migratie)
    const printerRulesPath = getPathString(PATHS.PRINTER_ROUTING_RULES);
    if (printerRulesPath) {
      const printerCollRef = collection(db, printerRulesPath);
      
      const defaultRules = [
        { id: "rule_flange_mazak", conditionType: "itemCode", operator: "startsWith", conditionValue: "FL", targetPrinter: "MAZAK", isActive: true },
        { id: "rule_bh_general", conditionType: "station", operator: "regex", conditionValue: "^BH\\d+$", targetPrinter: "GENERAL", isActive: true },
        { id: "rule_bm_bm", conditionType: "station", operator: "regex", conditionValue: "^BM\\d+$", targetPrinter: "BM", isActive: true },
      ];

      for (const rule of defaultRules) {
        const docRef = doc(printerCollRef, rule.id);
        batch.set(docRef, rule, { merge: true });
      }
    }
    
    await batch.commit();

    console.log("✅ Migratie voltooid!");
    return { success: true, message: "Alle lijsten zijn gemigreerd naar Firestore" };
  } catch (error) {
    console.error("❌ Fout tijdens migratie:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
};
