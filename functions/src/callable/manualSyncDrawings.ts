import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const normalizeCode = (value: unknown): string => String(value || "").trim().toUpperCase();
const compactCode = (value: unknown): string => normalizeCode(value).replace(/[^A-Z0-9]/g, "");

const isLikelyCodeValue = (value: unknown): boolean => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (raw.length < 5) return false;
  return !/\s/.test(raw);
};

const materialVariants = (code: string): string[] => {
  if (!code || code.length < 5) return [];
  const c = code.toUpperCase();
  
  const variants = new Set<string>();
  
  [4, 6].forEach(idx => {
    if (c.length > idx) {
      if (c[idx] === "C") {
        variants.add(c.slice(0, idx) + "E" + c.slice(idx + 1));
        variants.add(c.slice(0, idx) + c.slice(idx + 1));
        variants.add(c.slice(0, idx) + " " + c.slice(idx + 1));
      } else if (c[idx] === "E") {
        variants.add(c.slice(0, idx) + "C" + c.slice(idx + 1));
        variants.add(c.slice(0, idx) + c.slice(idx + 1));
        variants.add(c.slice(0, idx) + " " + c.slice(idx + 1));
      }
    }
  });
  
  return Array.from(variants);
};

const buildLookupKeys = (value: unknown): string[] => {
  const raw = String(value || "").trim();
  const normalized = normalizeCode(raw);
  const compact = compactCode(raw);

  const keys = new Set([normalized, compact].filter(Boolean));

  if (normalized.includes("_")) {
    const tokens = normalized
      .split("_")
      .map((part) => part.trim())
      .filter(Boolean);

    tokens.forEach((token) => {
      keys.add(token);
      const compactToken = compactCode(token);
      if (compactToken) keys.add(compactToken);
    });

    const lastToken = tokens[tokens.length - 1];
    if (lastToken) keys.add(lastToken);
  }

  for (const k of [...keys]) {
    materialVariants(k).forEach((v) => keys.add(v));
  }

  return Array.from(keys);
};

