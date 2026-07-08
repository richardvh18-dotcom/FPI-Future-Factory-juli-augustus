import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, onSnapshot, limit } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../../config/dbPaths";
import { isValid, isSameDay, startOfISOWeek, endOfISOWeek, isWithinInterval, format } from "date-fns";
import { nl } from "date-fns/locale";
import { OrderRecord, ProductRecord, SidebarEntry, DeliveryMismatch } from "./bm01Types";

const toMillisFromMixed = (value: any): number => {
    if (!value) return 0;
    if (typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
    if (typeof value === "object" && value !== null && "seconds" in value && typeof value.seconds === "number") return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    if (typeof value !== "string" && typeof value !== "number") return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const toDateFromMixed = (value: any): Date | null => {
    const millis = toMillisFromMixed(value);
    if (!millis) return null;
    const date = new Date(millis);
    return isValid(date) ? date : null;
};

const archiveColPath = (year: number) => collection(db, getPathString(getArchiveItemsPath(year)));

export const useBM01Data = ({
    orders,
    products,
    selectedOrderId,
    selectedSidebarEntry,
    activeTab,
    selectedDate,
    viewMode,
    lastNahardingResetAt,
    deliveryMismatchFilter
}: any) => {
    const [archivedProducts, setArchivedProducts] = useState<ProductRecord[]>([]);

    const toMillisSafe = (value: any) => toMillisFromMixed(value);

    const getNahardingOfferedMillis = (item: ProductRecord) => {
        const ts = item?.timestamps || {};
        const directTs =
            toMillisSafe(ts.oven_naharding_start)
            || toMillisSafe(ts.naharding_start)
            || 0;
        if (directTs > 0) return directTs;

        const historyList = Array.isArray(item?.history) ? item.history : [];
        const nahardingEvent = historyList.find((entry: any) => {
            const details = String(entry?.details || "").toUpperCase();
            const station = String(entry?.station || "").toUpperCase();
            const action = String(entry?.action || "").toUpperCase();
            if (details.includes("GEREEDGEMELD") || action === "ARCHIVE" || action === "COMPLETED") return false;
            return details.includes("NAHARD") || details.includes("OVEN") ||
                   station.includes("NAHARD") || station.includes("OVEN") ||
                   action.includes("NAHARD");
        });
        const historyTs = toMillisSafe(nahardingEvent?.timestamp || nahardingEvent?.time);
        if (historyTs > 0) return historyTs;

        const station = String(item?.currentStation || "").toUpperCase().replace(/\s/g, "");
        const step = String(item?.currentStep || "").toUpperCase().replace(/\s/g, "");
        const status = String(item?.status || "").toUpperCase().trim();
        const lastStation = String(item?.lastStation || "").toUpperCase().replace(/\s/g, "");
        const isLegacyQcVirtual = Boolean(item?.isVirtualLot) && (step === "QC_VIRTUAL" || status === "QC VIRTUAL ISSUED");

        const isNahardingRelated =
            station.includes("NAHARD") || station.includes("OVEN") ||
            step.includes("NAHARD") || step.includes("OVEN") ||
            status === "TE NAHARDEN" ||
            isLegacyQcVirtual ||
            lastStation.includes("NAHARD") || lastStation.includes("OVEN");

        if (isNahardingRelated) {
            const isFinished = status === "COMPLETED" || station === "GEREED";
            if (isFinished) {
                return toMillisSafe(item?.createdAt);
            }
            return toMillisSafe(item?.updatedAt) || toMillisSafe(item?.createdAt);
        }
        return 0;
    };

    const planningOrders = useMemo(() => {
        return (orders || []).filter((o: OrderRecord) => o.status !== "completed" && o.status !== "cancelled");
    }, [orders]);

    const deliveryInspectionMismatches = useMemo(() => {
        const toFinite = (value: unknown) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        };

        return planningOrders
            .map((order: OrderRecord): DeliveryMismatch | null => {
                const deliveredQty =
                    toFinite(order?.lnDeliveredQty) ??
                    toFinite(order?.deliveredQty) ??
                    toFinite(order?.quantityDelivered) ??
                    null;

                if (!Number.isFinite(deliveredQty)) return null;

                const inspectionApprovedQty = toFinite(order?.inspectionApprovedQty) ?? toFinite(order?.produced) ?? 0;
                const safeDeliveredQty = deliveredQty ?? 0;
                const delta = safeDeliveredQty - inspectionApprovedQty;
                if (delta === 0) return null;

                return {
                    orderId: order?.orderId || order?.id || "-",
                    item: order?.item || order?.itemDescription || "-",
                    deliveredQty: safeDeliveredQty,
                    inspectionApprovedQty,
                    delta,
                };
            })
                .filter((entry: any): entry is DeliveryMismatch => Boolean(entry))
                .sort((a: any, b: any) => Math.abs(b.delta) - Math.abs(a.delta));
    }, [planningOrders]);

    const deliveryInspectionOverMismatches = useMemo(() => {
        return deliveryInspectionMismatches
            .filter((entry: any) => Number(entry?.delta) > 0)
            .sort((a: any, b: any) => b.delta - a.delta);
    }, [deliveryInspectionMismatches]);

    const deliveryInspectionUnderMismatches = useMemo(() => {
        return deliveryInspectionMismatches
            .filter((entry: any) => Number(entry?.delta) < 0)
            .sort((a: any, b: any) => a.delta - b.delta);
    }, [deliveryInspectionMismatches]);

    const visibleDeliveryInspectionMismatches = useMemo(() => {
        if (deliveryMismatchFilter === "over") return deliveryInspectionOverMismatches;
        if (deliveryMismatchFilter === "under") return deliveryInspectionUnderMismatches;
        return deliveryInspectionMismatches;
    }, [deliveryMismatchFilter, deliveryInspectionMismatches, deliveryInspectionOverMismatches, deliveryInspectionUnderMismatches]);

    const selectedOrder = useMemo(() => {
        if (!selectedOrderId) return null;
        return planningOrders.find((o: OrderRecord) => o.id === selectedOrderId || o.orderId === selectedOrderId) || null;
    }, [planningOrders, selectedOrderId]);

    const selectedDetailEntry = useMemo(() => {
        if (selectedOrder) return selectedOrder;
        if (selectedSidebarEntry?.isArchivedOrder) return selectedSidebarEntry;
        return null;
    }, [selectedOrder, selectedSidebarEntry]);

    const selectedSidebarEntryId = useMemo(() => {
        if (selectedSidebarEntry?.orderId) return selectedSidebarEntry.orderId;
        if (selectedSidebarEntry?.id) return selectedSidebarEntry.id;
        return selectedOrderId;
    }, [selectedSidebarEntry, selectedOrderId]);

  const bm01Products = useMemo(() => {
        return products.filter((p: ProductRecord) => {
        const station = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
        const step = (p.currentStep || "").toUpperCase();
        const status = (p.status || "").toUpperCase();
        
        const isMatch = station.includes("BM01") || step.includes("INSPECTIE") || step.includes("KEUR") || status.includes("KEUR") || step === "EINDINSPECTIE" || step === "BM01";
        
        const isRejected = status === "REJECTED" || step === "REJECTED" || status === "AFKEUR";
        const isFinished = step === "FINISHED" || station === "GEREED";
        
        return isMatch && !isFinished && !isRejected;
    });
  }, [products]);

    const nahardingProducts = useMemo(() => {
        const items = products.filter((p: ProductRecord) => {
            const station = String(p.currentStation || "").toUpperCase().replace(/\s/g, "");
            const step = String(p.currentStep || "").toUpperCase().replace(/\s/g, "");
            const status = String(p.status || "").toUpperCase().trim();
            const isLegacyQcVirtual = Boolean(p?.isVirtualLot) && (step === "QC_VIRTUAL" || status === "QC VIRTUAL ISSUED");

            const isNaharding =
                station.includes("NAHARD") ||
                station.includes("OVEN") ||
                step.includes("NAHARD") ||
                step.includes("OVEN") ||
                status === "TE NAHARDEN" ||
                isLegacyQcVirtual;

            const isClosed =
                status === "COMPLETED" ||
                status === "REJECTED" ||
                status === "AFKEUR" ||
                step === "FINISHED" ||
                station === "GEREED";

            return isNaharding && !isClosed;
        });

        return items.sort((a: any, b: any) => getNahardingOfferedMillis(b) - getNahardingOfferedMillis(a));
    }, [products]);

    const latestNahardingBatchDateKey = useMemo(() => {
        if (nahardingProducts.length === 0) return "";
        const latest = getNahardingOfferedMillis(nahardingProducts[0]);
        if (!latest) return "";
        return format(new Date(latest), "yyyy-MM-dd");
    }, [nahardingProducts]);

    const nahardingBatchProducts = useMemo(() => {
        return [...nahardingProducts].sort((a: any, b: any) => {
            const orderA = String(a.orderId || "").trim();
            const orderB = String(b.orderId || "").trim();
            return orderA.localeCompare(orderB);
        });
    }, [nahardingProducts]);

    const latestNahardingBatchLabel = useMemo(() => {
        if (!latestNahardingBatchDateKey) return "";
        const parsed = new Date(latestNahardingBatchDateKey + "T00:00:00");
        if (!isValid(parsed)) return latestNahardingBatchDateKey;
        return format(parsed, "EEEE d MMMM yyyy", { locale: nl });
    }, [latestNahardingBatchDateKey]);

  useEffect(() => {
    if (activeTab !== "completed" && activeTab !== "naharding_batch") return;

    const year = selectedDate.getFullYear();
    let start, end;

    if (viewMode === "day" || viewMode === "export") {
        start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);
    } else {
        start = startOfISOWeek(selectedDate);
        start.setHours(0, 0, 0, 0);
        end = endOfISOWeek(selectedDate);
        end.setHours(23, 59, 59, 999);
    }

    let queryEnd = new Date(end);
    if (activeTab === "naharding_batch") {
        const maxEnd = new Date(end);
        maxEnd.setDate(maxEnd.getDate() + 14);
        
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        
        queryEnd = maxEnd < now ? maxEnd : now;
        if (queryEnd < end) queryEnd = new Date(end);
    }

    const archiveRef = archiveColPath(year);
    const q = query(
        archiveRef,
        where("timestamps.finished", ">=", start),
        where("timestamps.finished", "<=", queryEnd)
    );

    const unsub = onSnapshot(q, (snap) => {
        const items: ProductRecord[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProductRecord, 'id'>) }));
        setArchivedProducts(items);
    }, (err) => {
        console.error("Fout bij ophalen archief:", err);
    });

    return () => unsub();
  }, [selectedDate, activeTab, viewMode]);

  const nahardingPrintList = useMemo(() => {
      const isTargetPeriod = (p: ProductRecord) => {
          const ts = getNahardingOfferedMillis(p);
          if (!ts) return false;
          const date = new Date(ts);
          if (viewMode === "export") {
              if (lastNahardingResetAt) {
                  return ts > new Date(lastNahardingResetAt).getTime();
              }
              return isSameDay(date, new Date());
          } else if (viewMode === "day") {
              return isSameDay(date, selectedDate);
          } else {
              const start = startOfISOWeek(selectedDate);
              const end = endOfISOWeek(selectedDate);
              return isWithinInterval(date, { start, end });
          }
      };
      const activeMatches = products.filter((p: ProductRecord) => isTargetPeriod(p));
      const archivedMatches = archivedProducts.filter((p: ProductRecord) => isTargetPeriod(p));
      const combined: ProductRecord[] = [...activeMatches];
      archivedMatches.forEach((archived: ProductRecord) => {
          if (!combined.some((p: ProductRecord) => p.id === archived.id)) combined.push(archived);
      });
      return combined.sort((a: any, b: any) => {
          const orderA = String(a.orderId || "").trim();
          const orderB = String(b.orderId || "").trim();
          if (orderA !== orderB) {
              return orderA.localeCompare(orderB);
          }
          return getNahardingOfferedMillis(a) - getNahardingOfferedMillis(b);
      });
  }, [products, archivedProducts, selectedDate, viewMode, lastNahardingResetAt]);

  const completedProducts = useMemo(() => {
        const activeFinished: ProductRecord[] = products.filter((p: ProductRecord) => {
        const station = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
        const status = (p.status || "").toUpperCase();
        
        const isFinished = status === 'COMPLETED' || p.currentStep === 'Finished' || station === 'GEREED';
        
        if (!isFinished) return false;

        const finishDate = toDateFromMixed(p.timestamps?.finished || p.updatedAt);

        if (!finishDate) return false;

        if (viewMode === "day") {
            return isSameDay(finishDate, selectedDate);
        } else {
            const start = startOfISOWeek(selectedDate);
            const end = endOfISOWeek(selectedDate);
            return isWithinInterval(finishDate, { start, end });
        }
    });

    const combined: ProductRecord[] = [...activeFinished];
    archivedProducts.forEach((archived: ProductRecord) => {
        if (!combined.some((p: ProductRecord) => p.id === archived.id)) {
            combined.push(archived);
        }
    });

    return combined.sort((a: any, b: any) => {
        const orderA = String(a.orderId || "").trim();
        const orderB = String(b.orderId || "").trim();
        if (orderA !== orderB) {
            return orderA.localeCompare(orderB);
        }
                const tA = toMillisFromMixed(a.timestamps?.finished || a.updatedAt || 0);
                const tB = toMillisFromMixed(b.timestamps?.finished || b.updatedAt || 0);
        return tB - tA;
    });
  }, [products, archivedProducts, selectedDate, viewMode]);

    return {
        planningOrders,
        deliveryInspectionMismatches,
        deliveryInspectionOverMismatches,
        deliveryInspectionUnderMismatches,
        visibleDeliveryInspectionMismatches,
        selectedOrder,
        selectedDetailEntry,
        selectedSidebarEntryId,
        bm01Products,
        nahardingProducts,
        latestNahardingBatchDateKey,
        nahardingBatchProducts,
        latestNahardingBatchLabel,
        archivedProducts,
        setArchivedProducts,
        nahardingPrintList,
        completedProducts,
        getNahardingOfferedMillis,
        archiveColPath,
        toMillisFromMixed,
        toDateFromMixed
    };
};
