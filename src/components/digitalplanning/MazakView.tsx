import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { 
  TimestampLike, ProductItem, OccupancyEntry, PlanningOrder, 
  LabelElement, LabelTemplate, PrinterConfig, AdminUser, 
  MazakViewProps, SeriesHeaderRow, DisplayRow, MazakTab, 
  SavedFreeLabelTemplate, MazakTabNavigationProps, MazakListItemCardProps,
  MazakPlanningOrderCardProps, MazakAdjustListItemCardProps, MazakSelectedProductHeroProps,
  MazakSelectedPlanningOrderHeroProps, MazakPlanningActiveLotsPanelProps,
  MazakAdjustSelectionPanelProps, MazakEmptySelectionPlaceholderProps,
  MazakFreeLabelHeroProps, MazakFreeLabelPreviewPanelProps, MazakFreeLabelActionsProps,
  MazakFreeLabelAlignmentSelectorProps, MazakFreeLabelSizingFieldsProps,
  MazakFreeLabelTextFieldsProps, MazakFreeLabelFormPanelProps, MazakAdjustModalHeaderProps,
  MazakAdjustOrderModalActionsProps, MazakAdjustRequestModalActionsProps, MazakAdjustPreviewPanelProps,
  MazakAdjustOrderModalLeftPanelProps, MazakAdjustRequestModalBodyProps,
  TranslateFn
} from './mazak/mazak.types';
import * as helpers from './mazak/utils/mazakHelpers';
import {
  MazakTabNavigation, MazakListItemCard, MazakPlanningOrderCard,
  MazakAdjustListItemCard, MazakSelectedProductHero, MazakSelectedPlanningOrderHero,
  MazakPlanningActiveLotsPanel, MazakAdjustSelectionPanel, MazakEmptySelectionPlaceholder,
  MazakFreeLabelHero, MazakFreeLabelPreviewPanel, MazakFreeLabelActions,
  MazakFreeLabelAlignmentSelector, MazakFreeLabelSizingFields, MazakFreeLabelTextFields,
  MazakFreeLabelFormPanel, MazakAdjustModalHeader, MazakAdjustOrderModalActions,
  MazakAdjustRequestModalActions, MazakAdjustPreviewPanel, MazakAdjustOrderModalLeftPanel,
  MazakAdjustRequestModalBody
} from './mazak/components/MazakComponents';
import { useMazakData } from './mazak/hooks/useMazakData';
import { useMazakActions } from './mazak/hooks/useMazakActions';

import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  limit,
} from "firebase/firestore";
import {
  Package,
  Loader2,
  ClipboardCheck,
  History,
  ArrowLeft,
  ArrowRight,
  ScanBarcode,
  Keyboard,
  Printer,
  ChevronDown,
  ChevronRight,
  Search,
  Tag,
  Calendar,
  Save,
  Trash2,
  X,
  Hash,
} from "lucide-react";
import { db, logActivity } from "../../config/firebase";
import { getPathString, PATHS } from "../../config/dbPaths";
import { normalizeMachine } from "../../utils/hubHelpers";
import {
  rejectTrackedProductFinal,
  completeTrackedProduct,
  tempRejectTrackedProduct,
  markMazakLabelsPrinted,
  queuePrintJob,
  reassignTrackedProductOrder,
  createProductionMessages,
} from "../../services/planningSecurityService";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useLabelPreview } from "../../hooks/useLabelPreview";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import AutoScaledLabelPreview from "../printer/AutoScaledLabelPreview";
import StatusBadge from "./common/StatusBadge";
import { getISOWeek } from "date-fns";
import { filterLabelsByProduct, processLabelData } from "../../utils/labelHelpers";
import { renderLabelToBitmapZpl } from "../../utils/zebraLabelRenderEngine";
import { resolveLinkedTemplateChain } from "../../utils/orderLabelTemplateUtils";
import { useNotifications } from '../../contexts/NotificationContext';
import { resolvePrinterForRouting } from '../../utils/printRouting';
import { useOccupancyListener } from "../../hooks/useOccupancyListener";
import { FreeLabelPrintModal } from "./modals/FreeLabelPrintModal";
import { LargeSequencePrintModal } from "./modals/LargeSequencePrintModal";

const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";
const DEFAULT_MAZAK_DPI = 300;

