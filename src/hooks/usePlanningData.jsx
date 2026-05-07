import { useState, useEffect } from "react";
import { subscribePlanningOrders } from "../repositories/planningRepository";
import { normalizeOrderStatus, isActivePlanningOrder } from "../utils/trackingHelpers";

/**
 * usePlanningData - Haalt de planning op uit de nieuwe root-structuur.
 * Realtime: Gebruikt onSnapshot voor live updates.
 */
export const usePlanningData = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribePlanningOrders(
      (docs) => {
        const orderList = docs.map((doc) => {
          const data = doc.data();
          const hidden = Boolean(data.planningHidden);
          const keepVisible = !hidden || isActivePlanningOrder(data);

          if (!keepVisible) return null;

          return {
            id: doc.id,
            ...data,
            deliveryDate: data.deliveryDate?.toDate
              ? data.deliveryDate.toDate()
              : new Date(data.deliveryDate),
          };
        }).filter(Boolean);

        setOrders(orderList);
        setLoading(false);
      },
      (err) => {
        console.error("Planning database error (Check Rules):", err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { orders, loading, error };
};
