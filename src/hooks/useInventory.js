import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";

/**
 * useInventory.js - Optimized
 * Haalt gereedschappen en locatiegegevens op.
 * Geoptimaliseerd: Gebruikt getDocs in plaats van onSnapshot.
 */
const useInventory = (shouldFetch = true) => {
  const [moffen, setMoffen] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!shouldFetch) return;

    let isMounted = true;
    setLoading(true);

    const fetchInventory = async () => {
      try {
        const ref = collection(db, ...PATHS.INVENTORY);
        const snapshot = await getDocs(ref);

        if (isMounted) {
          const list = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setMoffen(list);
          setLoading(false);
        }
      } catch (err) {
        console.error("Fout bij laden inventory:", err);
        if (isMounted) {
          setError(err);
          setLoading(false);
        }
      }
    };

    fetchInventory();

    return () => {
      isMounted = false;
    };
  }, [shouldFetch]);

  return { moffen, loading, error };
};

export default useInventory;
