import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db, logActivity } from "../../../config/firebase";
import { PATHS, getPathString } from "../../../config/dbPaths";
import { queuePrintJob, startProductionLots, completeTrackedProductRepair } from "../../../services/planningSecurityService";

// Tijdelijke types voor documenten (deze komen overeen met Terminal.tsx)
type TrackedProductDoc = any;
type PlanningOrder = any;

export interface UseTerminalActionsProps {
  user: any;
  notify: any;
  effectiveStationId: string;
  stationName?: string;
  isBH18: boolean;
  isNabewerking: boolean;
  isLossenStation: boolean;
  isBM01: boolean;
  isBH31: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  allTracked: TrackedProductDoc[];
  activeWikkelingen: TrackedProductDoc[];
  selectedWikkeling: TrackedProductDoc | undefined;
  setSelectedTrackedId: (id: string | null) => void;
  scanInput: string;
  setScanInput: (val: string) => void;
}

export function useTerminalActions({
  user,
  notify,
  effectiveStationId,
  stationName,
  isBH18,
  isNabewerking,
  isLossenStation,
  isBM01,
  isBH31,
  activeTab,
  setActiveTab,
  allTracked,
  activeWikkelingen,
  selectedWikkeling,
  setSelectedTrackedId,
  scanInput,
  setScanInput,
}: UseTerminalActionsProps) {
  const { t } = useTranslation();

  const [showStartModal, setShowStartModal] = useState(false);
  const [productToRelease, setProductToRelease] = useState<TrackedProductDoc | null>(null);
  const [bulkProductsToRelease, setBulkProductsToRelease] = useState<TrackedProductDoc[]>([]);
  const [releaseAutoApproveToken, setReleaseAutoApproveToken] = useState(0);
  const [viewingProduct, setViewingProduct] = useState<TrackedProductDoc | null>(null);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [itemToRepair, setItemToRepair] = useState<TrackedProductDoc | null>(null);
  const [pendingQcSteekproefLot, setPendingQcSteekproefLot] = useState<string | null>(null);
  const [releaseDefaultStatus, setReleaseDefaultStatus] = useState<string | undefined>(undefined);
  const [releaseDefaultReasons, setReleaseDefaultReasons] = useState<string[] | undefined>(undefined);

  // Scan handler voor wikkelen tab
  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim();
      if (!code) return;
      const codeUpper = code.toUpperCase();
      if (codeUpper === "FPI-ACTION-APPROVE-OK") {
        const isWikkelenStep = (selectedWikkeling?.currentStep || "").toLowerCase() === "wikkelen";
        if (!isBH18) {
          notify(String(t("digitalplanning.terminal.ok_qr_not_available")) as never);
          setScanInput("");
          return;
        }
        if (selectedWikkeling && isWikkelenStep) {
          setProductToRelease(selectedWikkeling);
          setBulkProductsToRelease([]);
          setReleaseAutoApproveToken(Date.now());
          setScanInput("");
        } else {
          notify(String(t("digitalplanning.terminal.select_active_bh18_before_qr")) as never);
          setScanInput("");
        }
        return;
      }
      
      const found = activeWikkelingen.find((i: any) => 
        (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
        (i.orderId || "").toLowerCase() === code.toLowerCase()
      );
      if (found) {
        setSelectedTrackedId(found.id);
        setScanInput("");
      } else {
        notify(String(t("digitalplanning.terminal.item_not_found_active_winding")) as never);
        setScanInput("");
      }
    }
  };

  const handleOpenReleaseModal = (product: TrackedProductDoc, bulkProducts: TrackedProductDoc[] = []) => {
    setProductToRelease(product || null);
    if (Array.isArray(bulkProducts) && bulkProducts.length > 1) {
      setBulkProductsToRelease(bulkProducts);
    } else {
      setBulkProductsToRelease([]);
    }
  };

  const handleViewDrawing = async (productId: string | TrackedProductDoc) => {
    if (!productId) return;
    try {
      if (typeof productId === 'object') {
        setViewingProduct(productId);
        return;
      }
      // 1. Direct op document ID
      const docRef = doc(db, `${getPathString(PATHS.PRODUCTS)}/${productId}`);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setViewingProduct({ id: snap.id, ...snap.data() });
        return;
      }
      // 2. Zoek op articleCode
      const productsRef = collection(db, getPathString(PATHS.PRODUCTS));
      const q = query(productsRef, where("articleCode", "==", productId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        setViewingProduct({ id: qSnap.docs[0].id, ...qSnap.docs[0].data() });
        return;
      }
      // 3. Materiaalvariant fallback: CST(C) ↔ EST(E) op positie 6
      const upper = String(productId).toUpperCase();
      let variantCode = null;
      if (upper.length >= 8) {
        if (upper[6] === "C") variantCode = upper.slice(0, 6) + "E" + upper.slice(7);
        else if (upper[6] === "E") variantCode = upper.slice(0, 6) + "C" + upper.slice(7);
      }
      if (variantCode) {
        const vq = query(productsRef, where("articleCode", "==", variantCode));
        const vSnap = await getDocs(vq);
        if (!vSnap.empty) {
          setViewingProduct({ id: vSnap.docs[0].id, ...vSnap.docs[0].data() });
          return;
        }
      }
      notify((String(t("digitalplanning.terminal.product_not_found"))) as any);
    } catch (err) {
      console.error("Fout bij laden product:", err);
    }
  };

  const handleStartProduction = async (
    order: PlanningOrder,
    lot: string,
    _stringCount: number | string,
    _manualOrderInput?: string,
    _operatorInput?: string,
    _selectedOperatorName?: string,
    labelZplData?: string,
    labelTemplateId?: string,
    startOptions: Record<string, unknown> = {}
  ) => {
    const previousTab = activeTab;
    const shouldJumpToWinding = !isNabewerking && !isLossenStation && !isBM01 && !isBH31;

    try {
      const cleanOrderId = String(order.orderId).trim();
      const cleanItemCode = String(order.itemCode || order.productId).trim();
      const startLot = String(lot || "").trim().toUpperCase();
      const explicitLotNumbers = Array.isArray(startOptions?.lotNumbers)
        ? startOptions.lotNumbers.map((entry: unknown) => String(entry || "").trim().toUpperCase()).filter(Boolean)
        : [];
      const totalToProduce = explicitLotNumbers.length > 0 ? explicitLotNumbers.length : Math.max(1, parseInt(String(_stringCount), 10) || 1);
      const seriesGroupId = String(startOptions?.seriesGroupId || "").trim() || null;

      setShowStartModal(false);
      if (shouldJumpToWinding) {
        setActiveTab("wikkelen");
      }

      const startResult = await startProductionLots({
        orderDocId: order.id as string,
        orderDocPath: order?.__docPath || "",
        orderSourcePath: order?.sourcePath || "",
        orderId: cleanOrderId,
        itemCode: cleanItemCode,
        item: order.item || "",
        lotStart: startLot,
        totalToProduce,
        stationId: effectiveStationId,
        stationLabel: stationName,
        actorLabel: user?.email || "Operator",
        labelZplData: typeof labelZplData === "string" ? labelZplData : "",
        labelTemplateId: labelTemplateId || "",
        seriesGroupId,
        isFlangeSeries: !!startOptions?.isFlangeSeries,
        lotNumbers: explicitLotNumbers,
        stringCount: totalToProduce,
      }) as { createdLots?: string[], firstLot?: string };

      const createdLots = Array.isArray(startResult?.createdLots)
        ? startResult.createdLots
        : [startResult?.firstLot || startLot].filter(Boolean);

      const startLabelZpl = String(labelZplData || "").trim();
      const printerId = String((startOptions as any)?.printerId || "").trim();
      const skipStartLabel = Boolean((startOptions as any)?.skipStartLabel);
      const requestedLabelCount = Math.max(
        1,
        Number.parseInt(String((startOptions as any)?.requestedLabelCount || "1"), 10) || 1
      );

      if (!skipStartLabel && startLabelZpl && printerId) {
        try {
          await queuePrintJob(printerId, startLabelZpl, {
            source: "production_start",
            orderId: cleanOrderId,
            lotNumber: startLot,
            quantity: requestedLabelCount,
            labelCount: requestedLabelCount,
            forceQuantityCopies: true,
            stationId: effectiveStationId,
            machineId: effectiveStationId,
            originMachine: effectiveStationId,
            labelTemplateId: String(labelTemplateId || "").trim(),
            description: `Startlabel voor ${cleanOrderId} (Lot: ${startLot}) (x${requestedLabelCount})`,
          });
        } catch (queueError) {
          console.error("Kon startlabel niet in de printqueue zetten:", queueError);
        }
      }

      if (startOptions?.isQcSteekproef && createdLots.length > 0) {
        setPendingQcSteekproefLot(createdLots[0]);
      }

      void logActivity(
        user?.uid || "system",
        "ORDER_RELEASE",
        `Terminal start productie: order ${order.orderId}, station ${effectiveStationId}, lots ${createdLots.join(", ")}`
      ).catch((logError) => {
        console.error("LogActivity fout na productie-start:", logError);
      });
    } catch (err) {
      console.error("Fout bij starten productie:", err);
      setShowStartModal(true);
      setActiveTab(previousTab);
      throw err;
    }
  };

  useEffect(() => {
    if (pendingQcSteekproefLot && allTracked && allTracked.length > 0) {
      const foundProduct = allTracked.find((p: any) => p.lotNumber === pendingQcSteekproefLot);
      if (foundProduct) {
        setProductToRelease(foundProduct as TrackedProductDoc);
        setReleaseDefaultStatus("rejected");
        setReleaseDefaultReasons(["rejection.qcSample"]);
        setPendingQcSteekproefLot(null);
      }
    }
  }, [allTracked, pendingQcSteekproefLot]);

  const handleRepair = (item: TrackedProductDoc) => {
    setItemToRepair(item);
    setShowRepairModal(true);
  };

  const handleRepairComplete = async (data: { actions?: string[], notes?: string }) => {
    if (!itemToRepair) return;
    try {
      await completeTrackedProductRepair({
        productId: itemToRepair.id || itemToRepair.lotNumber,
        station: effectiveStationId,
        actions: data.actions || [],
        note: data.notes || "",
        actorLabel: user?.email || "Operator",
        source: "Terminal",
      });

      await logActivity(
        user?.uid || "system",
        "QUALITY_REPAIR_COMPLETE",
        `Reparatie voltooid: lot ${itemToRepair.lotNumber || itemToRepair.id}, station ${effectiveStationId}`
      );

      setShowRepairModal(false);
      setItemToRepair(null);
    } catch (err) {
      console.error("Fout bij reparatie afronden:", err);
    }
  };

  return {
    showStartModal,
    setShowStartModal,
    productToRelease,
    setProductToRelease,
    bulkProductsToRelease,
    setBulkProductsToRelease,
    releaseAutoApproveToken,
    setReleaseAutoApproveToken,
    viewingProduct,
    setViewingProduct,
    showRepairModal,
    setShowRepairModal,
    itemToRepair,
    setItemToRepair,
    releaseDefaultStatus,
    setReleaseDefaultStatus,
    releaseDefaultReasons,
    setReleaseDefaultReasons,

    handleScan,
    handleOpenReleaseModal,
    handleViewDrawing,
    handleStartProduction,
    handleRepair,
    handleRepairComplete,
  };
}
