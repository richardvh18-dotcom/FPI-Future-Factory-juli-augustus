import { useState, useEffect } from "react";
import { subscribePlanningOrders } from "../repositories/planningRepository";
import { isActivePlanningOrder } from "../utils/trackingHelpers";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { PlanningOrder } from "../types";

interface UsePlanningDataResult {
  orders: PlanningOrder[];
  loading: boolean;
  error: Error | null;
}

/**
 * usePlanningData - Haalt de planning op uit de nieuwe root-structuur.
 * Realtime: Gebruikt onSnapshot voor live updates.
 */
export const usePlanningData = (): UsePlanningDataResult => {
  const [orders, setOrders] = useState<PlanningOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = subscribePlanningOrders(
      (docs: QueryDocumentSnapshot<PlanningOrder>[]) => {
        const orderList = docs
          .map((doc) => {
            const data = doc.data();
            const hidden = Boolean(data.smartSyncExcluded); // Use correct boolean property if applicable
            const keepVisible = !hidden || isActivePlanningOrder(data);

            if (!keepVisible) return null;

            return {
              ...data,
              deliveryDate: data.deliveryDate?.toDate
                ? data.deliveryDate.toDate()
                : (data.deliveryDate ? new Date(data.deliveryDate) : undefined),
            } as PlanningOrder;
          })
          .filter((o): o is PlanningOrder => o !== null);

        setOrders(orderList);
        setLoading(false);
      },
      (err: Error) => {
        console.error("Planning database error (Check Rules):", err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { orders, loading, error };
};
