/* eslint-disable */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  ScanBarcode,
  Keyboard,
} from "lucide-react";
import {
  collection,
  collectionGroup,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../config/dbPaths";
import { toDateSafe } from "../../utils/dateUtils";
import {
  getISOWeek,
  getISOWeekYear,
  addWeeks,
  subWeeks,
  subDays,
} from "date-fns";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import ProductDetailModal from "../products/ProductDetailModal";
import LossenView from "./LossenView";
import Nabewerken from "./Nabewerken";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { normalizeMachine, getStartedCounterField } from "../../utils/hubHelpers";
import { getOrderFinishedUnits } from "../../utils/planningProgress";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import { shouldHidePlanningOrder } from "../../utils/terminalOrderFilters";
import { useTerminalData } from "./terminal/useTerminalData";

import TerminalPlanningView from "./terminal/TerminalPlanningView";
import TerminalProductionView from "./terminal/TerminalProductionView";
import TerminalManualInput from "./terminal/TerminalManualInput";
import TerminalGereedTab from "./terminal/TerminalGereedTab";
import MalOptimizationPanel from "./MalOptimizationPanel";
import MazakView from "./MazakView";
import RepairModal from "./modals/RepairModal";
import { useNotifications } from '../../contexts/NotificationContext';
import { queuePrintJob, startProductionLots } from "../../services/planningSecurityService";
import { completeTrackedProductRepair } from "../../services/planningSecurityService";

const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";
const GEREED_TAB_SOURCE_STATIONS = new Set(["BH11", "BH12", "BH15", "BH16", "BH17", "BH18", "BH31"]);

declare const __app_id: string | undefined;

type StationLike = { id?: string; name?: string } | string | null | undefined;

type TrackedProductDoc = {
  id: string;
  orderId?: string;
  lotNumber?: string;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  originMachine?: string;
  machine?: string;
  lastStation?: string;
  item?: string;
  itemCode?: string;
  itemDescription?: string;
  productId?: string;
  drawing?: string;
  isManualMove?: boolean;
  inspection?: {
    status?: string;
    [key: string]: unknown;
  };
  timestamps?: Record<string, unknown>;
  createdAt?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
};

type PlanningOrder = {
  id?: string;
  orderId?: string;
  orderNumber?: string;
  item?: string;
  itemCode?: string;
  productId?: string;
  machine?: string;
  originalMachine?: string;
  sourceStation?: string;
  returnStation?: string;
  station?: string;
  workstation?: string;
  machineId?: string;
  wc?: string;
  status?: string;
  plan?: number | string;
  quantity?: number | string;
  produced?: number | string;
  week?: string | number;
  weekNumber?: string | number;
  year?: string | number;
  weekYear?: string | number;
  dateObj?: any;
  sourcePath?: string;
  __docPath?: string;
  priority?: boolean | string;
  isMoved?: boolean;
  isUrgent?: boolean;
  [key: string]: unknown;
};

type EnrichedPlanningOrder = PlanningOrder & {
  produced: number;
  startedAtStation: number;
  parsedYear?: number;
  parsedWeek?: number;
};

type TerminalProps = {
  initialStation?: StationLike;
  onCancelProduction?: (productId: string) => void;
  orders?: PlanningOrder[];
};

/**
 * Workstation Terminal - V22.5
 * - Oplossing voor 2026 weeknotatie (W3 vs W03).
 * - Automatische selectie-reset bij navigatie.
 * - Alles-knop toegevoegd en zoekknop uit toolbar verwijderd.
 */
const Terminal = ({ initialStation, onCancelProduction, orders = [] }: TerminalProps) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();

  // Station configuratie
  const stationId = initialStation && typeof initialStation === "object" ? initialStation.id : initialStation;
  const stationName = initialStation && typeof initialStation === "object" ? initialStation.name : initialStation;
  const effectiveStationId = (stationName || stationId) as string;
  const normalizedStationId = (normalizeMachine(effectiveStationId) || "").toUpperCase().trim();
  const cleanStationId = normalizedStationId.replace(/\s/g, "");

  const isNabewerking = useMemo(() => normalizedStationId === "NABEWERKING" || cleanStationId === "NABEWERKING" || normalizedStationId.includes("NABEWERKING") || normalizedStationId.includes("NABEWERKEN"), [normalizedStationId, cleanStationId]);
  const isMazak = normalizedStationId === "MAZAK" || cleanStationId === "MAZAK";
  const isLossen1218Station = cleanStationId === "LOSSEN12/18";
  const isLossenStation = normalizedStationId === "LOSSEN" && !isLossen1218Station;
  const isSimpleViewStation = isNabewerking || isMazak || isLossenStation;
  const isBH18 = cleanStationId === "BH18" || normalizedStationId === "BH18";
  const isGereedTabSourceStation = GEREED_TAB_SOURCE_STATIONS.has(cleanStationId);
  const isBH31 = normalizedStationId === "BH31";
  const isBM01 = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || normalizedStationId.includes("BM01");

  // State management
  const { notify } = useNotifications();
  const [activeTab, setActiveTab] = useState("planning");
  const [lossenPlanningFilter, setLossenPlanningFilter] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedTrackedId, setSelectedTrackedId] = useState<string | null>(null);
  const [planningSearch, setPlanningSearch] = useState("");
  const [wikkelenSearch, setWikkelenSearch] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputValue, setManualInputValue] = useState("");
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

  // Scan functionaliteit voor wikkelen tab
  const [scanInput, setScanInput] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  // Planning filters (Week / Alles)
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [showAllWeeks, setShowAllWeeks] = useState(true); // STANDAARD AAN: Toon alle weken met weekdividers
  
  const targetWeekNum = getISOWeek(referenceDate);
  const targetYearNum = getISOWeekYear(referenceDate);

  // NIEUW: Huidige datum voor backlog berekening (Absoluut 'Nu')
  const currentRealDate = new Date();
  const currentRealWeek = getISOWeek(currentRealDate);
  const currentRealYear = getISOWeekYear(currentRealDate);
  const absCurrentReal = currentRealYear * 52 + currentRealWeek;

  const appId = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";

  // Forceer tab reset bij station wissel
  useEffect(() => {
    if (isLossen1218Station) {
      setActiveTab("lossen"); // LOSSEN 12/18: standaard lossen tab
    } else {
      setActiveTab("planning");
    }
  }, [effectiveStationId, isLossen1218Station]);

  // RESET EFFECT: Zorg dat de details sluiten bij navigatie acties
  useEffect(() => {
    setSelectedOrderId(null);
    setSelectedTrackedId(null);
  }, [referenceDate, showAllWeeks, activeTab]);

  useEffect(() => {
    if (isGereedTabSourceStation && activeTab === "lossen") {
      setActiveTab("gereed");
    }
  }, [isGereedTabSourceStation, activeTab]);
  // Helpers
  const parseDateSafe = (dateInput: unknown) => {
    return toDateSafe(dateInput as any);
  };

  const normalizePlanningStatus = (status: unknown) => String(status || "").trim().toLowerCase();

  const normalizeTrackedStatus = (status: unknown) => String(status || "").trim().toLowerCase();

  const isTrackedProductionActive = (product: TrackedProductDoc) => {
    const status = normalizeTrackedStatus(product?.status);
    return ["in production", "in productie", "held_qc", "in_progress", "paused"].includes(status);
  };

  const isInactivePlanningStatus = (status: unknown) => {
    const normalized = normalizePlanningStatus(status);
    return ["completed", "cancelled", "shipped", "rejected", "finished", "deleted"].includes(normalized);
  };

  const isPlannedLikeStatus = (status: unknown) => {
    const normalized = normalizePlanningStatus(status);
    return ["planned", "delegated", "pending", "waiting"].includes(normalized);
  };

  const isDefinitiveRejectedOrRemoved = (product: TrackedProductDoc) => {
    const statusNorm = normalizeTrackedStatus(product?.status);
    const stepNorm = String(product?.currentStep || "").trim().toLowerCase();
    const inspectionNorm = String(product?.inspection?.status || "").trim().toLowerCase();
    const isTemporaryReject = inspectionNorm.includes("tijdelijke afkeur");

    const isRejected =
      (["rejected", "afkeur", "archived_rejected", "definitieve_afkeur", "definitief_afkeur"].includes(statusNorm) ||
        stepNorm === "rejected") &&
      !isTemporaryReject;

    const isRemoved = ["deleted", "cancelled", "canceled"].includes(statusNorm);
    return isRejected || isRemoved;
  };

  const toFiniteNumber = (value: unknown) => {
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;

    const raw = String(value || "").trim();
    if (!raw) return 0;
    const normalized = raw.replace(",", ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  
  const terminalData = useTerminalData({
    initialStation,
    orders,
    planningSearch,
    wikkelenSearch,
    lossenPlanningFilter,
    referenceDate,
    showAllWeeks
  });

  const {
    allOrders, allTracked, archiveTrackedItems, loading, setLoading,
    stationCounterField,
    stationOrderMeta, madeCountMap, myOrders, productionProgressMap, rejectedCountMap, readyForReturnMap, waitingForLossenMap,
    activeWikkelingen, lotConflictMeta, repairItems, filteredOrders, lossenFilteredOrders
  } = terminalData;

  const selectedOrder = useMemo(() => {
    const planningSource = isLossen1218Station ? lossenFilteredOrders : filteredOrders;
    const fromPlanning = planningSource.find(
      (o: any) => o.id === selectedOrderId || o.orderId === selectedOrderId
    );
    if (fromPlanning) return fromPlanning;
    return myOrders.find(
      (o: any) => o.id === selectedOrderId || o.orderId === selectedOrderId
    ) || null;
  }, [isLossen1218Station, lossenFilteredOrders, filteredOrders, myOrders, selectedOrderId]);

  const selectedWikkeling = useMemo(() => activeWikkelingen.find((p: any) => p.id === selectedTrackedId), [activeWikkelingen, selectedTrackedId]);

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

// Handlers
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
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

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <Loader2 className="animate-spin text-blue-600" size={48} />
    </div>
  );

  if (isSimpleViewStation) {
    if (isNabewerking) {
      return (
        <div className="flex-1 overflow-hidden h-full text-left">
          <Nabewerken products={allTracked as any} orders={orders} />
        </div>
      );
    }
    if (isMazak) {
      return (
        <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
          <div className="flex-1 overflow-hidden h-full text-left">
            <MazakView stationId={effectiveStationId || undefined} products={allTracked as any} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
        <div className="flex-1 overflow-hidden h-full text-left">
          <LossenView stationId={effectiveStationId || undefined} appId={appId || undefined} products={allTracked as any} />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
      {/* TABS HEADER (ZOEKEN VERWIJDERD) */}
        <div className="p-2 bg-white border-b border-slate-200 shrink-0 shadow-sm text-left">
          <div className="flex items-center justify-center relative">
            <div className="flex bg-slate-100 p-1 rounded-2xl w-full max-w-xl">
              {(() => {
                const tabLabels = isLossen1218Station
                  ? [t("digitalplanning.terminal.tab_lossen"), t("digitalplanning.terminal.tab_planning")]
                  : isBM01
                    ? [t("digitalplanning.terminal.tab_planning"), t("digitalplanning.terminal.tab_to_offer")]
                    : isGereedTabSourceStation
                      ? [t("digitalplanning.terminal.tab_planning"), t("digitalplanning.terminal.tab_winding"), t("digitalplanning.terminal.tab_ready", "Gereed")]
                      : [t("digitalplanning.terminal.tab_planning"), t("digitalplanning.terminal.tab_winding"), t("digitalplanning.terminal.tab_lossen")];

                const tabKeys = isLossen1218Station
                  ? ["lossen", "planning"]
                  : isBM01
                    ? ["planning", "aan te bieden"]
                    : isGereedTabSourceStation
                      ? ["planning", "wikkelen", "gereed"]
                      : ["planning", "wikkelen", "lossen"];

                return tabLabels.map((tabLabel, idx) => {
                  const tabKey = tabKeys[idx];
                return (
                  <button
                    key={tabKey}
                    onClick={() => handleTabChange(tabKey)}
                    className={`flex-1 px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeTab === tabKey ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tabLabel}
                  </button>
                );
                });
              })()}
            </div>

            {/* Scanner Mode Toggle */}
            {activeTab === "wikkelen" && (
                <button 
                    onClick={() => setScannerMode(!scannerMode)}
                    className={`absolute right-0 md:right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-2 rounded-lg border-2 font-bold text-[10px] uppercase tracking-widest transition-all ${scannerMode ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-400'}`}
                  title={scannerMode ? t("digitalplanning.terminal.scanner_keyboard_hidden", "Toetsenbord verborgen (Scanner modus)") : t("digitalplanning.terminal.normal_input", "Normale invoer")}
                >
                    {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
                  <span className="hidden sm:inline">{scannerMode ? t("digitalplanning.terminal.scanner", "Scanner") : t("digitalplanning.terminal.keyboard", "Toetsenbord")}</span>
                </button>
            )}
          </div>
        </div>

      {/* CONTENT GEBIED */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {
          /* STANDAARD PLANNING & WIKKELEN FLOW */
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row text-left">
            {activeTab === "planning" && isLossen1218Station ? (
              /* LOSSEN 12/18: Volledige planning van BH12/15/17/18 met machinefilter */
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Machine filter bar */}
                <div className="flex items-center gap-2 px-3 pt-2 pb-2 bg-white border-b border-slate-100 shrink-0 flex-wrap">
                  {[null, "BH12", "BH15", "BH17", "BH18"].map(f => (
                    <button
                      key={f ?? "all"}
                      onClick={() => setLossenPlanningFilter(f)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                        lossenPlanningFilter === f
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      {f ?? t("common.all", "Alles")}
                    </button>
                  ))}
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-auto">
                    {lossenFilteredOrders.length} {t("digitalplanning.terminal.orders", "orders")}
                  </span>
                </div>
                <div className="flex-1 overflow-hidden flex lg:flex-row">
                <TerminalPlanningView
                    orders={lossenFilteredOrders as any}
                    selectedOrderId={selectedOrderId}
                    onSelectOrder={(id: string | null | undefined) => setSelectedOrderId(id || null)}
                    searchTerm={planningSearch}
                    onSearchChange={setPlanningSearch}
                    referenceDate={referenceDate}
                    onDateChange={(direction: 'reset' | 'prev' | 'next') => {
                      if (direction === 'reset') setReferenceDate(new Date());
                      else setReferenceDate(direction === 'prev' ? subWeeks(referenceDate, 1) : addWeeks(referenceDate, 1));
                    }}
                    showAllWeeks={showAllWeeks}
                    onToggleAllWeeks={() => setShowAllWeeks(!showAllWeeks)}
                    targetWeekNum={targetWeekNum}
                    productionProgressMap={productionProgressMap}
                    rejectedCountMap={rejectedCountMap}
                    readyForReturnMap={readyForReturnMap}
                    isBM01={false}
                    trackedProducts={allTracked as any}
                    onStartProduction={undefined}
                    selectedOrder={selectedOrder as any}
                    onViewDrawing={handleViewDrawing}
                    repairItems={[]}
                    onRepair={undefined}
                    optimizationPanel={
                      <MalOptimizationPanel
                        currentOrder={selectedOrder as any}
                        allOrders={myOrders as any[]}
                        onSelectOrder={(id: string | undefined) => setSelectedOrderId(id || null)}
                      />
                    }
                  />
                </div>
              </div>
            ) : activeTab === "planning" ? (
            <TerminalPlanningView
                orders={filteredOrders as any}
                selectedOrderId={selectedOrderId}
                onSelectOrder={(id: string | null | undefined) => setSelectedOrderId(id || null)}
                searchTerm={planningSearch}
                onSearchChange={setPlanningSearch}
                referenceDate={referenceDate}
                onDateChange={(direction: 'reset' | 'prev' | 'next') => {
                  if (direction === 'reset') setReferenceDate(new Date());
                  else setReferenceDate(direction === 'prev' ? subWeeks(referenceDate, 1) : addWeeks(referenceDate, 1));
                }}
                showAllWeeks={showAllWeeks}
                onToggleAllWeeks={() => setShowAllWeeks(!showAllWeeks)}
                targetWeekNum={targetWeekNum}
                productionProgressMap={productionProgressMap}
                rejectedCountMap={rejectedCountMap}
                readyForReturnMap={readyForReturnMap}
                isBM01={isBM01}
                trackedProducts={allTracked as any}
                onStartProduction={() => setShowStartModal(true)}
                selectedOrder={selectedOrder as any}
                onViewDrawing={handleViewDrawing}
                repairItems={repairItems as any}
                onRepair={handleRepair}
                // Mal Optimalisatie: Toon gerelateerde orders in het paneel
                optimizationPanel={
                  <MalOptimizationPanel 
                    currentOrder={selectedOrder as any}
                    allOrders={myOrders as any[]}
                    onSelectOrder={(id: string | undefined) => setSelectedOrderId(id || null)}
                  />
                }
              />
            ) : activeTab === "wikkelen" ? (
              /* TAB WIKKELEN */
            <TerminalProductionView
                activeWikkelingen={activeWikkelingen as any}
                lotConflictMeta={lotConflictMeta}
                selectedTrackedId={selectedTrackedId}
                onSelectTracked={(id: string | null | undefined) => setSelectedTrackedId(id || null)}
                selectedWikkeling={selectedWikkeling}
                onReleaseProduct={handleOpenReleaseModal}
                scanInput={scanInput}
                setScanInput={setScanInput as any}
                onScan={handleScan as any}
                scanInputRef={scanInputRef}
                scannerMode={scannerMode}
                onCancelProduction={onCancelProduction}
                activeTab={activeTab}
              />
            ) : activeTab === "gereed" ? (
              <TerminalGereedTab
                allTracked={allTracked as any}
                stationId={stationId || undefined}
                effectiveStationId={effectiveStationId || undefined}
              />
            ) : (
              /* TAB LOSSEN */
              <div className="flex-1 overflow-hidden h-full text-left">
                {isMazak ? (
                  <MazakView stationId={effectiveStationId || undefined} products={allTracked as any} />
                ) : (
                  <LossenView stationId={effectiveStationId || undefined} appId={appId || undefined} products={allTracked as any} />
                )}
              </div>
            )}
          </div>
        }
      </div>
    </div>

      {/* OVERIG (SNEL ZOEKEN & MODALS) */}
      <TerminalManualInput
        isOpen={showManualInput}
        onClose={() => setShowManualInput(false)}
        value={manualInputValue}
        onChange={setManualInputValue}
        onSearch={() => {
          if (activeTab === "wikkelen") {
            setWikkelenSearch(manualInputValue);
          } else {
            setPlanningSearch(manualInputValue);
          }
          setShowManualInput(false);
        }}
      />

      {showStartModal && selectedOrder && (
        <div className="fixed z-[9999]">
      <ProductionStartModal
            isOpen={true} onClose={() => setShowStartModal(false)}
            order={selectedOrder} stationId={stationId || undefined}
            onStartInitiated={() => {
              setShowStartModal(false);
              if (!isNabewerking && !isLossenStation && !isBM01 && !isBH31) {
                setActiveTab("wikkelen");
              }
            }}
          onStart={handleStartProduction} existingProducts={allTracked as any[]}
          />
        </div>
      )}
      
      {productToRelease && (
        <div className="fixed z-[9999]">
      <ProductReleaseModal
            isOpen={true} product={productToRelease}
          bulkProducts={bulkProductsToRelease}
            autoApproveTrigger={releaseAutoApproveToken}
            defaultStatus={releaseDefaultStatus}
            defaultReasons={releaseDefaultReasons}
            onClose={() => {
              setProductToRelease(null);
              setBulkProductsToRelease([]);
              setSelectedTrackedId(null);
              setReleaseDefaultStatus(undefined);
              setReleaseDefaultReasons(undefined);
            }}
            appId={appId || undefined}
          />
        </div>
      )}

      {showRepairModal && itemToRepair && (
        <div className="fixed z-[9999]">
          <RepairModal
              product={itemToRepair}
              onClose={() => { setShowRepairModal(false); setItemToRepair(null); }}
              onConfirm={handleRepairComplete}
          />
        </div>
      )}

      {viewingProduct && (
        <div className="fixed z-[9999]">
          <ProductDetailModal
            product={viewingProduct}
            onClose={() => setViewingProduct(null)}
            userRole={user?.role || "operator"}
          />
        </div>
      )}
    </>
  );
};

export default Terminal;
