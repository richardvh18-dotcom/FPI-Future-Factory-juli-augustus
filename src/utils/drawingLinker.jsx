// Service voor het koppelen van tekeningen aan orders
import { collection, getDocs, query, where, updateDoc, doc, limit } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";
import i18n from "../i18n";

const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

/**
 * Zoekt een tekening voor een order via de flow:
 * Order(itemCode) -> Conversie(ERP) -> Catalogus(Tekening)
 */
export const findDrawingForOrder = async (order) => {
  if (!order.itemCode) return null;
  const appId = getAppId();

  try {
    // 1. Zoek ERP code in Conversie Matrix
    // We nemen aan dat dit in 'conversion_matrix' staat
    const conversionRef = collection(db, "artifacts", appId, "public", "data", "conversion_matrix");
    const qConv = query(conversionRef, where("itemCode", "==", order.itemCode), limit(1));
    const convSnap = await getDocs(qConv);
    
    let erpCode = null;
    if (!convSnap.empty) {
      erpCode = convSnap.docs[0].data().erpCode;
    }

    // 2. Zoek Tekening in Catalogus (op ERP of direct op itemCode als fallback)
    const productsRef = collection(db, "artifacts", appId, "public", "data", "products");
    let qProd;
    
    if (erpCode) {
      qProd = query(productsRef, where("erpCode", "==", erpCode), limit(1));
    } else {
      // Fallback: zoek direct op itemCode
      qProd = query(productsRef, where("itemCode", "==", order.itemCode), limit(1));
    }

    const prodSnap = await getDocs(qProd);
    if (!prodSnap.empty) {
      const productData = prodSnap.docs[0].data();
      if (productData.drawing) {
        return productData.drawing;
      }
    }
    
    return null;
  } catch (error) {
    console.error(i18n.t("drawing.search_error", "Fout bij zoeken tekening:"), error);
    return null;
  }
};

/**
 * Update de order met de gevonden tekening
 */
export const syncOrderDrawing = async (orderId, drawing) => {
  if (!orderId || !drawing) return;
  try {
    const orderRef = doc(db, ...PATHS.PLANNING, orderId);
    await updateDoc(orderRef, { 
      drawing: drawing,
      lastUpdated: new Date() 
    });
    return true;
  } catch (e) {
    console.error(i18n.t("drawing.update_failed", "Update mislukt:"), e);
    return false;
  }
};

/**
 * Batch functie: Kan gebruikt worden voor de 'nachtelijke' sync.
 * Omdat dit frontend code is, moet dit aangeroepen worden door een admin
 * of verplaatst worden naar een Firebase Cloud Function (Node.js) voor echte automatisering.
 */
export const runBatchDrawingSync = async () => {
  console.log(i18n.t("drawing.batch_start", "Start batch sync..."));
  const ordersRef = collection(db, ...PATHS.PLANNING);
  const snap = await getDocs(ordersRef);
  
  let count = 0;
  for (const d of snap.docs) {
    const data = d.data();
    // Alleen actieve orders zonder tekening
    if (data.status !== "completed" && (!data.drawing || data.drawing === "-" || data.drawing === "")) {
      const drawing = await findDrawingForOrder({ ...data, id: d.id });
      if (drawing) {
        await syncOrderDrawing(d.id, drawing);
        count++;
      }
    }
  }
  console.log(i18n.t("drawing.batch_done", { count, defaultValue: `Batch sync klaar. ${count} orders bijgewerkt.` }));
  return count;
};
