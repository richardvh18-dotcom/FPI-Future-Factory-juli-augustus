import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Wm18CatalogItem } from '../types/wm18Types';
import { lookupProductByManufacturedId } from '../utils/conversionLogic';

const CATALOG_COLLECTION = 'future-factory/data/wm18_catalog';

/**
 * Super-fast 4-tier lookup for WM18 Robot Catalog Items:
 * 1. Direct hit on Firestore Document ID (articleNumber or spec ID)
 * 2. Conversie Matrix lookup (maps new ERP article code <-> old article code)
 * 3. Firestore query by articleNumber field
 * 4. Browser LocalStorage fallback
 */
export const getWm18CatalogItemByArticleNumber = async (
  inputArticleCode: string
): Promise<Wm18CatalogItem | null> => {
  if (!inputArticleCode) return null;
  const rawCode = inputArticleCode.trim();

  // Tier 1: Direct Document ID hit in WM18 Catalog
  try {
    const directSnap = await getDoc(doc(db, CATALOG_COLLECTION, rawCode));
    if (directSnap.exists()) {
      return directSnap.data() as Wm18CatalogItem;
    }
  } catch (e) {
    console.warn('WM18 direct doc lookup error:', e);
  }

  // Tier 2: Check Conversie Matrix (maps new <-> old article number)
  try {
    const conversion = await lookupProductByManufacturedId(null, rawCode);
    if (conversion) {
      const candidates = [
        conversion.manufacturedId,
        conversion.targetProductId,
        conversion.id,
      ].filter((c): c is string => typeof c === 'string' && Boolean(c) && c !== rawCode);

      for (const candidateCode of candidates) {
        const candidateSnap = await getDoc(doc(db, CATALOG_COLLECTION, candidateCode));
        if (candidateSnap.exists()) {
          return candidateSnap.data() as Wm18CatalogItem;
        }
      }
    }
  } catch (e) {
    console.warn('WM18 conversion matrix lookup error:', e);
  }

  // Tier 3: Query by articleNumber field
  try {
    const qField = query(collection(db, CATALOG_COLLECTION), where('articleNumber', '==', rawCode));
    const querySnap = await getDocs(qField);
    if (!querySnap.empty) {
      return querySnap.docs[0].data() as Wm18CatalogItem;
    }
  } catch (e) {
    console.warn('WM18 query lookup error:', e);
  }

  // Tier 4: Check local storage fallback
  if (typeof window !== 'undefined') {
    try {
      const rawLocal = window.localStorage.getItem('fpi_wm18_catalog_local');
      if (rawLocal) {
        const items = JSON.parse(rawLocal) as Wm18CatalogItem[];
        const match = items.find(
          (i) => i.id === rawCode || i.articleNumber === rawCode
        );
        if (match) return match;
      }
    } catch {
      // ignore
    }
  }

  return null;
};
