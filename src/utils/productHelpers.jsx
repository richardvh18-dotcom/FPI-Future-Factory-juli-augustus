import { db } from "../config/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { VERIFICATION_STATUS } from "../data/constants";
import { PATHS } from "../config/dbPaths";
import i18n from "../i18n";

/**
 * Product Helpers V8.0
 * Hersteld: deleteProduct functie toegevoegd.
 */

export const fetchProducts = async () => {
  const q = query(
    collection(db, ...PATHS.PRODUCTS),
    orderBy("lastUpdated", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const addProduct = async (productData) => {
  const cleanData = {
    ...productData,
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  };
  const docRef = await addDoc(collection(db, ...PATHS.PRODUCTS), cleanData);
  return docRef.id;
};

export const updateProduct = async (productId, productData) => {
  const productRef = doc(db, ...PATHS.PRODUCTS, productId);
  await updateDoc(productRef, {
    ...productData,
    lastUpdated: serverTimestamp(),
  });
};

export const deleteProduct = async (productId) => {
  const productRef = doc(db, ...PATHS.PRODUCTS, productId);
  await deleteDoc(productRef);
};

export const verifyProduct = async (
  productId,
  currentUser,
  currentProductData
) => {
  if (currentProductData.lastModifiedBy === currentUser?.uid) {
    return {
      success: false,
      message: i18n.t("product.verify_own_change_error", "Vier-ogen principe: Je mag je eigen wijzigingen niet verifiëren."),
    };
  }
  const productRef = doc(db, ...PATHS.PRODUCTS, productId);
  await updateDoc(productRef, {
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    verifiedBy: {
      uid: currentUser.uid,
      name: currentUser.displayName || currentUser.name,
      timestamp: serverTimestamp(),
    },
    active: true,
    lastUpdated: serverTimestamp(),
  });
  return { success: true };
};
