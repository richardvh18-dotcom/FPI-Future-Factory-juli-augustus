import { db } from "../config/firebase";
import { collection, query, where, getDocs, limit, orderBy, documentId, collectionGroup, getDoc, doc } from "firebase/firestore";
import { PATHS, getPathString } from "../config/dbPaths";

const ORDER_LABEL_BROAD_SCOPED_FALLBACK_LIMIT = 600;

export type AnyRecord = Record<string, unknown>;

export const normalizeText = (value: unknown): string => String(value || "").toLowerCase().trim();

export const getErrMsg = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message || "onbekende fout");
  }
  return String(err);
};

export const loadFactoryMachinePaths = async (): Promise<Array<{productType: string; machine: string}>> => {
  try {
    const configSnap = await getDoc(doc(db, getPathString(PATHS.FACTORY_CONFIG)));
    if (!configSnap.exists()) return [];
    const data = (configSnap.data() || {}) as Record<string, unknown>;
    const departments = Array.isArray(data.departments) ? data.departments : [];
    const pairs: Array<{productType: string; machine: string}> = [];
    for (const dept of departments as Array<Record<string, unknown>>) {
      const productType = String(dept.name || dept.slug || dept.id || "").trim();
      if (!productType) continue;
      const stations = Array.isArray(dept.stations) ? dept.stations : [];
      for (const station of stations as Array<Record<string, unknown>>) {
        const machine = String(station.name || station.id || "").trim();
        if (machine) pairs.push({ productType, machine });
      }
    }
    return pairs;
  } catch {
    return [];
  }
};

export interface OrderLabelSearchResult {
  results: AnyRecord[];
  diagnostics: string[];
}

export const shouldUseGlobalOrderLabelSearch = (selectedMachine: string, searchText: string): boolean => {
  const normalizedMachine = String(selectedMachine || '').trim();
  const normalizedSearch = String(searchText || '').trim();
  return !normalizedMachine && normalizedSearch.length >= 3;
};

