import { useState } from "react";
import { collection, query, collectionGroup, where, limit, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString, getArchiveItemsPath } from "../config/dbPaths";

export interface GlobalSearchState {
  globalSearchLoading: boolean;
  globalDossierProduct: any | null;
  globalOrderDetail: any | null;
  globalOrders: any[];
}

export function useGlobalSearch() {
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalDossierProduct, setGlobalDossierProduct] = useState<any | null>(null);
  const [globalOrderDetail, setGlobalOrderDetail] = useState<any | null>(null);
  const [globalOrders, setGlobalOrders] = useState<any[]>([]);

  const handleGlobalSearch = async (
    queryStr: string,
    onSuccess?: () => void
  ) => {
    const qStr = queryStr.trim().toUpperCase();
    if (!qStr) return;

    setGlobalSearchLoading(true);
    try {
      let foundProduct: any = null;
      let foundOrder: any = null;
      let parentOrders: any[] = [];

      const itemsQuery = query(collectionGroup(db, "items"), where("lotNumber", "==", qStr), limit(1));
      const itemsSnap = await getDocs(itemsQuery);
      if (!itemsSnap.empty) {
        foundProduct = { id: itemsSnap.docs[0].id, ...itemsSnap.docs[0].data() };
      }

      if (!foundProduct) {
        const rootTracked = await getDocs(query(collection(db, getPathString(PATHS.TRACKING)), where("lotNumber", "==", qStr), limit(1)));
        if (!rootTracked.empty) foundProduct = { id: rootTracked.docs[0].id, ...rootTracked.docs[0].data() };
      }

      if (!foundProduct) {
        const currentYear = new Date().getFullYear();
        for (const year of [currentYear, currentYear - 1]) {
          const archiveRef = collection(db, getPathString(getArchiveItemsPath(year)));
          const archSnap = await getDocs(query(archiveRef, where("lotNumber", "==", qStr), limit(1)));
          if (!archSnap.empty) {
            foundProduct = { id: archSnap.docs[0].id, ...archSnap.docs[0].data(), archived: true };
            break;
          }
        }
      }

      if (foundProduct) {
        const orderId = foundProduct.orderId || foundProduct.orderNumber;
        if (orderId) {
          const orderSnap = await getDocs(query(collectionGroup(db, "orders"), where("orderId", "==", orderId), limit(1)));
          if (!orderSnap.empty) parentOrders = [{ id: orderSnap.docs[0].id, ...orderSnap.docs[0].data() }];
          else {
            const rootOrderSnap = await getDocs(query(collection(db, getPathString(PATHS.PLANNING)), where("orderId", "==", orderId), limit(1)));
            if (!rootOrderSnap.empty) parentOrders = [{ id: rootOrderSnap.docs[0].id, ...rootOrderSnap.docs[0].data() }];
          }
        }
        setGlobalOrders(parentOrders);
        setGlobalDossierProduct(foundProduct);
        if (onSuccess) onSuccess();
        return;
      }

      const orderSnap = await getDocs(query(collectionGroup(db, "orders"), where("orderId", "==", qStr), limit(1)));
      if (!orderSnap.empty) foundOrder = { id: orderSnap.docs[0].id, ...orderSnap.docs[0].data() };
      else {
        const rootOrderSnap = await getDocs(query(collection(db, getPathString(PATHS.PLANNING)), where("orderId", "==", qStr), limit(1)));
        if (!rootOrderSnap.empty) foundOrder = { id: rootOrderSnap.docs[0].id, ...rootOrderSnap.docs[0].data() };
      }

      if (foundOrder) {
        setGlobalOrderDetail(foundOrder);
        if (onSuccess) onSuccess();
        return;
      }

      alert(`Geen product of order gevonden voor: ${qStr}`);
    } catch (err) {
      console.error("Fout bij globaal zoeken:", err);
      alert("Er is een fout opgetreden bij het zoeken.");
    } finally {
      setGlobalSearchLoading(false);
    }
  };

  const clearGlobalSearchState = () => {
    setGlobalDossierProduct(null);
    setGlobalOrderDetail(null);
    setGlobalOrders([]);
  };

  return {
    globalSearchLoading,
    globalDossierProduct,
    globalOrderDetail,
    globalOrders,
    handleGlobalSearch,
    clearGlobalSearchState,
    setGlobalDossierProduct,
    setGlobalOrderDetail,
    setGlobalOrders,
  };
}