export const manualSyncDrawings = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data: any, context: any) => {
    // 1. Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "You must be logged in to trigger drawing sync.");
    }

    if (context.auth.token.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Only admins can trigger drawing sync.");
    }

    const db = admin.firestore();

    try {
      const planningPath = "future-factory/data/planning";
      const planningRef = db.collection(planningPath);
      const planningSnap = await planningRef.get();
      
      let scopedDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      try {
        const scopedSnap = await db.collectionGroup("orders").get();
        scopedDocs = scopedSnap.docs.filter(d => d.ref.path.startsWith(planningPath + "/"));
      } catch (err) {
        console.warn("Could not fetch scoped orders via collectionGroup:", err);
      }
      
      const allPlanningDocs = [...planningSnap.docs, ...scopedDocs];

      const uniqueItems = new Set<string>();
      const planningDocsByCode = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
      const codeSources = new Map<string, Set<string>>();

      allPlanningDocs.forEach((doc) => {
        const data = doc.data();
        
        let idCode = null;
        if (doc.id.includes('_')) {
            const parts = doc.id.split('_');
            const lastPart = parts[parts.length - 1];
            if (lastPart && lastPart.length > 5) {
                idCode = lastPart;
            }
        }

        const candidates = [
          { field: 'itemCode', value: data.itemCode },
          { field: 'item', value: data.item },
          { field: 'productId', value: data.productId },
          { field: 'manufacturedId', value: data.manufacturedId },
          { field: 'articleCode', value: data.articleCode },
          { field: 'productCode', value: data.productCode },
          { field: 'docId_parsed', value: idCode }
        ];

        candidates.forEach(({ field, value }) => {
          if (value && isLikelyCodeValue(value)) {
            const codeStr = String(value).trim();
            if (codeStr) {
              uniqueItems.add(codeStr);
              if (!planningDocsByCode.has(codeStr)) planningDocsByCode.set(codeStr, []);
              
              if (!codeSources.has(codeStr)) codeSources.set(codeStr, new Set());
              const sourceSet = codeSources.get(codeStr);
              if (sourceSet) {
                sourceSet.add(field);
              }

              const list = planningDocsByCode.get(codeStr);
              if (list && !list.some((d) => d.id === doc.id)) {
                  list.push(doc);
              }
            }
          }
        });
      });

      const results: any[] = [];
      let savedCount = 0;

      const productsPath = "future-factory/data/products";
      const productsRef = db.collection(productsPath);
      const productsSnap = await productsRef.get();
      
      const productsByCode = new Map<string, any>();
      productsSnap.docs.forEach((doc) => {
        const p = doc.data();
        const productData = { id: doc.id, ...p };
        
        const addToIndex = (key: unknown) => {
            if(!key) return;
            buildLookupKeys(key).forEach((lookupKey) => {
              if (lookupKey) {
                productsByCode.set(lookupKey, productData);
              }
            });
        };

        addToIndex(p.name);
        addToIndex(p.articleCode);
        addToIndex(doc.id);
        addToIndex(p.manufacturedId);
        addToIndex(p.erpCode);
        addToIndex(p.productCode);
      });

      const conversionsPath = "future-factory/data/conversion_matrix";
      const conversionsRef = db.collection(conversionsPath);
      const conversionsSnap = await conversionsRef.get();
      const conversionsByOldCode = new Map<string, Set<string>>();

      conversionsSnap.docs.forEach((doc) => {
          const c = doc.data();
          if (c.targetProductId) {
              const target = normalizeCode(c.targetProductId);
              const targetCompact = compactCode(c.targetProductId);
              const targetKeys = [target, targetCompact].filter(Boolean);

              const indexSource = (source: unknown) => {
                buildLookupKeys(source).forEach((sourceKey) => {
                  if (sourceKey && targetKeys.length > 0) {
                    if (!conversionsByOldCode.has(sourceKey)) {
                      conversionsByOldCode.set(sourceKey, new Set());
                    }
                    const targetSet = conversionsByOldCode.get(sourceKey);
                    targetKeys.forEach((targetKey) => {
                      if (targetKey && targetSet) targetSet.add(targetKey);
                    });
                  }
                });
              };

              if (c.manufacturedId) indexSource(c.manufacturedId);
              indexSource(doc.id);
              if (Array.isArray(c.searchTerms)) {
                c.searchTerms.forEach((entry) => indexSource(entry));
              }
          }
      });
      
      for (const itemCode of uniqueItems) {
        const lookupKeys = buildLookupKeys(itemCode);

        const findProductByKeys = (keys: string[]): any | null => {
          for (const key of keys) {
            const hit = productsByCode.get(key);
            if (hit) return hit;
          }
          return null;
        };

        let match = findProductByKeys(lookupKeys);
        let usedConversion = false;

        if (!match) {
            for (const sourceKey of lookupKeys) {
              const targetCodes = Array.from(conversionsByOldCode.get(sourceKey) || []);
              if (targetCodes.length > 0) {
                for (const targetCode of targetCodes) {
                  match = findProductByKeys(buildLookupKeys(targetCode));
                  if (match) {
                    usedConversion = true;
                    break;
                  }
                }
                if (match) {
                  break;
                }
              }
            }
        }

        if (match) {
          const docsToUpdate = planningDocsByCode.get(itemCode);
          if (docsToUpdate && docsToUpdate.length > 0) {
              const chunkSize = 400;
              for (let i = 0; i < docsToUpdate.length; i += chunkSize) {
                  const batch = db.batch();
                  const chunk = docsToUpdate.slice(i, i + chunkSize);
                  chunk.forEach((docSnap) => {
                      batch.update(docSnap.ref, { drawing: match.id });
                  });
                  try {
                    await batch.commit();
                  } catch (batchErr) {
                    console.error(`Fout bij updaten match voor ${itemCode}:`, batchErr);
                  }
              }
              savedCount += docsToUpdate.length;

              try {
                const logPath = "future-factory/settings/drawing_sync_logs";
                await db.collection(logPath).add({
                  timestamp: admin.firestore.FieldValue.serverTimestamp(),
                  code: itemCode,
                  productName: match.name || match.id,
                  productId: match.id,
                  type: 'MATCH_FOUND',
                  method: 'MANUAL'
                });
              } catch (logErr) {
                console.warn("Log failed:", logErr);
              }
          }

          results.push({ 
              code: itemCode, 
              found: true, 
              product: match.name || match.id, 
              saved: true, 
              fullProduct: match,
              sourceFields: Array.from(codeSources.get(itemCode) || []),
              viaConversion: usedConversion
          });
        } else {
          const docsToUpdate = planningDocsByCode.get(itemCode);
          let removedCount = 0;

          if (docsToUpdate && docsToUpdate.length > 0) {
              const docsWithDrawing = docsToUpdate.filter(d => d.data().drawing);
              
              if (docsWithDrawing.length > 0) {
                  const chunkSize = 400;
                  for (let i = 0; i < docsWithDrawing.length; i += chunkSize) {
                      const batch = db.batch();
                      const chunk = docsWithDrawing.slice(i, i + chunkSize);
                      chunk.forEach((docSnap) => {
                          batch.update(docSnap.ref, { drawing: null });
                      });
                      try {
                        await batch.commit();
                      } catch (batchErr) {
                        console.error(`Fout bij verwijderen tekening voor ${itemCode}:`, batchErr);
                      }
                  }
                  removedCount = docsWithDrawing.length;
              }
          }

          const resultItem: any = { 
              code: itemCode, 
              found: false, 
              removed: removedCount > 0,
              sourceFields: Array.from(codeSources.get(itemCode) || []),
              conversionTarget: null
          };

          for (const sourceKey of lookupKeys) {
            const targetCodes = Array.from(conversionsByOldCode.get(sourceKey) || []);
            if (targetCodes.length > 0) {
              resultItem.conversionTarget = targetCodes[0];
              break;
            }
          }
          
          results.push(resultItem);
        }
      }

      try {
        const settingsRef = db.doc("future-factory/settings/general_configs/main");
        await settingsRef.update({
          lastDrawingSync: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.warn("Failed to update lastDrawingSync:", err);
      }

      return { success: true, results, savedCount };
    } catch (error) {
      console.error("Manual Sync Error:", error);
      throw new functions.https.HttpsError("internal", "An error occurred during sync.");
    }
  });