export const executeOrderLabelSearch = async (
  orderStr: string,
  initialList: AnyRecord[] = []
): Promise<OrderLabelSearchResult> => {
  let searchStr = orderStr.trim().toUpperCase();
  if (!searchStr) {
    return { results: [], diagnostics: [] };
  }
  
  const diagnostics: string[] = [];
  const addDebug = (msg: string) => {
    diagnostics.push(msg);
  };
  
  addDebug(`🔍 [Search] Genormaliseerde zoekterm: ${searchStr}`);
  
  if (searchStr.includes('/')) {
    searchStr = searchStr.split('/').filter(Boolean).pop() || searchStr;
  }

  // 1. FAST PATH: Check local memory (initialList) first before hitting the database
  const queryText = normalizeText(searchStr);
  if (initialList && initialList.length > 0) {
    const clientMatches = initialList.filter((item) => {
      const record = item as Record<string, unknown>;
      const orderText = normalizeText(record.orderId || record.orderNumber || record.Order || record.Productieorder || record.order || "");
      const productText = normalizeText(record.item || record.itemCode || record.Item || record.Artikel || record.description || record.Description || record.Omschrijving || "");
      const idText = normalizeText(record.id || "");
      return orderText.includes(queryText) || productText.includes(queryText) || idText.startsWith(queryText);
    });

    if (clientMatches.length > 0) {
      addDebug(`⚡ [Search] Gevonden in lokale cache (snel zoeken): ${clientMatches.length} resultaten`);
      return { results: clientMatches, diagnostics };
    }
  }

  addDebug(`☁️ [Search] Niet lokaal gevonden, fallback naar database queries voor: ${searchStr}`);


  const searchOptions: string[] = [searchStr];
  const digitsMatch = searchStr.match(/\d+/);
  if (digitsMatch) {
    const digits = digitsMatch[0];
    if (digits.length >= 3) {
      if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
        searchOptions.push(`N${digits}`, `N20${digits}`, `N200${digits}`, `N21${digits}`, `N210${digits}`, `P${digits}`);
      }
    }
  }

  const uniqueOptions = Array.from(new Set(searchOptions)).slice(0, 15);
  addDebug(`🔍 [Search] Options: ${uniqueOptions.join(', ')}`);

  // Short-circuit fallback for BH18 legacy paths
  if (searchStr.startsWith("N") && searchStr.length >= 6) {
    addDebug("🔍 [Search] Short-circuit geactiveerd voor BH18 fallbacks");
    const targetedPaths = [
      `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
      `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
    ];
    const targetedResults: AnyRecord[] = [];
    for (const path of targetedPaths) {
      try {
        const prefixSnap = await getDocs(
          query(collection(db, path), orderBy(documentId()), where(documentId(), ">=", searchStr), where(documentId(), "<=", searchStr + "\uf8ff"), limit(300))
        );
        addDebug(`${path} => ${prefixSnap.docs.length}`);
        prefixSnap.docs.forEach((d) => {
          targetedResults.push({ id: d.id, ...d.data() });
        });
      } catch (err) {
        addDebug(`${path} => ERROR: ${getErrMsg(err)}`);
      }
    }
    if (targetedResults.length > 0) {
      addDebug(`🎯 [Search] Early targeted BH18 match: ${targetedResults.length}`);
      const resultsArray = targetedResults;
      console.log(`SEARCH_DEBUG: executeOrderLabelSearch returning ${resultsArray.length} results.`, resultsArray);

      return {
        results: resultsArray,
        diagnostics
      };
    }
  }

  const colRef = collection(db, getPathString(PATHS.TEMP_PLANNING));
  const planRef = collection(db, getPathString(PATHS.PLANNING));
  const trackRef = collection(db, getPathString(PATHS.TRACKING));
  const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;

  const deepPathQueries: Array<Promise<unknown>> = [];
  const machinePairs = await loadFactoryMachinePaths();
  
  const expandedMachinePairs: Array<{productType: string; machine: string}> = [];
  for (const pair of machinePairs) {
    const p1 = pair;
    const p2 = { ...pair, productType: pair.productType.charAt(0).toUpperCase() + pair.productType.slice(1) };
    
    for (const p of [p1, p2]) {
      // Avoid duplicates if capitalized is the same
      if (p === p2 && p1.productType === p2.productType) continue;
      
      expandedMachinePairs.push(p);
      const upper = String(p.machine || "").toUpperCase();
      if (upper.startsWith("BH") && !upper.startsWith("40")) {
        expandedMachinePairs.push({ ...p, machine: `40${p.machine}` });
      } else if (upper.startsWith("40BH")) {
        expandedMachinePairs.push({ ...p, machine: p.machine.substring(2) });
      }
    }
  }

  // Deduplicate
  const uniqueExpandedPairs = Array.from(new Set(expandedMachinePairs.map(p => JSON.stringify(p)))).map(p => JSON.parse(p));

  const deepPathQueriesByMachine: Array<{ machinePath: string, queryBuilders: (() => Promise<any>)[] }> = [];

  for (const { productType, machine } of uniqueExpandedPairs) {
    try {
      const machinePath = `${getPathString(PATHS.PLANNING)}/${productType}/machines/${machine}/orders`;
      
      const machineSpecificOptions = [...uniqueOptions];
      if (digitsMatch && digitsMatch[0].length >= 3) {
        machineSpecificOptions.push(`${machine}-${digitsMatch[0]}`);
        machineSpecificOptions.push(`${machine}${digitsMatch[0]}`);
      }
      // Ensure unique and max 30 items for 'in' query
      const safeMachineOptions = Array.from(new Set(machineSpecificOptions)).slice(0, 30);
      
      const machineQueries: (() => Promise<any>)[] = [];
      machineQueries.push(() => getDocs(query(collection(db, machinePath), where("orderId", "in", safeMachineOptions), limit(100))));
      machineQueries.push(() => getDocs(query(collection(db, machinePath), where("orderNumber", "in", safeMachineOptions), limit(100))));
      machineQueries.push(() => getDocs(query(collection(db, machinePath), where("Order", "in", safeMachineOptions), limit(100))));
      machineQueries.push(() => getDocs(query(collection(db, machinePath), where("Productieorder", "in", safeMachineOptions), limit(100))));
      machineQueries.push(() => getDocs(query(collection(db, machinePath), where("order", "in", safeMachineOptions), limit(100))));
      machineQueries.push(() => getDocs(query(collection(db, machinePath), where("itemCode", "in", safeMachineOptions), limit(100))));
      machineQueries.push(() => getDocs(query(collection(db, machinePath), where("Item", "in", safeMachineOptions), limit(100))));
      machineQueries.push(() => getDocs(query(collection(db, machinePath), where("Artikel", "in", safeMachineOptions), limit(100))));
      if (machinePath.includes("40BH11") || machinePath.includes("BH11")) {
        console.log(`SEARCH_DEBUG: safeMachineOptions for ${machinePath}:`, safeMachineOptions);
      }
      for (const opt of safeMachineOptions) {
        machineQueries.push(() => 
          getDocs(query(collection(db, machinePath), where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(25)))
        );
        machineQueries.push(() => 
          getDocs(query(collection(db, machinePath), where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(25)))
        );
      }
      deepPathQueriesByMachine.push({ machinePath, queryBuilders: machineQueries });
    } catch (err) {
      // Silent
    }
  }

  const foundDocs = new Map<string, AnyRecord>();
  const addDocs = (snap: unknown) => {
    const docs = (snap as { docs?: Array<{ id: string; data: () => Record<string, unknown>; ref?: { path?: string } }> })?.docs;
    if (docs) {
      docs.forEach((d) => foundDocs.set(d.id, { id: d.id, ...d.data() }));
    }
  };
  const addScopedPlanningDocs = (snap: unknown) => {
    const docs = (snap as { docs?: Array<{ id: string; data: () => Record<string, unknown>; ref?: { path?: string } }> })?.docs;
    if (docs) {
      docs
        .filter((d) => String(d.ref?.path || "").startsWith(planningPrefix))
        .forEach((d) => foundDocs.set(d.id, { id: d.id, ...d.data() }));
    }
  };

  // 1. Direct op Document ID
  for (const opt of uniqueOptions) {
    try {
      const docSnap = await getDoc(doc(db, `${getPathString(PATHS.TEMP_PLANNING)}/${opt}`));
      if (docSnap.exists()) foundDocs.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      
      const planDocSnap = await getDoc(doc(db, `${getPathString(PATHS.PLANNING)}/${opt}`));
      if (planDocSnap.exists()) foundDocs.set(planDocSnap.id, { id: planDocSnap.id, ...planDocSnap.data() });
      
      const trackDocSnap = await getDoc(doc(db, `${getPathString(PATHS.TRACKING)}/${opt}`));
      if (trackDocSnap.exists()) foundDocs.set(trackDocSnap.id, { id: trackDocSnap.id, ...trackDocSnap.data() });
    } catch {
      continue;
    }
  }

  // 2. Parallelle exacte zoekopdrachten
  const exactQueries = [
    getDocs(query(colRef, where("orderId", "in", uniqueOptions))),
    getDocs(query(colRef, where("orderNumber", "in", uniqueOptions))),
    getDocs(query(colRef, where("Order", "in", uniqueOptions))),
    getDocs(query(colRef, where("Productieorder", "in", uniqueOptions))),
    getDocs(query(colRef, where("order", "in", uniqueOptions))),
    getDocs(query(colRef, where("originalOrderId", "in", uniqueOptions))),
    getDocs(query(colRef, where("itemCode", "in", uniqueOptions))),
    getDocs(query(colRef, where("productCode", "in", uniqueOptions))),
    getDocs(query(colRef, where("articleCode", "in", uniqueOptions))),
    getDocs(query(colRef, where("Item", "in", uniqueOptions))),
    getDocs(query(colRef, where("Artikel", "in", uniqueOptions))),
    getDocs(query(colRef, where("itemDescription", "in", uniqueOptions))),
    getDocs(query(planRef, where("orderId", "in", uniqueOptions))),
    getDocs(query(planRef, where("orderNumber", "in", uniqueOptions))),
    getDocs(query(planRef, where("Order", "in", uniqueOptions))),
    getDocs(query(planRef, where("Productieorder", "in", uniqueOptions))),
    getDocs(query(planRef, where("order", "in", uniqueOptions))),
    getDocs(query(planRef, where("originalOrderId", "in", uniqueOptions))),
    getDocs(query(planRef, where("itemCode", "in", uniqueOptions))),
    getDocs(query(planRef, where("productCode", "in", uniqueOptions))),
    getDocs(query(planRef, where("articleCode", "in", uniqueOptions))),
    getDocs(query(planRef, where("Item", "in", uniqueOptions))),
    getDocs(query(planRef, where("Artikel", "in", uniqueOptions))),
    getDocs(query(planRef, where("itemDescription", "in", uniqueOptions))),
    getDocs(query(trackRef, where("orderId", "in", uniqueOptions))),
    getDocs(query(trackRef, where("orderNumber", "in", uniqueOptions))),
    getDocs(query(trackRef, where("Order", "in", uniqueOptions))),
    getDocs(query(trackRef, where("order", "in", uniqueOptions))),
    getDocs(query(trackRef, where("originalOrderId", "in", uniqueOptions))),
    getDocs(query(trackRef, where("itemCode", "in", uniqueOptions))),
    getDocs(query(trackRef, where("item", "in", uniqueOptions))),
    getDocs(query(trackRef, where("itemDescription", "in", uniqueOptions)))
  ];
  const exactSnaps = await Promise.all(exactQueries.map(p => p.catch(() => null)));
  exactSnaps.forEach(addDocs);

  if (foundDocs.size === 0) {
    // Run machine deep paths sequentially to avoid resource-exhausted errors
    for (const machineGroup of deepPathQueriesByMachine) {
      if (foundDocs.size > 0) break; // Early return if we found what we need!
      
      const snaps = await Promise.all(machineGroup.queryBuilders.map(builder => builder().catch(() => null)));
      snaps.forEach(addDocs);
    }
  }

  const scopedExactQueries = [
    getDocs(query(collectionGroup(db, "orders"), where("orderId", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "orders"), where("orderNumber", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "orders"), where("Order", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "orders"), where("Productieorder", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "orders"), where("order", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "orders"), where("itemCode", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "orders"), where("Item", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "orders"), where("Artikel", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "items"), where("orderId", "in", uniqueOptions), limit(40))).catch(() => null),
    getDocs(query(collectionGroup(db, "items"), where("orderNumber", "in", uniqueOptions), limit(40))).catch(() => null),
  ];
  for (const opt of uniqueOptions.slice(0, 10)) {
    // Cannot use documentId() with collectionGroup using a raw string, skipping.
  }
  const scopedExactSnaps = await Promise.all(scopedExactQueries);
  scopedExactSnaps.forEach(addScopedPlanningDocs);

  if (foundDocs.size === 0 && searchStr.length >= 3) {
    const broadScopedSnap = await getDocs(
      query(collectionGroup(db, "orders"), limit(ORDER_LABEL_BROAD_SCOPED_FALLBACK_LIMIT))
    ).catch(() => null);
    if (broadScopedSnap && broadScopedSnap.docs) {
      const normalizedSearch = normalizeText(searchStr);
      broadScopedSnap.docs
        .filter((d) => String(d.ref?.path || "").startsWith(planningPrefix))
        .forEach((d) => {
          const data = d.data() || {};
          const idText = normalizeText(d.id);
          const orderText = normalizeText(data.orderId || data.orderNumber || data.Order || data.Productieorder || data.order || "");
          const productText = normalizeText(data.item || data.itemCode || data.Item || data.Artikel || data.description || data.Description || data.Omschrijving || "");
          if (idText.startsWith(normalizedSearch) || orderText.includes(normalizedSearch) || productText.includes(normalizedSearch)) {
            foundDocs.set(d.id, { id: d.id, ...data });
          }
        });
    }
  }
    
  // 3. 'Begint met' zoekopdrachten
  if (foundDocs.size < 5 && searchStr.length >= 3) {
    const startOptions = [searchStr];
    if (digitsMatch && digitsMatch[0].length >= 3) {
        if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
            startOptions.push(`N200${digitsMatch[0]}`, `N20${digitsMatch[0]}`, `N210${digitsMatch[0]}`, `N21${digitsMatch[0]}`);
        }
    }
    
    const startsWithQueries: Array<Promise<unknown>> = [];
    Array.from(new Set(startOptions)).forEach(opt => {
        startsWithQueries.push(getDocs(query(colRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("description", ">=", opt), where("description", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("description", ">=", opt), where("description", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
    });

    const startSnaps = await Promise.all(startsWithQueries.map(p => p.catch(() => null)));
    startSnaps.forEach(addDocs);

    const scopedStartsWithQueries: Array<Promise<unknown>> = [];
    Array.from(new Set(startOptions)).forEach((opt) => {
      // Cannot use documentId() with collectionGroup using a raw string, skipping.
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("itemCode", ">=", opt), where("itemCode", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("Item", ">=", opt), where("Item", "<=", opt + "\uf8ff"), limit(25))));
    });
    const scopedStartSnaps = await Promise.all(scopedStartsWithQueries.map((p) => p.catch(() => null)));
    scopedStartSnaps.forEach(addScopedPlanningDocs);
    
    const deepPathRangeQueries: Array<Promise<unknown>> = [];
    for (const { productType, machine } of machinePairs) {
      try {
        const machinePath = `${getPathString(PATHS.PLANNING)}/${productType}/machines/${machine}/orders`;
        Array.from(new Set(startOptions)).forEach((opt) => {
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("itemCode", ">=", opt), where("itemCode", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("Item", ">=", opt), where("Item", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
        });
      } catch {
        // Silent
      }
    }
    const deepPathRangeSnaps = await Promise.all(deepPathRangeQueries.map(p => p.catch(() => null)));
    deepPathRangeSnaps.forEach(addDocs);
  }

  const merged = new Map<string, AnyRecord>();
  Array.from(foundDocs.values()).forEach((item) => {
    const record = item as AnyRecord;
    merged.set(String(record.id ?? ""), record);
  });

  let finalResults = Array.from(merged.values());

  if (finalResults.length === 0 && searchStr.length >= 3) {
    const broadSnap = await getDocs(query(collectionGroup(db, "orders"), limit(4000))).catch(() => null);
    if (broadSnap && broadSnap.docs) {
      const fallbackMatches: AnyRecord[] = [];
      broadSnap.docs.forEach((d) => {
        const path = String(d.ref?.path || "");
        if (!path.startsWith(planningPrefix)) return;
        const data = d.data() || {};
        const idText = normalizeText(d.id);
        const orderText = normalizeText(data.orderId || data.orderNumber || data.Order || data.Productieorder || data.order || "");
        const productText = normalizeText(data.item || data.itemCode || data.Item || data.Artikel || data.description || data.Description || data.Omschrijving || "");
        if (idText.startsWith(queryText) || orderText.includes(queryText) || productText.includes(queryText)) {
          fallbackMatches.push({ id: d.id, ...data });
        }
      });
      finalResults = fallbackMatches;
    }
  }

  if (finalResults.length === 0 && queryText.startsWith("n")) {
    const targetedPaths = [
      `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
      `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
    ];
    const targetedQueries = targetedPaths.map((path) =>
      getDocs(query(collection(db, path), where(documentId(), ">=", searchStr), where(documentId(), "<=", searchStr + "\uf8ff"), limit(250))).catch(() => null)
    );
    const targetedSnaps = await Promise.all(targetedQueries);
    const targetedMatches: AnyRecord[] = [];
    targetedSnaps.forEach((snap) => {
      if (!snap || !snap.docs) return;
      snap.docs.forEach((d) => {
        targetedMatches.push({ id: d.id, ...d.data() });
      });
    });
    if (targetedMatches.length > 0) {
      finalResults = targetedMatches;
    }
  }

  return { results: finalResults, diagnostics };
};