const MazakView = ({ stationId = "Mazak", products = [] }: MazakViewProps) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth() as { user: AdminUser | null };
  const { notify } = useNotifications();
  
  const occupancy = useOccupancyListener() as OccupancyEntry[];
  const {
    items, setItems,
    loading, setLoading,
    availableLabels,
    availablePrinters,
    savedFreeLabelTemplates, setSavedFreeLabelTemplates,
    planningOrders, setPlanningOrders
  } = useMazakData(stationId);

  
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [scanInputInbox, setScanInputInbox] = useState("");
  const [scanInputProcess, setScanInputProcess] = useState("");
  const [scanInputAdjust, setScanInputAdjust] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const selectedProductRef = useRef<ProductItem | null>(null);

  const [activeTab, setActiveTab] = useState<MazakTab>("inbox");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [bulkSeriesProducts, setBulkSeriesProducts] = useState<ProductItem[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  
  
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [printing, setPrinting] = useState(false);
  const [freeLabelText, setFreeLabelText] = useState("");
  const [freeLabelQuantity, setFreeLabelQuantity] = useState(1);
  const [freeLabelAlign, setFreeLabelAlign] = useState<"left" | "center" | "right">("left");
  const [freeLabelFontSize, setFreeLabelFontSize] = useState<number>(12);
  const [freeLabelTemplateName, setFreeLabelTemplateName] = useState("");
  
  const [selectedFreeTemplateId, setSelectedFreeTemplateId] = useState("");
  const [savingFreeTemplate, setSavingFreeTemplate] = useState(false);
  
  const [selectedPlanningOrder, setSelectedPlanningOrder] = useState<PlanningOrder | null>(null);
  const [planningSearch, setPlanningSearch] = useState("");
  const [adjustSearch, setAdjustSearch] = useState("");
  const [selectedAdjustProduct, setSelectedAdjustProduct] = useState<ProductItem | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustOrderSearch, setAdjustOrderSearch] = useState("");
  const [selectedAdjustTargetOrder, setSelectedAdjustTargetOrder] = useState<PlanningOrder | null>(null);
  const [adjustRequestNote, setAdjustRequestNote] = useState("");
  const [showAdjustOrderModal, setShowAdjustOrderModal] = useState(false);
  const [showRequestNewOrderModal, setShowRequestNewOrderModal] = useState(false);
  const [showLargeSequenceModal, setShowLargeSequenceModal] = useState(false);
  const [showFreeLabelModal, setShowFreeLabelModal] = useState(false);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const activeScanInput = activeTab === "process"
    ? scanInputProcess
    : activeTab === "adjust"
      ? scanInputAdjust
      : scanInputInbox;
  const setActiveScanInput = (value: string) => {
    if (activeTab === "process") {
      setScanInputProcess(value);
      return;
    }
    if (activeTab === "adjust") {
      setScanInputAdjust(value);
      return;
    }
    setScanInputInbox(value);
  };

  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    if (!scannerMode) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)) return;
      if (!showActionModal && activeTab !== "planning") {
        scanInputRef.current?.focus();
      }
    };

    scanInputRef.current?.focus();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showActionModal, scannerMode]);

  useEffect(() => {
    if (activeTab !== "adjust") {
      setScanInputAdjust("");
      setAdjustSearch("");
      setSelectedAdjustProduct(null);
      setAdjustReason("");
      setAdjustOrderSearch("");
      setSelectedAdjustTargetOrder(null);
      setAdjustRequestNote("");
      setShowAdjustOrderModal(false);
      setShowRequestNewOrderModal(false);
    }
  }, [activeTab]);

  
  const actions = useMazakActions({
    user, notify, stationId, items, setItems, selectedProduct, setSelectedProduct,
    scanInputInbox, setScanInputInbox, scanInputProcess, setScanInputProcess,
    scanInputAdjust, setScanInputAdjust, activeScanInput, setActiveScanInput,
    activeTab, setActiveTab, setShowActionModal, setShowPrintModal,
    setShowAdjustOrderModal, setShowRequestNewOrderModal, setShowLargeSequenceModal,
    setShowFreeLabelModal, selectedAdjustTargetOrder, adjustRequestNote, setAdjustSubmitting,
    setAdjustReason, setAdjustOrderSearch, setSelectedAdjustTargetOrder, setAdjustRequestNote,
    freeLabelTemplateName, freeLabelQuantity, freeLabelAlign, freeLabelFontSize, freeLabelText,
    setSavingFreeTemplate, setFreeLabelTemplateName, setFreeLabelText, selectedLabelId,
    availableLabels, availablePrinters, setPrinting, t: t as unknown as TranslateFn
  });
  const { handleItemClick, handleCloseModal, handleOpenActionModal, handleOpenAdjustOrderFromSelectedProduct, handleOpenRequestNewOrderFromSelectedProduct, handleReprintAdjustedOrderLabel, handlePrintLabels, handlePrintEmptyLabel, handlePrintLargeSequence, handlePrintFreeLabels, handleSaveFreeLabelTemplate, handleDeleteFreeLabelTemplate, handleManualPrintForward, handlePostProcessingFinish, handleSubmitOrderReassign, handleRequestNewOrderFromPlanner, handleScan, handleSelectTab } = actions;

  const isShiftActive = useCallback((shiftLabel: unknown) => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const label = String(shiftLabel || "").toUpperCase();

    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
      return currentTime >= 5 * 60 + 30 && currentTime < 14 * 60;
    }
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      return currentTime >= 14 * 60 && currentTime < 22 * 60 + 30;
    }
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      return currentTime >= 22 * 60 + 30 || currentTime < 5 * 60 + 30;
    }
    if (label.includes("DAG") || label === "DAGDIENST") {
      return currentTime >= 7 * 60 + 15 && currentTime < 16 * 60;
    }
    return true;
  }, []);

  const activeOperators = useMemo<string[]>(() => {
    if (!stationId || occupancy.length === 0) return [];
    const currentStation = normalizeMachine(stationId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return occupancy
      .filter((occ: OccupancyEntry) => {
        const occStation = normalizeMachine(occ.station || occ.machineId || "");
        if (occStation !== currentStation) return false;
        const dateMillis = helpers.toMillisFromMixed(occ.date);
        if (!dateMillis) return false;
        const occDate = new Date(dateMillis);
        occDate.setHours(0, 0, 0, 0);
        return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
      })
      .map((entry: OccupancyEntry) => entry.operatorNumber)
      .filter((value): value is string => Boolean(value));
  }, [occupancy, stationId, isShiftActive]);

  useEffect(() => {
    const excludedStatuses = new Set(["completed", "shipped", "deleted", "cancelled"]);
    const rootPlanningQuery = query(
      collection(db, getPathString(PATHS.PLANNING)),
      where("status", "not-in", ["completed", "shipped", "deleted", "cancelled"])
    );

    const scopedOrdersQuery = query(collectionGroup(db, 'orders'));

    let rootOrders: PlanningOrder[] = [];
    let scopedOrders: PlanningOrder[] = [];
    let unsubScopedFallback: (() => void) | null = null;

    const combineAndSetOrders = () => {
      const combined = [...rootOrders, ...scopedOrders];
      const uniqueOrders = Array.from(new Map(combined.map(o => [o.id, o])).values());
      const flOrders = uniqueOrders.filter((o: PlanningOrder) => {
         const itemStr = String(o.item || "").toUpperCase();
         const codeStr = String(o.itemCode || o.productId || o.extraCode || "").toUpperCase();
         return itemStr.includes("FL") || codeStr.includes("FL");
      });
      setPlanningOrders(flOrders);
    };

    const unsubRoot = onSnapshot(rootPlanningQuery, (snap) => {
      rootOrders = snap.docs.map((d) => ({
        id: d.id,
        orderDocId: d.id,
        orderDocPath: d.ref.path,
        ...(d.data() as Omit<PlanningOrder, "id">),
      }));
      combineAndSetOrders();
    }, (error) => console.error("Error fetching root planning:", error));

    const unsubScoped = onSnapshot(scopedOrdersQuery, (snap) => {
      scopedOrders = snap.docs
        .map((d) => ({
          id: d.id,
          orderDocId: d.id,
          orderDocPath: d.ref.path,
          ...(d.data() as Omit<PlanningOrder, "id">),
        }) as PlanningOrder)
        .filter((order) => {
          const status = String(order.status || "").trim().toLowerCase();
          return !excludedStatuses.has(status);
        });
      combineAndSetOrders();
    }, (error) => {
      console.error("Error fetching scoped planning orders:", error);
      if (unsubScopedFallback) return;

      // Extra fallback houdt listener actief bij tijdelijke watch-fouten.
      const scopedFallbackQuery = query(collectionGroup(db, "orders"));
      unsubScopedFallback = onSnapshot(
        scopedFallbackQuery,
        (fallbackSnap) => {
          scopedOrders = fallbackSnap.docs
            .map((d) => ({
              id: d.id,
              orderDocId: d.id,
              orderDocPath: d.ref.path,
              ...(d.data() as Omit<PlanningOrder, "id">),
            }) as PlanningOrder)
            .filter((order) => {
              const status = String(order.status || "").trim().toLowerCase();
              return !excludedStatuses.has(status);
            });
          combineAndSetOrders();
        },
        (fallbackError) => {
          console.error("Error fetching scoped planning orders (fallback):", fallbackError);
        }
      );
    });

    return () => {
      unsubRoot();
      unsubScoped();
      if (unsubScopedFallback) unsubScopedFallback();
    };
  }, [notify]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, getPathString(PATHS.LABEL_TEMPLATES)), (snap) => {
      const templates: LabelTemplate[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LabelTemplate, "id">) }));
      setAvailableLabels(templates);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, getPathString(PATHS.PRINTERS)), (snap) => {
      const printers: PrinterConfig[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PrinterConfig, "id">) }))
        .filter((printer) => Boolean(printer?.id));
      setAvailablePrinters(printers);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const settingsRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
    const unsub = onSnapshot(settingsRef, (snap) => {
      const rawList = (snap.data() as Record<string, unknown> | undefined)?.mazakFreeLabelTemplates;
      const list = Array.isArray(rawList) ? rawList : [];
      const normalized: SavedFreeLabelTemplate[] = list
        .map((entry) => {
          const row = (entry || {}) as Record<string, unknown>;
          const alignRaw = String(row.align || "left").toLowerCase();
          const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
          const id = String(row.id || "").trim();
          const name = String(row.name || "").trim();
          const text = String(row.text || "");
          const quantity = Math.max(1, Math.min(50, Number.parseInt(String(row.quantity || "1"), 10) || 1));
          const fontSize = helpers.clampFreeLabelFontSize(row.fontSize);
          const updatedAt = Number.parseInt(String(row.updatedAt || "0"), 10) || Date.now();
          if (!id || !name) return null;
          return { id, name, text, align, quantity, fontSize, updatedAt } as SavedFreeLabelTemplate;
        })
        .filter((row): row is SavedFreeLabelTemplate => Boolean(row))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      setSavedFreeLabelTemplates(normalized);
      if (normalized.length === 0) {
        setSelectedFreeTemplateId("");
      } else if (selectedFreeTemplateId && !normalized.some((tpl) => tpl.id === selectedFreeTemplateId)) {
        setSelectedFreeTemplateId("");
      }
    });

    return () => unsub();
  }, [selectedFreeTemplateId]);

  const filteredLabels = useMemo<LabelTemplate[]>(() => {
    if (!selectedProduct) return [];

    const productFiltered = filterLabelsByProduct(availableLabels, selectedProduct, {
      excludeTempOrderLabels: true,
    }) as LabelTemplate[];

    const flangeOnly = productFiltered.filter((template) => helpers.hasFlangeTag(template));
    const isReprintMode = activeTab === "process";

    // Herprint moet altijd mogelijk blijven voor Flange-items,
    // ook als extraCode op template/product niet (meer) exact matcht.
    if (isReprintMode) {
      return flangeOnly;
    }

    const productExtraCode = String(selectedProduct?.extraCode || "").trim().toUpperCase();

    // Voorbereiding voor fijnmazige extraCode-matching: templates zonder extraCode-beperking blijven zichtbaar.
    return flangeOnly.filter((template) => {
      const templateCodes = helpers.templateExtraCodeTokens(template);
      if (templateCodes.length === 0) return true;
      if (!productExtraCode) return false;
      return templateCodes.includes(productExtraCode);
    });
  }, [availableLabels, selectedProduct, activeTab]);

  useEffect(() => {
    if (!selectedLabelId) return;
    const stillAvailable = filteredLabels.some((label) => String(label.id) === String(selectedLabelId));
    if (!stillAvailable) {
      setSelectedLabelId("");
    }
  }, [filteredLabels, selectedLabelId]);

  const selectedRoutingTags = useMemo<string[]>(() => {
    if (!selectedLabelId) return [];

    const chain = resolveLinkedTemplateChain(availableLabels, selectedLabelId, { maxDepth: 4 }) as LabelTemplate[];
    const templates = chain.length > 0
      ? chain
      : availableLabels.filter((template) => String(template?.id || "") === String(selectedLabelId));

    return Array.from(new Set(
      templates
        .flatMap((template) => (Array.isArray(template?.tags) ? template.tags : []))
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
    ));
  }, [availableLabels, selectedLabelId]);

  const selectedQueuePrinter = useMemo<PrinterConfig | null>(() => {
    return helpers.selectQueuePrinterForStation(availablePrinters, stationId || "", selectedRoutingTags);
  }, [availablePrinters, stationId, selectedRoutingTags]);

  const mazakPrinterDpi = useMemo<number>(() => {
    const parsed = Number.parseInt(String(selectedQueuePrinter?.dpi ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAZAK_DPI;
  }, [selectedQueuePrinter]);

  const previewProductData = useMemo(() => {
    if (!selectedProduct) return null;
    return {
      ...selectedProduct,
      orderNumber: selectedProduct.orderId || selectedProduct.orderNumber,
      productId: selectedProduct.itemCode || selectedProduct.productId,
      description: selectedProduct.item || selectedProduct.description,
    } as Record<string, unknown>;
  }, [selectedProduct]);

  const { previewData: mazakPreviewData } = useLabelPreview(
    previewProductData as Record<string, unknown> | null,
    selectedLabelId
  );

  const resolvePreferredFlangeTemplatesForProduct = useCallback((product: ProductItem): LabelTemplate[] => {
    const productFiltered = filterLabelsByProduct(availableLabels, product, {
      excludeTempOrderLabels: true,
    }) as LabelTemplate[];

    const flangeOnly = productFiltered.filter((template) => helpers.hasFlangeTag(template));
    if (flangeOnly.length === 0) return [];

    const intentTags = helpers.getMaterialIntentTags(product);
    const rankedFlange = [...flangeOnly].sort((a, b) => {
      const scoreDiff = helpers.scoreTemplateForProductIntent(b, intentTags) - helpers.scoreTemplateForProductIntent(a, intentTags);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a?.name || a?.id || "").localeCompare(String(b?.name || b?.id || ""));
    });

    const preferredRoot = rankedFlange[0];

    const linked = resolveLinkedTemplateChain(availableLabels, String(preferredRoot?.id || ""), { maxDepth: 4 }) as LabelTemplate[];
    const allowedIds = new Set(flangeOnly.map((template) => String(template.id || "")));
    const linkedFlange = linked.filter((template) => helpers.hasFlangeTag(template) && allowedIds.has(String(template.id || "")));
    if (linkedFlange.length > 0) return linkedFlange;

    return [preferredRoot];
  }, [availableLabels]);

  const adjustPreviewProductData = useMemo(() => {
    if (!selectedAdjustProduct || !selectedAdjustTargetOrder) return null;
    const targetOrder = selectedAdjustTargetOrder;
    const product = selectedAdjustProduct;
    return {
      ...product,
      item: targetOrder.item || product.item,
      itemCode: targetOrder.itemCode || product.itemCode,
      productId: targetOrder.productId || product.productId,
      extraCode: targetOrder.extraCode || product.extraCode,
      
      description: targetOrder.description || "",
      itemDescription: targetOrder.itemDescription || "",
      articleDescription: targetOrder.articleDescription || "",
      specs: targetOrder.specs || null,
      pn: targetOrder.pn || null,
      dn: targetOrder.dn || null,
      diameter: targetOrder.diameter || null,
      project: targetOrder.project || "",

      orderId: targetOrder.orderId,
      orderNumber: targetOrder.orderId,
      Order: targetOrder.orderId,
      order: targetOrder.orderId,
      originalOrderId: targetOrder.orderId,
      Productieorder: targetOrder.orderId
    } as Record<string, unknown>;
  }, [selectedAdjustProduct, selectedAdjustTargetOrder]);

  const adjustPreviewTemplates = useMemo(() => {
    if (!adjustPreviewProductData) return [];
    return resolvePreferredFlangeTemplatesForProduct(adjustPreviewProductData as ProductItem);
  }, [adjustPreviewProductData, resolvePreferredFlangeTemplatesForProduct]);

  const { previewData: adjustPreviewData } = useLabelPreview(
    adjustPreviewProductData as Record<string, unknown> | null,
    adjustPreviewTemplates[0]?.id || ""
  );

  const freeLabelTemplate = useMemo<LabelTemplate>(() => {
    return {
      ...helpers.FREE_TEXT_LABEL_TEMPLATE,
      elements: (helpers.FREE_TEXT_LABEL_TEMPLATE.elements || []).map((element: unknown) => {
        const candidate = element as Record<string, unknown> | null;
        if (!candidate || candidate.type !== "text") return element;
        return {
          ...candidate,
          align: freeLabelAlign,
          fontSize: freeLabelFontSize,
        };
      }),
    };
  }, [freeLabelAlign, freeLabelFontSize]);

  useEffect(() => {
    if (showPrintModal && filteredLabels.length > 0) {
      // In Mazak tonen we alleen flens-labels; kies daarbinnen een logische default.
      const preferred = filteredLabels.find((t: LabelTemplate) => 
        t.tags?.includes("FLENZEN") ||
        t.tags?.includes("FLENS") ||
        t.tags?.includes("FLANGE")
      );
      if (preferred) setSelectedLabelId(String(preferred.id || ""));
      else setSelectedLabelId(String(filteredLabels[0]?.id || ""));
    }
  }, [showPrintModal, filteredLabels]);

  useEffect(() => {
    if (!stationId) return;

    const processData = (sourceData: ProductItem[]) => {
      const filtered = sourceData
        .filter((item: ProductItem) => {
          const stepUpper = String(item.currentStep || "").toUpperCase().trim();
          const statusUpper = String(item.status || "").toUpperCase().trim();
          const inspectionStatus = String(item.inspection?.status || "").toUpperCase().trim();

          if (
            inspectionStatus === "TIJDELIJKE AFKEUR" ||
            inspectionStatus === "AFKEUR" ||
            statusUpper === "REJECTED" ||
            statusUpper === "AFKEUR" ||
            stepUpper === "REJECTED" ||
            stepUpper === "HOLD_AREA"
          ) {
            return false;
          }

          const itemStationNorm = normalizeMachine(item.currentStation || item.machine || "");
          const stepNorm = String(stepUpper).replace(/\s/g, "");
          const statusNorm = String(statusUpper).replace(/\s/g, "");

          return (
            itemStationNorm === "MAZAK" ||
            stepNorm === "MAZAK" ||
            statusNorm.includes("MAZAK")
          );
        })
        .sort((a, b) => {
          const timeA = helpers.toMillisFromMixed(a.updatedAt || a.createdAt || 0);
          const timeB = helpers.toMillisFromMixed(b.updatedAt || b.createdAt || 0);
          return timeB - timeA;
        });

      setItems(filtered);
      setLoading(false);
    };

    if (products && products.length > 0) {
      processData(products);
      setLoading(false);

      const unsub = subscribeTrackedProducts({
        db,
        statusExclusions: ["completed", "shipped", "deleted"],
        onData: (nextItems: ProductItem[]) => {
          processData(nextItems);
        },
        onError: () => setLoading(false),
      });
      return () => unsub();
    }

    const unsub = subscribeTrackedProducts({
      db,
      statusExclusions: ["completed", "shipped", "deleted"],
      onData: (nextItems: ProductItem[]) => {
        processData(nextItems);
      },
      onError: () => setLoading(false),
    });
    return () => unsub();
  }, [stationId, products]);

  const inboxItems = useMemo(() => items.filter((i: ProductItem) => !i.mazakLabelPrinted), [items]);
  const processItems = useMemo(() => items.filter((i: ProductItem) => i.mazakLabelPrinted), [items]);
  const adjustCandidates = useMemo(() => {
    const deduped = new Map<string, ProductItem>();
    [...inboxItems, ...processItems].forEach((item) => {
      const key = String(item.id || item.lotNumber || "").trim();
      if (!key) return;
      deduped.set(key, item);
    });

    return Array.from(deduped.values()).sort((a, b) => {
      const timeA = helpers.toMillisFromMixed(a.updatedAt || a.createdAt || 0);
      const timeB = helpers.toMillisFromMixed(b.updatedAt || b.createdAt || 0);
      return timeB - timeA;
    });
  }, [inboxItems, processItems]);

  const filteredAdjustProducts = useMemo(() => {
    const term = String(adjustSearch || "").trim().toLowerCase();
    if (!term) return adjustCandidates;

    return adjustCandidates.filter((item) => {
      const haystack = [
        item.lotNumber,
        item.orderId,
        item.item,
        item.itemCode,
      ]
        .map((entry) => String(entry || "").toLowerCase())
        .join(" ");
      return haystack.includes(term);
    });
  }, [adjustCandidates, adjustSearch]);

  const adjustTargetOrders = useMemo(() => {
    const sourceOrder = String(selectedAdjustProduct?.orderId || "").trim().toUpperCase();
    const sourceFamily = helpers.getOrderIdFamily(sourceOrder);
    const sourceFlangeSize = helpers.getFlangeSizeToken([
      selectedAdjustProduct?.item,
      selectedAdjustProduct?.itemCode,
      (selectedAdjustProduct as Record<string, unknown>)?.itemDescription,
      selectedAdjustProduct?.extraCode,
      selectedAdjustProduct?.productId,
    ].join(" "));
    const term = String(adjustOrderSearch || "").trim().toLowerCase();

    const rows = planningOrders.filter((order) => {
      const orderId = String(order.orderId || "").trim().toUpperCase();
      if (!orderId || orderId === sourceOrder) return false;

      const orderFlangeSize = helpers.getFlangeSizeToken([
        order.item,
        order.itemCode,
        (order as Record<string, unknown>)?.itemDescription,
        order.extraCode,
        order.productId,
      ].join(" "));

      if (sourceFlangeSize) {
        if (!orderFlangeSize || orderFlangeSize !== sourceFlangeSize) return false;
      } else if (sourceFamily && helpers.getOrderIdFamily(orderId) !== sourceFamily) {
        // Fallback voor records zonder duidelijke FL-maat.
        return false;
      }

      if (!term) return true;
      const haystack = `${order.orderId || ""} ${order.item || ""} ${order.itemCode || ""}`.toLowerCase();
      return haystack.includes(term);
    });

    return rows
      .sort((a, b) => {
        const aActive = a.status === "in_progress" || a.status === "In Production";
        const bActive = b.status === "in_progress" || b.status === "In Production";
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        const yearA = Number(a.year || a.weekYear || 0);
        const yearB = Number(b.year || b.weekYear || 0);
        if (yearA !== yearB) return yearA - yearB;
        const weekA = Number(a.week || a.weekNumber || 0);
        const weekB = Number(b.week || b.weekNumber || 0);
        if (weekA !== weekB) return weekA - weekB;
        return helpers.toMillisFromMixed(b.createdAt || 0) - helpers.toMillisFromMixed(a.createdAt || 0);
      })
      .slice(0, 30);
  }, [planningOrders, selectedAdjustProduct, adjustOrderSearch]);

  const selectedAdjustFlangeSize = helpers.getFlangeSizeToken([
    selectedAdjustProduct?.item,
    selectedAdjustProduct?.itemCode,
    (selectedAdjustProduct as Record<string, unknown>)?.itemDescription,
    selectedAdjustProduct?.extraCode,
    selectedAdjustProduct?.productId,
  ].join(" "));

  const selectedAdjustOrderFamily = helpers.getOrderIdFamily(selectedAdjustProduct?.orderId || "");
  const isBulkInboxMode = activeTab === "inbox" && bulkSeriesProducts.length > 1;
  const selectedTemplateChain = useMemo<LabelTemplate[]>(() => {
    if (!selectedLabelId) return [];
    const chain = resolveLinkedTemplateChain(availableLabels, selectedLabelId, { maxDepth: 4 }) as LabelTemplate[];
    return chain.filter((template) => helpers.hasFlangeTag(template));
  }, [availableLabels, selectedLabelId]);
  const effectiveTemplateChain = selectedTemplateChain.length > 0
    ? selectedTemplateChain
    : ((selectedLabelId ? filteredLabels.filter((t) => String(t.id) === String(selectedLabelId)) : []) as LabelTemplate[]);
  const labelsPerItem = Math.max(1, effectiveTemplateChain.length);
  const effectiveItemsToPrint = isBulkInboxMode ? bulkSeriesProducts : (selectedProduct ? [selectedProduct] : []);
  const totalLabelCount = effectiveItemsToPrint.reduce((acc, item) => {
    const diameter = helpers.getItemNominalDiameter(item);
    const copies = (diameter > 450 && diameter <= 700) ? 2 : 1;
    return acc + (labelsPerItem * copies);
  }, 0);

  useEffect(() => {
    if (activeTab !== "inbox" && bulkSeriesProducts.length > 0) {
      setBulkSeriesProducts([]);
    }
  }, [activeTab, bulkSeriesProducts.length]);

  const groupedSeries = useMemo(() => {
    const grouped = new Map<string, ProductItem[]>();
    inboxItems.forEach((item: ProductItem) => {
      const groupId = item?.seriesGroupId;
      if (!groupId) return;
      const current = grouped.get(groupId) || [];
      current.push(item);
      grouped.set(groupId, current);
    });
    return grouped;
  }, [inboxItems]);

  useEffect(() => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      groupedSeries.forEach((group: ProductItem[], groupId: string) => {
        if (group.length <= 1) return;
        if (!(groupId in next)) next[groupId] = true;
      });
      Object.keys(next).forEach((groupId) => {
        const group = groupedSeries.get(groupId);
        if (!group || group.length <= 1) delete next[groupId];
      });
      return next;
    });
  }, [groupedSeries]);

  const displayRows = useMemo(() => {
    const rendered = new Set<string>();
    const rows: DisplayRow[] = [];

    inboxItems.forEach((item: ProductItem) => {
      const groupId = item?.seriesGroupId;
      const group = groupId ? groupedSeries.get(groupId) || [] : [];
      const isSeriesGroup = groupId && group.length > 1;

      if (isSeriesGroup && !rendered.has(groupId)) {
        rows.push({
          id: `series_header_${groupId}`,
          isSeriesHeader: true,
          seriesGroupId: groupId,
          orderId: group[0]?.orderId || item?.orderId || "-",
          seriesCount: group.length,
          seriesUnits: group,
        });
        rendered.add(groupId);
      }

      if (!isSeriesGroup || !collapsedGroups[groupId]) {
        rows.push(item);
      }
    });

    return rows;
  }, [inboxItems, groupedSeries, collapsedGroups]);

  const filteredPlanningOrders = useMemo(() => {
    let result: PlanningOrder[] = [...planningOrders];

    if (planningSearch) {
      const term = planningSearch.toLowerCase().trim();
      result = result.filter((o: PlanningOrder) => {
         const searchStr = `${o.orderId || ''} ${o.item || ''} ${o.itemCode || ''} ${o.lotNumber || ''}`.toLowerCase();
         return searchStr.includes(term);
      });
    }

    result.sort((a, b) => {
      const aActive = a.status === 'in_progress' || a.status === 'In Production';
      const bActive = b.status === 'in_progress' || b.status === 'In Production';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      const yearA = Number(a.year || a.weekYear || 0);
      const yearB = Number(b.year || b.weekYear || 0);
      if (yearA !== yearB) return yearA - yearB;

      const weekA = Number(a.week || a.weekNumber || 0);
      const weekB = Number(b.week || b.weekNumber || 0);
      if (weekA !== weekB) return weekA - weekB;

      return helpers.toMillisFromMixed(b.createdAt || 0) - helpers.toMillisFromMixed(a.createdAt || 0);
    });

    return result;
  }, [planningOrders, planningSearch]);

  const selectedPlanningOrderMaterialBadge = useMemo(() => {
    if (!selectedPlanningOrder) return "";
    const combined = [
      String(selectedPlanningOrder.extraCode || ""),
      String(selectedPlanningOrder.item || ""),
      String(selectedPlanningOrder.itemCode || ""),
    ].join(" ").toUpperCase();

    if (combined.includes("EMT")) return "EMT";
    if (combined.includes("CMT")) return "CMT";
    if (combined.includes("CST")) return "CST";
    return "";
  }, [selectedPlanningOrder]);

  const selectedPlanningOrderQuantity = useMemo(() => {
    if (!selectedPlanningOrder) return 0;
    const candidates = [
      Number((selectedPlanningOrder as Record<string, unknown>).quantity),
      Number(selectedPlanningOrder.plan),
      Number((selectedPlanningOrder as Record<string, unknown>).toDoQty),
    ];
    const valid = candidates.find((value) => Number.isFinite(value) && value > 0);
    return Number.isFinite(valid as number) ? Number(valid) : 0;
  }, [selectedPlanningOrder]);

  const selectedPlanningOrderProduced = useMemo(() => {
    if (!selectedPlanningOrder) return 0;
    const candidates = [
      Number((selectedPlanningOrder as Record<string, unknown>).trackedFinishedCount),
      Number((selectedPlanningOrder as Record<string, unknown>).produced),
      Number((selectedPlanningOrder as Record<string, unknown>).done),
    ];
    const valid = candidates.find((value) => Number.isFinite(value) && value >= 0);
    return Number.isFinite(valid as number) ? Number(valid) : 0;
  }, [selectedPlanningOrder]);

  const selectedPlanningOrderDeliveryLabel = useMemo(() => {
    if (!selectedPlanningOrder) return "-";
    const record = selectedPlanningOrder as Record<string, unknown>;
    const rawDate = record.plannedDeliveryDate || record.deliveryDate || record.plannedDate || null;
    const dateMillis = helpers.toMillisFromMixed(rawDate);
    if (dateMillis > 0) {
      const deliveryDate = new Date(dateMillis);
      const week = getISOWeek(deliveryDate);
      const dateLabel = deliveryDate.toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      return `W${String(week).padStart(2, "0")} ${dateLabel}`;
    }

    const week = String(selectedPlanningOrder.week || selectedPlanningOrder.weekNumber || "").trim();
    const year = String(selectedPlanningOrder.year || selectedPlanningOrder.weekYear || "").trim();
    if (!week) return "-";
    return year ? `W${String(week).padStart(2, "0")} ${year}` : `W${String(week).padStart(2, "0")}`;
  }, [selectedPlanningOrder]);

  const activePlanningOrderProducts = useMemo<ProductItem[]>(() => {
    const orderKey = String(selectedPlanningOrder?.orderId || "").trim().toUpperCase();
    if (!orderKey) return [];

    return items
      .filter((item) => String(item?.orderId || "").trim().toUpperCase() === orderKey)
      .sort((a, b) => String(a?.lotNumber || a?.id || "").localeCompare(String(b?.lotNumber || b?.id || "")));
  }, [items, selectedPlanningOrder]);

  const resolveQueuePrinterForPrint = async (): Promise<PrinterConfig> => {
    if (selectedQueuePrinter?.id) return selectedQueuePrinter;

    if (availablePrinters.length > 0) {
      const fromState = helpers.selectQueuePrinterForStation(availablePrinters, stationId || "", selectedRoutingTags);
      if (fromState?.id) return fromState;
    }

    const fetchedSnap = await getDocs(collection(db, getPathString(PATHS.PRINTERS)));
    const fetchedPrinters: PrinterConfig[] = fetchedSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PrinterConfig, "id">) }))
      .filter((printer) => Boolean(printer?.id));

    if (fetchedPrinters.length > 0) {
      setAvailablePrinters(fetchedPrinters);
      const fromFetch = helpers.selectQueuePrinterForStation(fetchedPrinters, stationId || "", selectedRoutingTags);
      if (fromFetch?.id) return fromFetch;
    }

    throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
  };

  if (loading) {
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  const currentList = activeTab === "inbox"
    ? inboxItems
    : activeTab === "process"
      ? processItems
      : activeTab === "planning"
        ? filteredPlanningOrders
        : activeTab === "adjust"
          ? filteredAdjustProducts
          : [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      
      <MazakTabNavigation activeTab={activeTab} onSelectTab={handleSelectTab} t={t} />

      <style>{`
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
        }
        .scan-pulse {
          animation: scan-pulse 2s infinite;
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-text {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      `}</style>

      {showActionModal && selectedProduct && (
        <div className="fixed z-[9999]">
          <PostProcessingFinishModal
            product={selectedProduct}
            onClose={handleCloseModal}
            onConfirm={(status, payload) => handlePostProcessingFinish(status, payload, selectedProduct)}
            currentStation={stationId}
          />
        </div>
      )}

      {showPrintModal && selectedProduct && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[24px] sm:rounded-[30px] shadow-2xl w-full max-w-7xl flex flex-col md:flex-row overflow-hidden max-h-[95vh] sm:max-h-[90vh]">
            <div className="w-full md:w-1/3 shrink-0 p-5 sm:p-6 md:p-8 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col overflow-y-auto custom-scrollbar">
               <h3 className="text-2xl font-black uppercase italic text-slate-800 mb-2">
                 {activeTab === "process" ? t("mazak.reprint_label", "Label herprinten") : t("mazak.print_labels", "Labels printen")}
               </h3>
               <p className="text-sm font-bold text-slate-500 mb-8">
                  {isBulkInboxMode
                ? t("mazak.bulk_labels_printing", "{{count}} labels worden geprint voor deze bulk-serie.", { count: totalLabelCount }) 
                    : activeTab === "process"
                ? t("mazak.one_label_reprint", "{{count}} label(s) worden opnieuw geprint voor dit product.", { count: totalLabelCount })
                : t("mazak.one_label_print", "{{count}} label(s) worden geprint voor dit product.", { count: totalLabelCount })}
               </p>

               <div className="space-y-6 flex-1">
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t("productionStartModal.labels.labelFormat", "Labelformaat")}</label>
                   <select 
                     value={selectedLabelId}
                     onChange={(e) => setSelectedLabelId(e.target.value)}
                     className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
                   >
                     <option value="">{t("mazak.select_template", "- Selecteer een template -")}</option>
                     {filteredLabels.map((l: LabelTemplate) => (
                       <option key={String(l.id)} value={String(l.id)}>{String(l.name || "-")} ({String(l.width || "-")}x{String(l.height || "-")}mm)</option>
                     ))}
                   </select>
                 </div>
                 
                 <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">{t("mazak.selected_order", "Geselecteerde order")}</p>
                    <p className="font-bold text-blue-900">{selectedProduct.orderId}</p>
                    <p className="text-xs text-blue-700 mt-1">{selectedProduct.item}</p>
                    {labelsPerItem > 1 && (
                      <p className="text-xs text-blue-700 mt-2">
                        {t("mazak.linked_labels_active", "Gekoppelde labels actief: {{count}} per product", { count: labelsPerItem })}
                      </p>
                    )}
                 </div>
               </div>

               <div className="flex gap-3 pt-6 mt-auto">
                 <button onClick={() => setShowPrintModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">
                   {t("common.cancel", "Annuleren")}
                 </button>
                 <button onClick={handlePrintLabels} disabled={printing || !selectedLabelId} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 shadow-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                   {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                   {printing
                     ? t("common.loading", "Laden...")
                     : activeTab === "process"
                       ? t("mazak.reprint_label", "Label herprinten")
                       : t("mazak.print_count_labels", "Print {{count}} label(s)", { count: totalLabelCount })}
                 </button>
               </div>
            </div>

            <div className="flex-1 bg-slate-50 p-5 sm:p-8 flex flex-col items-center justify-center relative min-h-[300px] md:min-h-[400px] overflow-hidden">
               <div className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 z-10">
                 <Printer size={12} className="text-blue-500" /> {t("productionStartModal.labels.labelPreview", "Etiket preview")}
               </div>
               
               {selectedLabelId ? (
                 <div className="flex-1 w-full h-full mt-4 px-4 overflow-y-auto">
                   <div className="max-w-3xl mx-auto space-y-5">
                     {effectiveTemplateChain.map((template, idx) => (
                       <div key={String(template?.id || idx)} className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
                         <div className="mb-2 flex items-center justify-between">
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                             {t("mazak.preview_label_step", "Label {{index}}", { index: idx + 1 })}
                           </p>
                           <p className="text-[10px] font-bold text-slate-400">
                             {String(template?.name || template?.id || "-")}
                           </p>
                         </div>
                         <AutoScaledLabelPreview
                           label={template}
                           data={mazakPreviewData}
                           className="w-full"
                           maxScale={1}
                         />
                       </div>
                     ))}
                   </div>
                 </div>
               ) : (
                 <p className="text-slate-400 font-bold text-sm">{t("mazak.select_template_for_preview", "Selecteer een template voor preview")}</p>
               )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div 
          className={`w-full lg:w-7/12 p-4 pb-32 space-y-3 border-r border-slate-100 overflow-y-auto custom-scrollbar ${activeTab === "free" ? "hidden" : (selectedProduct || selectedPlanningOrder) ? "hidden lg:block" : "block"}`}
          style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
        >
        {activeTab !== "planning" && activeTab !== "free" && (
          <div className="mb-6 space-y-2">
            <div className="flex justify-between items-end">
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 w-fit">
                <div className="w-2 h-2 bg-blue-500 rounded-full pulse-text"></div>
                <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                  {t("lossen.ready_to_scan", "Klaar voor scan")}
                </span>
              </div>

              <button
                onClick={() => setScannerMode(!scannerMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-xs uppercase tracking-widest transition-all ${scannerMode ? "bg-purple-100 border-purple-200 text-purple-700" : "bg-white border-slate-200 text-slate-400"}`}
                title={scannerMode ? t("digitalplanning.terminal.scanner_keyboard_hidden", "Toetsenbord verborgen (Scanner modus)") : t("digitalplanning.terminal.normal_input", "Normale invoer")}
              >
                {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
                {scannerMode ? t("digitalplanning.terminal.scanner_mode", "Scanner modus") : t("digitalplanning.terminal.keyboard", "Toetsenbord")}
              </button>
            </div>

            <div className="relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 transition-all scan-pulse" size={24} />
              <input
                ref={scanInputRef}
                type="text"
                value={activeScanInput}
                onChange={(event) => {
                  if (activeTab === "process") {
                    setScanInputProcess(event.target.value);
                    return;
                  }
                  if (activeTab === "adjust") {
                    setScanInputAdjust(event.target.value);
                    return;
                  }
                  setScanInputInbox(event.target.value);
                }}
                inputMode={scannerMode ? "none" : "text"}
                onKeyDown={handleScan}
                placeholder={activeTab === "adjust"
                  ? t("mazak.adjust_scan_placeholder", "Scan of typ lotnummer / order voor aanpassen...")
                  : t("digitalplanning.terminal.scan_lot_or_order", "Scan lotnummer of order...")}
                className="w-full pl-14 pr-4 py-4 bg-white border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
              />
            </div>
          </div>
        )}

        {currentList.length === 0 ? (
          <div className="p-12 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 opacity-40">
            <Package size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {activeTab === "inbox"
                ? t("mazak.no_items_to_print", "Geen items om te printen")
                : activeTab === "planning"
                  ? t("mazak.no_flange_orders_planning", "Geen flens-orders in de planning")
                  : activeTab === "free"
                    ? t("mazak.no_items_free_label", "Gebruik de vrije-label tab rechts om direct te printen")
                    : t("mazak.no_items_to_complete", "Geen items om te gereedmelden")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4 ml-2">
              {activeTab === "planning" ? <History size={16} className="text-blue-500" /> : activeTab === "inbox" ? <Printer size={16} className="text-blue-500" /> : activeTab === "free" ? <Tag size={16} className="text-blue-500" /> : <ClipboardCheck size={16} className="text-emerald-500" />}
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                {activeTab === "planning"
                  ? t("mazak.planned_flanges", "Geplande flenzen")
                  : activeTab === "adjust"
                    ? t("mazak.adjust_products", "Aanpassen: actieve lots")
                  : activeTab === "free"
                    ? t("mazak.free_label_tab_title", "Vrije labels")
                  : activeTab === "inbox"
                    ? t("mazak.inbox", "Inbox")
                    : t("mazak.to_process", "Te verwerken")} ({currentList.length})
              </h3>
            </div>

            {activeTab === "planning" ? (
              <>
                <div className="mb-4 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t("mazak.search_order_item_lot", "Zoek order, item of lot...")}
                      value={planningSearch}
                      onChange={(e) => setPlanningSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl font-bold text-sm outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <button
                    onClick={() => document.getElementById("current-week-divider")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-black uppercase text-[10px] tracking-widest transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-sm border border-blue-100"
                  >
                    <Calendar size={14} className="text-blue-500" />
                    <span className="hidden sm:inline">{t("mazak.current_week", "Huidige Week")}</span>
                  </button>
                </div>
                {(() => {
                  let lastWeekLabel: string | null = null;
                  const currentDate = new Date();
                  const currentWeek = getISOWeek(currentDate);
                  const currentYear = currentDate.getFullYear();

                  return filteredPlanningOrders.map((order: PlanningOrder) => {
                    const isActive = order.status === 'in_progress' || order.status === 'In Production';
                    const weekLabel = isActive ? t("status.in_production", "In Productie") : `Week ${order.week || order.weekNumber || "?"}`;
                    const orderMaterialBadge = (() => {
                      const combined = [
                        String(order.extraCode || ""),
                        String(order.item || ""),
                        String(order.itemCode || ""),
                      ].join(" ").toUpperCase();

                      if (combined.includes("EMT")) return "EMT";
                      if (combined.includes("CMT")) return "CMT";
                      if (combined.includes("CST")) return "CST";
                      return "";
                    })();

                    const orderTotal = (() => {
                      const candidates = [
                        Number((order as Record<string, unknown>).quantity),
                        Number(order.plan),
                        Number((order as Record<string, unknown>).toDoQty),
                      ];
                      const valid = candidates.find((value) => Number.isFinite(value) && value > 0);
                      return Number.isFinite(valid as number) ? Number(valid) : 0;
                    })();

                    const orderProduced = (() => {
                      const candidates = [
                        Number((order as Record<string, unknown>).trackedFinishedCount),
                        Number((order as Record<string, unknown>).produced),
                        Number((order as Record<string, unknown>).done),
                      ];
                      const valid = candidates.find((value) => Number.isFinite(value) && value >= 0);
                      return Number.isFinite(valid as number) ? Number(valid) : 0;
                    })();

                    const orderDeliveryLabel = (() => {
                      const record = order as Record<string, unknown>;
                      const rawDate = record.plannedDeliveryDate || record.deliveryDate || record.plannedDate || null;
                      const dateMillis = helpers.toMillisFromMixed(rawDate);
                      if (dateMillis > 0) {
                        const deliveryDate = new Date(dateMillis);
                        const week = getISOWeek(deliveryDate);
                        const dateLabel = deliveryDate.toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        });
                        return `W${String(week).padStart(2, "0")} ${dateLabel}`;
                      }

                      const fallbackWeek = String(order.week || order.weekNumber || "").trim();
                      const fallbackYear = String(order.year || order.weekYear || "").trim();
                      if (!fallbackWeek) return "-";
                      return fallbackYear
                        ? `W${String(fallbackWeek).padStart(2, "0")} ${fallbackYear}`
                        : `W${String(fallbackWeek).padStart(2, "0")}`;
                    })();
                    const orderDeliveryRaw = (() => {
                      const record = order as Record<string, unknown>;
                      return record.plannedDeliveryDate || record.deliveryDate || record.plannedDate || null;
                    })();
                    const orderDeliveryColorClass = helpers.getUrgencyColorClass(orderDeliveryRaw);
                    
                    const showDivider = weekLabel !== lastWeekLabel;
                    if (showDivider) {
                      lastWeekLabel = weekLabel;
                    }

                    const orderWeek = Number(order.week || order.weekNumber);
                    const orderYear = Number(order.year || order.weekYear || currentYear);
                    const isCurrentWeek = !isActive && Number.isFinite(orderWeek) && orderWeek === currentWeek && orderYear === currentYear;
                    const isPastWeek = !isActive && Number.isFinite(orderWeek) && (orderYear < currentYear || (orderYear === currentYear && orderWeek < currentWeek));

                    return (
                      <React.Fragment key={String(order.id || order.orderId || "") }>
                        {showDivider && (
                          <div id={isCurrentWeek ? "current-week-divider" : undefined} className={`flex items-center gap-3 px-1 pt-2 pb-2 my-4 first:mt-0 ${isPastWeek && !isCurrentWeek ? "opacity-50" : ""}`}>
                            <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${isCurrentWeek ? "bg-blue-600 text-white shadow-md shadow-blue-200" : isPastWeek ? "bg-slate-200 text-slate-500" : "bg-slate-100 text-slate-500"}`}>
                              {weekLabel}
                              {isCurrentWeek && <span className="ml-1 opacity-70"> • Nu</span>}
                            </div>
                            <div className="flex-1 h-px bg-slate-200"></div>
                          </div>
                        )}
                        <MazakPlanningOrderCard
                          order={order}
                          isSelected={selectedPlanningOrder?.id === order.id}
                          onSelect={setSelectedPlanningOrder}
                          orderMaterialBadge={orderMaterialBadge}
                          orderProduced={orderProduced}
                          orderTotal={orderTotal}
                          orderDeliveryLabel={orderDeliveryLabel}
                          orderDeliveryColorClass={orderDeliveryColorClass}
                          t={t}
                        />
                      </React.Fragment>
                    );
                  });
                })()}
              </>
            ) : activeTab === "inbox" ? (
              displayRows.map((item) => {
              if (helpers.isSeriesHeaderRow(item)) {
                const isCollapsed = !!collapsedGroups[item.seriesGroupId];
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item.seriesUnits[0])}
                    className="bg-blue-50 border-2 border-blue-200 rounded-[24px] p-4 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{t("mazak.bulk_series", "Bulk / serie")}</p>
                        <p className="text-base font-black text-blue-900">{t("productionStartModal.labels.order", "Order")} {item.orderId}</p>
                        <p className="text-[10px] font-bold text-blue-700 uppercase">{t("digitalplanning.terminal.series_count", "Serie {{count}} stuks", { count: item.seriesCount })}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollapsedGroups((prev) => ({
                            ...prev,
                            [item.seriesGroupId]: !prev[item.seriesGroupId],
                          }));
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-blue-200 text-blue-700 text-[10px] font-black uppercase"
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        {isCollapsed ? t("digitalplanning.terminal.expand", "Uitklappen") : t("digitalplanning.terminal.collapse", "Inklappen")}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] font-bold text-blue-700/80 uppercase tracking-wide">
                      {t("mazak.select_for_print_or_complete", "Selecteer voor printen of gereedmelden in rechterpaneel")}
                    </p>
                  </div>
                );
              }

              return (
                <MazakListItemCard
                  key={String(item.id || item.lotNumber || "")}
                  item={item}
                  activeTab={activeTab}
                  isSelected={selectedProduct?.id === item.id}
                  onSelect={handleItemClick}
                  t={t}
                />
              );
              })
            ) : activeTab === "adjust" ? (
              <>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t("mazak.adjust_search_placeholder", "Zoek op lot, order, item of type...")}
                      value={adjustSearch}
                      onChange={(e) => setAdjustSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl font-bold text-sm outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  {filteredAdjustProducts.map((item) => {
                    const key = String(item.id || item.lotNumber || "");
                    const isSelected = String(selectedAdjustProduct?.id || selectedAdjustProduct?.lotNumber || "") === key;
                    return (
                      <MazakAdjustListItemCard
                        key={key}
                        item={item}
                        isSelected={isSelected}
                        onSelect={setSelectedAdjustProduct}
                        t={t}
                      />
                    );
                  })}
                </div>
              </>
            ) : activeTab === "free" ? (
              <div className="space-y-3">
                <div className="p-6 bg-slate-50 rounded-[24px] border border-slate-200 text-center">
                  <Tag size={28} className="mx-auto mb-3 text-blue-500" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    {t("mazak.labels_sidebar", "Kies hiernaast een type")}
                  </p>
                </div>
              </div>
            ) : (
              processItems.map((item) => (
                <MazakListItemCard
                  key={String(item.id || item.lotNumber || "")}
                  item={item}
                  activeTab={activeTab}
                  isSelected={selectedProduct?.id === item.id}
                  onSelect={handleItemClick}
                  t={t}
                />
              ))
            )}
          </div>
        )}
        </div>

      <div className={`flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto custom-scrollbar ${(!selectedProduct && !selectedPlanningOrder && !selectedAdjustProduct && activeTab !== "free" && activeTab !== "adjust") ? "hidden lg:flex" : "flex"} flex-col`}>
        {activeTab === "free" ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left w-full">
            <MazakFreeLabelHero t={t} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                onClick={() => setShowFreeLabelModal(true)}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all text-left group flex flex-col items-center justify-center h-48"
              >
                <div className="bg-blue-50 p-4 rounded-2xl text-blue-500 mb-4 group-hover:scale-110 transition-transform">
                  <Tag size={32} />
                </div>
                <h3 className="font-black text-slate-800 uppercase tracking-wide">Vrij Label</h3>
                <p className="text-xs text-slate-500 text-center mt-2">Print een label met vrije tekst (100x25mm)</p>
              </button>
              
              <button
                onClick={handlePrintEmptyLabel}
                disabled={printing}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 hover:border-slate-400 hover:shadow-md transition-all text-left group flex flex-col items-center justify-center h-48"
              >
                <div className="bg-slate-50 p-4 rounded-2xl text-slate-500 mb-4 group-hover:scale-110 transition-transform">
                  <Printer size={32} />
                </div>
                <h3 className="font-black text-slate-800 uppercase tracking-wide">Leeg Label</h3>
                <p className="text-xs text-slate-500 text-center mt-2">Print direct een blanco label (100x25mm)</p>
              </button>

              <button
                onClick={() => setShowLargeSequenceModal(true)}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 hover:border-purple-400 hover:shadow-md transition-all text-left group flex flex-col items-center justify-center h-48"
              >
                <div className="bg-purple-50 p-4 rounded-2xl text-purple-500 mb-4 group-hover:scale-110 transition-transform">
                  <Hash size={32} />
                </div>
                <h3 className="font-black text-slate-800 uppercase tracking-wide">Grote Volgnummers</h3>
                <p className="text-xs text-slate-500 text-center mt-2">Print labels met grote lotnummers en QR (15x15mm)</p>
              </button>
            </div>
          </div>
        ) : activeTab === "adjust" ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 w-full">
            {!selectedAdjustProduct ? (
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                <h3 className="text-xl font-black uppercase italic text-slate-800 mb-3">
                  {t("mazak.adjust_title", "Aanpassen verkeerd product")}
                </h3>
                <p className="text-sm font-bold text-slate-600">
                  {t("mazak.adjust_pick_product", "Scan of selecteer eerst een lot uit Inbox of Gereedmelden om het ordernummer aan te passen.")}
                </p>
              </div>
            ) : (
              <MazakAdjustSelectionPanel
                product={selectedAdjustProduct}
                onChangeOrder={() => setShowAdjustOrderModal(true)}
                onRequestNewOrder={() => setShowRequestNewOrderModal(true)}
                t={t}
              />
            )}
          </div>
        ) : selectedProduct ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 w-full">
            <MazakSelectedProductHero
              product={selectedProduct}
              onClear={() => setSelectedProduct(null)}
              t={t}
            />

            <div className="bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={handleOpenAdjustOrderFromSelectedProduct}
                  className="p-5 bg-white rounded-3xl border-2 border-slate-100 hover:border-blue-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-3 group"
                >
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <ArrowRight size={28} />
                  </div>
                  <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-700 group-hover:text-blue-700 text-center">
                    Ordernummer wijzigen
                  </span>
                </button>
                <button
                  onClick={handleOpenRequestNewOrderFromSelectedProduct}
                  className="p-5 bg-white rounded-3xl border-2 border-slate-100 hover:border-amber-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-3 group"
                >
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
                    <Tag size={28} />
                  </div>
                  <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-700 group-hover:text-amber-700 text-center">
                    Verzoek nieuw ordernummer
                  </span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm space-y-3">
              {activeTab === "inbox" ? (
                <>
                  <button 
                    onClick={() => setShowPrintModal(true)} 
                    disabled={printing}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Printer size={20} /> {t("mazak.print_labels_forward", "Labels printen / Doorsturen")}
                  </button>
                  <button
                    onClick={handleManualPrintForward}
                    disabled={printing}
                    className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {printing ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {t("mazak.manual_print_and_forward", "Handmatig doorsturen")}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleOpenActionModal} className="w-full py-5 bg-emerald-600 text-white rounded-xl font-black uppercase text-sm shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95 group">
                    <ClipboardCheck size={24} /> {t("mazak.process", "Verwerken")}
                  </button>
                  <button 
                    onClick={() => setShowPrintModal(true)} 
                    className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95 group"
                  >
                    <Printer size={16} /> {t("mazak.reprint_label", "Label herprinten")}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : selectedPlanningOrder ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 w-full">
            <MazakSelectedPlanningOrderHero
              order={selectedPlanningOrder}
              materialBadge={selectedPlanningOrderMaterialBadge}
              deliveryLabel={selectedPlanningOrderDeliveryLabel}
              quantity={selectedPlanningOrderQuantity}
              produced={selectedPlanningOrderProduced}
              t={t}
              onClear={() => setSelectedPlanningOrder(null)}
            />

            <MazakPlanningActiveLotsPanel
              products={activePlanningOrderProducts}
              onSelectProduct={(product) => {
                setSelectedPlanningOrder(null);
                setBulkSeriesProducts([]);
                setSelectedProduct(product);
                setActiveTab(product?.mazakLabelPrinted ? "process" : "inbox");
              }}
              t={t}
            />

          </div>
        ) : (
          <MazakEmptySelectionPlaceholder activeTab={activeTab} t={t} />
        )}
      </div>

      {/* Adjust Order Modal */}
      {showAdjustOrderModal && selectedAdjustProduct && (
        <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[30px] shadow-2xl w-full max-w-4xl p-6 sm:p-8 max-h-[95vh] flex flex-col overflow-hidden">
            <div className="shrink-0">
              <MazakAdjustModalHeader
                title="Ordernummer wijzigen"
                lotLabel={String(selectedAdjustProduct.lotNumber || selectedAdjustProduct.id || "-")}
                onClose={() => setShowAdjustOrderModal(false)}
                disabled={adjustSubmitting}
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col lg:flex-row gap-6">
              {/* Left side: Search & Input */}
              <MazakAdjustOrderModalLeftPanel
                adjustOrderSearch={adjustOrderSearch}
                selectedAdjustFlangeSize={selectedAdjustFlangeSize}
                selectedAdjustOrderFamily={selectedAdjustOrderFamily}
                adjustTargetOrders={adjustTargetOrders}
                selectedAdjustTargetOrder={selectedAdjustTargetOrder}
                adjustReason={adjustReason}
                onChangeAdjustOrderSearch={setAdjustOrderSearch}
                onSelectAdjustTargetOrder={setSelectedAdjustTargetOrder}
                onChangeAdjustReason={setAdjustReason}
                t={t}
              />

              {/* Right side: Preview */}
              <MazakAdjustPreviewPanel
                hasTargetOrder={!!selectedAdjustTargetOrder}
                previewTemplates={adjustPreviewTemplates}
                previewData={adjustPreviewData as Record<string, unknown>}
                printerDpi={mazakPrinterDpi}
              />
            </div>

            <MazakAdjustOrderModalActions
              submitting={adjustSubmitting}
              canSubmit={!adjustSubmitting && !!selectedAdjustTargetOrder && !!adjustReason.trim()}
              onCancel={() => setShowAdjustOrderModal(false)}
              onSubmit={async () => {
                await handleSubmitOrderReassign();
                if (adjustSubmitting) return; // wait till finish
                setShowAdjustOrderModal(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Request New Order Modal */}
      {showRequestNewOrderModal && selectedAdjustProduct && (
        <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[30px] shadow-2xl w-full max-w-xl p-6 sm:p-8 flex flex-col overflow-hidden">
            <MazakAdjustModalHeader
              title="Verzoek nieuw ordernummer"
              lotLabel={String(selectedAdjustProduct.lotNumber || selectedAdjustProduct.id || "-")}
              onClose={() => setShowRequestNewOrderModal(false)}
              disabled={adjustSubmitting}
            />

            <MazakAdjustRequestModalBody
              adjustReason={adjustReason}
              adjustRequestNote={adjustRequestNote}
              onChangeAdjustReason={setAdjustReason}
              onChangeAdjustRequestNote={setAdjustRequestNote}
              t={t}
            />

            <MazakAdjustRequestModalActions
              submitting={adjustSubmitting}
              canSubmit={!adjustSubmitting && !!adjustReason.trim()}
              onCancel={() => setShowRequestNewOrderModal(false)}
              onSubmit={async () => {
                await handleRequestNewOrderFromPlanner();
                if (adjustSubmitting) return; // will wait
                setShowRequestNewOrderModal(false);
              }}
              t={t}
            />
          </div>
        </div>
      )}
      </div>
      {showFreeLabelModal && (
        <FreeLabelPrintModal
          onClose={() => setShowFreeLabelModal(false)}
          onPrint={handlePrintFreeLabels}
          onSaveTemplate={handleSaveFreeLabelTemplate}
          printing={printing}
          savingFreeTemplate={savingFreeTemplate}
          savedTemplates={savedFreeLabelTemplates}
          onDeleteTemplate={handleDeleteFreeLabelTemplate}
        />
      )}

      {showLargeSequenceModal && (
        <LargeSequencePrintModal
          onClose={() => setShowLargeSequenceModal(false)}
          onPrint={handlePrintLargeSequence}
          printing={printing}
        />
      )}
    </div>
  );
};

export default MazakView;
