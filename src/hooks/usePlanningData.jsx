import { useState, useEffect } from "react";
import { db } from "../config/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { PATHS } from "../config/dbPaths"; // Importeer de centrale paden

/**
 * usePlanningData - Haalt de planning op uit de nieuwe root-structuur.
 * Realtime: Gebruikt onSnapshot voor live updates.
 */
export const usePlanningData = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Gebruik het nieuwe pad: /future-factory/production/digital_planning
    const planningRef = collection(db, ...PATHS.PLANNING);
    const q = query(planningRef, orderBy("deliveryDate", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const orderList = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            deliveryDate: data.deliveryDate?.toDate
              ? data.deliveryDate.toDate()
              : new Date(data.deliveryDate),
          };
        });

        setOrders(orderList);
        setLoading(false);
      },
      (err) => {
        console.error("Planning database error (Check Rules):", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { orders, loading, error };
};
