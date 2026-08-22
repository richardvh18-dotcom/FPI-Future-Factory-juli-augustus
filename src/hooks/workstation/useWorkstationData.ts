
import { collection, collectionGroup, query, onSnapshot, doc, serverTimestamp, where, limit, getDocs, getDoc, arrayUnion, increment, addDoc, updateDoc } from "firebase/firestore";
import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, Menu, X, Clock, Calendar, UserCheck, AlertTriangle } from "lucide-react";
import { useNFCReader, NFC_STATUS } from "../useNFCReader";
import { db, logActivity } from "../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../config/dbPaths";
import {
  rejectTrackedProductFinal,
  completeTrackedProduct,
  cancelTrackedProduction,
  moveTrackedProductManual,
  tempRejectTrackedProduct,
  advanceTrackedProduct,
  startWorkstationProductionRun,
  completeTrackedProductRepair,
  routeTrackedProductsToLossen,
  toggleTrackedProductPause,
  markTrackedProductReminder,
  linkPlanningOrderProduct,
  saveOccupancyAssignments,
  saveOccupancyAssignment,
  savePersonnelRecord,
  createProductionMessages,
} from "../../services/planningSecurityService";
import { useAdminAuth } from "../useAdminAuth";
import { getAuth } from "firebase/auth";
import { useNotifications } from "../../contexts/NotificationContext";
import { getISOWeek, startOfISOWeek } from "date-fns";
import {
  WORKSTATIONS,
  getISOWeekInfo,
  isInspectionOverdue,
} from "../../utils/workstationLogic";
import { normalizeMachine, FITTING_MACHINES, PIPE_MACHINES, getStartedCounterField } from "../../utils/hubHelpers";
import { toDateSafe } from "../../utils/dateUtils";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import { useWorkstationStore } from "../../components/digitalplanning/useWorkstationStore";
import {
  TimestampLike, DateValue, PlanningOrder, TrackedProductDoc,
  mergeTrackedProductDocs, OccupancyEntry, DowntimeRecord,
  StartProductionOptions, StartProductionResult, MoveLotOptions,
  PostProcessingPayload, RepairCompletePayload, RoutingToLossenResult,
  DocSnapLike, PersonnelEntry, AppUser, WorkstationHubProps,
  getAppId, LOSSEN_1218_SOURCE_STATIONS, LOSSEN_1218_STATION_NAME,
  AUTO_LOSSEN_1218_SOURCE_STATIONS, getLossenRoute, getTodayString,
  getYesterdayString, isDateWithinInclusiveRange, normalizePlanningStatus,
  isInactivePlanningStatus, toFiniteNumber, SHIFT_CONFIG, ShiftKey,
  getShiftEffectiveStart, getCurrentShiftKey, getCurrentShiftLabel,
  shiftMatchesBucket, resolveShiftKeyFromPerson
} from "../../components/digitalplanning/WorkstationTypes";


const WORKSTATION_SCOPED_ORDERS_LIMIT = 800;


export const useWorkstationData = (props: WorkstationHubProps) => {
    const { initialStationId, onExit, searchOrder } = props;
    const { t } = useTranslation();

    const { user: currentUser } = useAdminAuth() as { user: AppUser | null };

    const currentUserId = currentUser?.uid;

    const { showSuccess, showError, showInfo, showWarning, requestBrowserPermission, showConfirm , notify} = useNotifications();

    const navigate = useNavigate();

    const initialStationName = typeof initialStationId === "object" ? initialStationId?.name : initialStationId;

    const [selectedStation, setSelectedStation] = useState(
    initialStationName || "BH11"
  );

    const activeTab = useWorkstationStore((state: any) => state.activeTab);

    const setActiveTab = useWorkstationStore((state: any) => state.setActiveTab);

    const [rawOrders, setRawOrders] = useState<PlanningOrder[]>([]);

    const [rawProducts, setRawProducts] = useState<TrackedProductDoc[]>([]);

    const [occupancy, setOccupancy] = useState<OccupancyEntry[]>([]);

    const [personnel, setPersonnel] = useState<PersonnelEntry[]>([]);

    const [loading, setLoading] = useState(true);

    const [dataSourceRefreshKey, setDataSourceRefreshKey] = useState(0);

    const [searchFilterOrder] = useState<string | null>(searchOrder || null);

    const [archivedStats, setArchivedStats] = useState<{ done: number; items: TrackedProductDoc[] }>({ done: 0, items: [] });

    const backgroundTrackingUnsubRef = useRef<null | (() => void)>(null);

    const backgroundTrackingTimerRef = useRef<number | null>(null);

    const visibleRawProducts = useDeferredValue(rawProducts);

    const currentDate = new Date();

    const currentWeekInfo = getISOWeekInfo(currentDate);

    const isMobileMenuOpen = useWorkstationStore((state: any) => state.isMobileMenuOpen);

    const setIsMobileMenuOpen = useWorkstationStore((state: any) => state.setIsMobileMenuOpen);

    const [checkedInOperator, setCheckedInOperator] = useState<PersonnelEntry | null>(null);

    const [dismissedPromptShift, setDismissedPromptShift] = useState<ShiftKey | null>(null);

    const [timeHeartbeat, setTimeHeartbeat] = useState<number>(Date.now());

    const [activeDowntime, setActiveDowntime] = useState<DowntimeRecord | null>(null);

    useEffect(() => {
    if (!selectedStation) return;
    const q = query(
      collection(db, getPathString(PATHS.DOWNTIME)),
      where("machineId", "==", selectedStation),
      where("endTime", "==", null),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveDowntime({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveDowntime(null);
      }
    });
    return () => unsubscribe();
  }, [selectedStation]);

    const lastShiftRef = useRef<ShiftKey>(getCurrentShiftKey(new Date()));

    const nfcPendingBadgeRef = useRef<string | null>(null);

    const handleOperatorShiftCheckinRef = useRef<((badgeOverride?: unknown) => Promise<void>) | null>(null);

    const nfc = useNFCReader((employeeNumber: string) => {
    useWorkstationStore.getState().setOperatorBadgeInput(employeeNumber);
    nfcPendingBadgeRef.current = employeeNumber;
    // Aanmelden via ref zodat we geen forward-reference nodig hebben
    setTimeout(() => {
      const badge = nfcPendingBadgeRef.current;
      if (badge && handleOperatorShiftCheckinRef.current) {
        nfcPendingBadgeRef.current = null;
        handleOperatorShiftCheckinRef.current(badge);
      }
    }, 150);
  });

    useEffect(() => {
    if (!useWorkstationStore.getState().showOperatorCheckinModal || !nfc.isSupported) return;
    if (nfc.status !== NFC_STATUS.IDLE) return;

    nfc.startScan();

    return () => {
      if (nfc.status === NFC_STATUS.SCANNING) {
        nfc.stopScan();
      }
    };
  }, [useWorkstationStore.getState().showOperatorCheckinModal, nfc]);

    const lastAutoCheckoutMinuteRef = useRef("");

    const lastAppliedInitialStationRef = useRef<string | null>(null);

    const currentAppId = getAppId();

    const isPostProcessing = [
    "mazak",
    "nabewerking",
    "nabewerken",
    "naharding",
    "oven/naharding",
    "oven",
    "bm01",
    "station bm01",
  ].includes((selectedStation || "").toLowerCase());

    const isBM01 = (selectedStation || "").toUpperCase().replace(/\s/g, "") === "BM01" || (selectedStation || "").toUpperCase().includes("BM01");

    const isLossen1218Station = (String(normalizeMachine(selectedStation) || "").toUpperCase().replace(/\s/g, "") === "LOSSEN12/18");

    const requiresShiftCheckin = !["admin", "teamleader", "planner"].includes(String(currentUser?.role || "").toLowerCase());

    const currentShiftKey = useMemo(() => getCurrentShiftKey(new Date(timeHeartbeat)), [timeHeartbeat]);

    useEffect(() => {
    if (!initialStationName) return;
    setSelectedStation(initialStationName);

    // Alleen bij echte stationwissel de standaard tab forceren.
    if (lastAppliedInitialStationRef.current === initialStationName) return;
    lastAppliedInitialStationRef.current = initialStationName;

    if (["Mazak", "Nabewerking", "Nabewerken"].includes(initialStationName)) {
      setActiveTab("winding");
      return;
    }
    setActiveTab("terminal");
  }, [initialStationName]);

    useEffect(() => {
    if (!requiresShiftCheckin || !selectedStation) return;
    setCheckedInOperator(null);
  }, [selectedStation, requiresShiftCheckin]);

    useEffect(() => {
    const timer = setInterval(() => setTimeHeartbeat(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

    useEffect(() => {
    return undefined;
  }, []);

    useEffect(() => {
    if (lastShiftRef.current !== currentShiftKey) {
      setDismissedPromptShift(null);
      lastShiftRef.current = currentShiftKey;
    }
  }, [currentShiftKey]);

    useEffect(() => {
    if (searchFilterOrder && rawOrders.length > 0) {
      const foundOrder = rawOrders.find((order: PlanningOrder) => 
        order.orderId === searchFilterOrder || order.id === searchFilterOrder
      );
      
      if (foundOrder) {
        useWorkstationStore.getState().setSelectedOrder(foundOrder);
        setActiveTab("terminal"); // Toon de orders tab
        showInfo(t("digitalplanning.workstation.order_loaded", { order: searchFilterOrder }));
      } else {
        showWarning(t("digitalplanning.workstation.order_not_found", { order: searchFilterOrder }));
      }
    }
  }, [searchFilterOrder, rawOrders]);

    const isPWA = useMemo(() => {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator && window.navigator.standalone === true);
  }, []);

    useEffect(() => {
    if (!currentUser) return;
    
    // Prevent fetching if user is guest (no permissions)
    if (!currentUser.role || currentUser.role === 'guest') {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const unsubs: Array<() => void> = [];
    let loadedCount = 0;
    
    // Track which data sources have reported back (for faster perceived loading)
    const markStreamReady = () => {
      loadedCount++;
      // Stop loading as soon as orders + products are ready (most important data)
      if (loadedCount >= 2 && isMounted) {
        setLoading(false);
      }
    };
    
    const initData = async () => {
      const auth = getAuth();
      
      // Start loading immediately
      setLoading(true);
      
      // 1. Token refresh op achtergrond (niet-blokerend)
      if (auth.currentUser) {
        auth.currentUser.getIdToken(true).catch(e => 
          console.warn("Token refresh warning:", e)
        );
      }
      
      // 2. ALL listeners start in parallel (not sequential!)
      if (!isMounted) return;
      
      // LISTENER 1: Orders (root pad + scoped per-machine paden)
      let rootOrders: PlanningOrder[] = [];
      let scopedOrders: PlanningOrder[] = [];

      const mapOrderDoc = (docSnap: DocSnapLike): PlanningOrder | null => {
        const data = docSnap.data() as Record<string, unknown>;
        const explicitScopeType = String(data?._scopeType || "").trim();
        const resolvedOrderId = String(data?.orderId || data?.orderNumber || "").trim();

        // Bescherm KPI's tegen vervuilde/structurele documenten in digital_planning.
        if (explicitScopeType && explicitScopeType !== "planning_order") return null;
        if (!resolvedOrderId) return null;

        const plannedDateValue = data.plannedDate as { toDate?: () => Date } | undefined;
        let dateObj = plannedDateValue?.toDate ? plannedDateValue.toDate() : new Date();
        let { week, year } = getISOWeekInfo(dateObj);
        const sourceDataId = String(data?.id || "").trim();
        return {
          ...data,
          // id moet altijd de echte Firestore document-id blijven voor callables (save/move/cancel).
          id: docSnap.id,
          docId: docSnap.id,
          sourceDataId: sourceDataId || undefined,
          __docPath: docSnap.ref.path,
          sourcePath: data?.sourcePath || docSnap.ref.path,
          orderId: resolvedOrderId,
          item: String(data.item || data.productCode || t("digitalplanning.workstation.unknown_item")),
          plan: Number(data.plan || data.quantity || 0),
          dateObj,
          weekNumber: parseInt(String(data.week || data.weekNumber || week), 10),
          weekYear: parseInt(String(data.year || year), 10),
        };
      };

      const mergeOrders = () => {
        if (!isMounted) return;
        const merged = new Map();

        const getMergeKey = (order: PlanningOrder) => {
          const pathKey = String(order?.__docPath || order?.sourcePath || "").trim();
          if (pathKey) return pathKey;

          const orderKey = String(order?.orderId || order?.id || "").trim();
          const machineKey = String(normalizeMachine(order?.machine || "") || "").trim();
          if (!orderKey) return "";
          return machineKey ? `${orderKey}::${machineKey}` : orderKey;
        };

        rootOrders.forEach((o) => {
          const key = getMergeKey(o);
          if (key) merged.set(key, o);
        });
        // Scoped docs overschrijven root docs
        scopedOrders.forEach((o) => {
          const key = getMergeKey(o);
          if (key) merged.set(key, o);
        });
        setRawOrders(Array.from(merged.values()));
      };

      const ordersRef = collection(db, getPathString(PATHS.PLANNING));
      const ordersQuery = query(ordersRef, limit(400));
      const unsubOrders = onSnapshot(ordersQuery, (snap) => {
        rootOrders = snap.docs
          .map(mapOrderDoc)
          .filter((o): o is PlanningOrder => Boolean(o))
          .filter((o) => {
            const s = String(o?.status || "").toLowerCase().trim();
            return !["completed", "cancelled", "shipped", "rejected", "finished", "deleted", "gereed", "afkeur", "klaar"].includes(s);
          });
        mergeOrders();
        markStreamReady();
      }, (error: any) => {
        if (!isMounted) return;
        console.error("Orders sync error:", error);
        markStreamReady();
      });
      unsubs.push(unsubOrders);

      const currentStationClean = String(selectedStation || "").toUpperCase().replace(/\s/g, "");
      
      const isPostProcessing = [
        "mazak",
        "nabewerking",
        "nabewerken",
        "naharding",
        "oven/naharding",
        "oven",
        "bm01",
        "station bm01",
      ].includes(currentStationClean.toLowerCase());
      
      const isCentralStation = ["LOSSEN", "GEREED", "LOSSEN12/18"].includes(currentStationClean);
      
      const isWindingStation = !isPostProcessing && !isCentralStation;
      
      let unsubScopedOrders: () => void;
      
      if (isWindingStation) {
        const paths = [
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/40${currentStationClean}/orders`,
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/${currentStationClean}/orders`,
          `${getPathString(PATHS.PLANNING)}/Pipes/machines/40${currentStationClean}/orders`,
          `${getPathString(PATHS.PLANNING)}/Pipes/machines/${currentStationClean}/orders`,
        ];
        
        const docsMap = new Map<string, PlanningOrder[]>();
        
        const unsubsPaths = paths.map((path) => {
          return onSnapshot(
            collection(db, path),
            (snap) => {
              const docs = snap.docs
                .map(mapOrderDoc)
                .filter((o): o is PlanningOrder => Boolean(o))
              .filter((o) => {
                const s = String(o?.status || "").toLowerCase().trim();
                return !["completed", "cancelled", "shipped", "rejected", "finished", "deleted", "gereed", "afkeur", "klaar"].includes(s);
              });
              docsMap.set(path, docs);
              
              scopedOrders = Array.from(docsMap.values()).flat();
              mergeOrders();
              markStreamReady();
            },
            (err) => {
              console.warn(`Error listening to path ${path}:`, err);
              markStreamReady();
            }
          );
        });
        
        unsubScopedOrders = () => {
          unsubsPaths.forEach((unsub) => unsub());
        };
      } else {
        unsubScopedOrders = onSnapshot(
          query(collectionGroup(db, "orders"), limit(WORKSTATION_SCOPED_ORDERS_LIMIT)),
          (snap) => {
            const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;
            scopedOrders = snap.docs
              .filter((d) => {
                const path = d.ref.path || "";
                return (
                  path.startsWith(planningPrefix) &&
                  path.includes("/machines/") &&
                  path.includes("/orders/")
                );
              })
              .map(mapOrderDoc)
              .filter((o): o is PlanningOrder => Boolean(o))
              .filter((o) => {
                const s = String(o.status || "").toLowerCase();
                return !["completed", "cancelled", "shipped", "rejected", "finished", "deleted", "gereed", "afkeur", "klaar"].includes(s);
              });
            mergeOrders();
            markStreamReady();
          },
          (err) => {
            if (!isMounted) return;
            console.error("WorkstationHub Scoped Orders Sync Error:", err);
            markStreamReady();
          }
        );
      }
      unsubs.push(unsubScopedOrders);
      
      // LISTENER 2: Products (also starts immediately, in parallel)
      const normalizedSelectedStation = normalizeMachine(selectedStation);
      const usesPipeScope = PIPE_MACHINES.includes(normalizedSelectedStation);
      const trackingDepartments = usesPipeScope ? ["Pipes"] : ["Fittings"];
      const trackingMachines = usesPipeScope ? PIPE_MACHINES : FITTING_MACHINES;

      const unsubProds = subscribeTrackedProducts({
        db,
        statusExclusions: ["completed", "shipped", "deleted", "archived_rejected"],
        maxItems: 400,
        departments: trackingDepartments,
        machines: trackingMachines,
        onData: (items: any[]) => {
          if (isMounted) {
            setRawProducts(items);
          }
          markStreamReady();
        },
        onError: (error: any) => {
          console.warn("Tracking Sync Error:", error);
          markStreamReady();
        },
      });
      unsubs.push(unsubProds);

      if (backgroundTrackingTimerRef.current) {
        window.clearTimeout(backgroundTrackingTimerRef.current);
      }
      backgroundTrackingTimerRef.current = window.setTimeout(() => {
        if (!isMounted) return;
        if (backgroundTrackingUnsubRef.current) {
          backgroundTrackingUnsubRef.current();
          backgroundTrackingUnsubRef.current = null;
        }

        backgroundTrackingUnsubRef.current = subscribeTrackedProducts({
          db,
          statusExclusions: ["completed", "shipped", "deleted", "archived_rejected"],
          maxItems: 400,
          departments: trackingDepartments,
          machines: trackingMachines,
          onData: (items: any[]) => {
            if (isMounted) {
              setRawProducts(items);
            }
          },
          onError: (error: any) => {
            console.warn("Background tracking sync error:", error);
          },
        });
      }, 1800);
      unsubs.push(() => {
        if (backgroundTrackingTimerRef.current) {
          window.clearTimeout(backgroundTrackingTimerRef.current);
          backgroundTrackingTimerRef.current = null;
        }
        if (backgroundTrackingUnsubRef.current) {
          backgroundTrackingUnsubRef.current();
          backgroundTrackingUnsubRef.current = null;
        }
      });
      
      let fallbackOccupancyUnsub: (() => void) | null = null;

      // LISTENER 3: Occupancy (lazy load after main data is ready)
      const unsubOccupancy = onSnapshot(
        query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", getTodayString()), limit(100)),
        (snap) => {
          if (isMounted) setOccupancy(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) })));
        },
        (error: any) => {
          console.warn("Occupancy Sync Error (filtered), fallback to limit:", error);
          // Fallback if index missing or date format mismatch
          if (fallbackOccupancyUnsub) return;
          fallbackOccupancyUnsub = onSnapshot(
            query(collection(db, getPathString(PATHS.OCCUPANCY)), limit(50)),
            (snap) => {
              if (isMounted) setOccupancy(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) })));
            },
            (fallbackError) => {
              console.warn("Occupancy Sync Error (fallback):", fallbackError);
            }
          );
        }
      );
      unsubs.push(unsubOccupancy);
      unsubs.push(() => {
        if (!fallbackOccupancyUnsub) return;
        fallbackOccupancyUnsub();
        fallbackOccupancyUnsub = null;
      });
      
      // LISTENER 4: Personnel (gewijzigd naar getDocs want lijst verandert zelden tijdens shift)
      getDocs(query(collection(db, getPathString(PATHS.PERSONNEL)), limit(300)))
        .then((snap) => {
          if (isMounted) setPersonnel(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PersonnelEntry, "id">) })));
        })
        .catch((error) => console.warn("Personnel Sync Error:", error));

    };
    initData();
    return () => {
      isMounted = false;
      if (backgroundTrackingTimerRef.current) {
        window.clearTimeout(backgroundTrackingTimerRef.current);
        backgroundTrackingTimerRef.current = null;
      }
      if (backgroundTrackingUnsubRef.current) {
        backgroundTrackingUnsubRef.current();
        backgroundTrackingUnsubRef.current = null;
      }
      unsubs.forEach(u => u());
    };
  }, [currentUserId, dataSourceRefreshKey, selectedStation]);

    useEffect(() => {
      const now = new Date();
      const startOfWeek = startOfISOWeek(now);
      const year = now.getFullYear();
      
      const q = query(
          collection(db, getPathString(getArchiveItemsPath(year))),
          where("timestamps.finished", ">=", startOfWeek)
      );
      
      const unsub = onSnapshot(q, (snap) => {
          const items: TrackedProductDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrackedProductDoc, "id">) }));
          setArchivedStats({ done: snap.size, items });
      }, (error) => console.warn("Archive Sync Error:", error));
      
      return () => unsub();
  }, []);

    useEffect(() => {
    const checkAndSendReminders = async () => {
      if (!rawProducts.length) return;

      const overdueItems = rawProducts.filter((p) => {
        const pMachine = String(p.originMachine || p.currentStation || "");
        const currentStationNorm = normalizeMachine(selectedStation);
        const pMachineNorm = normalizeMachine(pMachine);

        const isHere =
          p.currentStation === selectedStation ||
          pMachineNorm === currentStationNorm;
        if (!isHere) return false;

        const isTempReject = p.inspection?.status === "Tijdelijke afkeur";
        const isOverdue =
          isTempReject && isInspectionOverdue(p.inspection?.timestamp);
        const alreadySent = p.reminderSent === true;

        return isOverdue && !alreadySent;
      });

      for (const item of overdueItems) {
        try {
          await createProductionMessages({
            messages: [{
              title: t("digitalplanning.workstation.reminder_title"),
              message: t("digitalplanning.workstation.reminder_message", { lot: item.lotNumber, station: selectedStation }),
              subject: t("digitalplanning.workstation.reminder_title"),
              content: t("digitalplanning.workstation.reminder_message", { lot: item.lotNumber, station: selectedStation }),
              type: "alert",
              priority: "high",
              source: "WorkstationHub",
              relatedLot: item.lotNumber,
              targetRoles: ["teamleader", "admin"],
              targetGroup: "TEAMLEADERS",
              broadcastToAll: true,
              metadata: {
                kind: "inspection_overdue",
                station: selectedStation,
                lotNumber: item.lotNumber,
              },
            }],
            source: "WorkstationHub",
            actorLabel: currentUser?.email || "Operator",
          });

          await markTrackedProductReminder({
            productId: (item.id || item.lotNumber) as string,
            reminderSent: true,
            actorLabel: currentUser?.email || "Operator",
            source: "WorkstationHub",
          });
        } catch (err) {
          console.error(t("digitalplanning.workstation.reminder_error"), err);
        }
      }
    };
    const timer = setTimeout(checkAndSendReminders, 2000);
    return () => clearTimeout(timer);
  }, [rawProducts, selectedStation]);

    const getShiftColor = useCallback((shiftLabel: unknown) => {
    const label = String(shiftLabel || "").toUpperCase();
    if (label.includes(t("digitalplanning.workstation.shift_morning_label").toUpperCase()) || label.includes("MORNING") || label.includes("EARLY") || label.includes("VROEGE")) {
      return "bg-amber-100 text-amber-800 border-amber-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_evening_label").toUpperCase()) || label.includes("EVENING") || label.includes("LATE")) {
      return "bg-indigo-100 text-indigo-800 border-indigo-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_night_label").toUpperCase()) || label.includes("NIGHT")) {
      return "bg-purple-100 text-purple-800 border-purple-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_day_label").toUpperCase()) || label === t("digitalplanning.workstation.shift_daydienst_label").toUpperCase()) {
      return "bg-blue-100 text-blue-800 border-blue-300";
    }
    return "bg-slate-100 text-slate-800 border-slate-300";
  }, [t]);

    const isShiftActive = useCallback((shiftLabel: unknown) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute; // tijd in minuten sinds middernacht
    
    const label = String(shiftLabel || "").toUpperCase();
    
    // Ochtend: 05:30 - 14:00
    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY") || label.includes("VROEGE")) {
      const startTime = 5 * 60 + 30; // 05:30
      const endTime = 14 * 60; // 14:00
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Avond: 14:00 - 22:30
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      const startTime = 14 * 60; // 14:00
      const endTime = 22 * 60 + 30; // 22:30
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Nacht: 22:30 - 05:30 (over middernacht heen)
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      const startTime = 22 * 60 + 30; // 22:30
      const endTime = 5 * 60 + 30; // 05:30
      return currentTime >= startTime || currentTime < endTime;
    }
    
    // Dag: 07:15 - 16:00
    if (label.includes("DAG") || label === "DAGDIENST") {
      const startTime = 7 * 60 + 15; // 07:15
      const endTime = 16 * 60; // 16:00
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Standaard: altijd tonen als shift niet herkend wordt
    return true;
  }, []);

    const stationOccupancy = useMemo(() => {
    if (!selectedStation || occupancy.length === 0 || personnel.length === 0) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const normalizedStation = normalizeMachine(selectedStation);
    
    return occupancy
      .filter((occ) => {
        if (normalizeMachine(occ.machineId || occ.station) !== normalizedStation) return false;
        const isActiveOccupancy = occ.isActive !== false && !occ.checkedOutAt;
        if (!occ.date) return false;
        
        if (!isActiveOccupancy) return false;
        const occDate = toDateSafe(occ.date) || new Date(occ.date as string | number | Date);
        occDate.setHours(0, 0, 0, 0);
        
        if (occDate.getTime() !== today.getTime()) return false;
        
        // FILTER: Alleen tonen als de shift momenteel actief is
        return isShiftActive(occ.shift);
      })
      .map((occ: OccupancyEntry) => {
        const operator = personnel.find((p: PersonnelEntry) => p.id === occ.operatorNumber || p.employeeNumber === occ.operatorNumber);
        return {
          ...occ,
          operatorName: occ.operatorName || operator?.name || `Operator ${occ.operatorNumber}`,
          shift: occ.shift || "DAGDIENST"
        };
      });
  }, [selectedStation, occupancy, personnel, isShiftActive]);

    useEffect(() => {
    if (!requiresShiftCheckin || !selectedStation) return;
    if (useWorkstationStore.getState().showOperatorCheckinModal) return;
    if (stationOccupancy.length > 0) return;
    if (dismissedPromptShift === currentShiftKey) return;
    // Auto-popup tijdelijk uitgeschakeld — operator meldt zich aan via de knop in de header
    // useWorkstationStore.getState().setShowOperatorCheckinModal(true);
  }, [
    requiresShiftCheckin,
    selectedStation,
    useWorkstationStore.getState().showOperatorCheckinModal,
    stationOccupancy.length,
    dismissedPromptShift,
    currentShiftKey,
  ]);

    useEffect(() => {
    if (!selectedStation) return;

    const now = new Date(timeHeartbeat);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Bepaal welke shifts geëindigd zijn op basis van de huidige tijd (retroactief checken)
    const expiredBuckets: ShiftKey[] = [];
    
    // VROEG: eindigt om 14:00
    if (currentMinutes >= 14 * 60) expiredBuckets.push("VROEG");
    // DAG: eindigt om 16:00
    if (currentMinutes >= 16 * 60) expiredBuckets.push("DAG");
    // LAAT: eindigt om 22:00
    if (currentMinutes >= 22 * 60) expiredBuckets.push("LAAT");
    // NACHT: eindigt om 06:00
    if (currentMinutes >= 6 * 60 && currentMinutes < 22 * 60) expiredBuckets.push("NACHT");

    if (expiredBuckets.length === 0) return;

    // Voorkom dat we dit tig keer per dag per bucket runnen.
    // We maken een sleutel aan die maar 1x per minuut verandert en onthouden weke buckets we zojuist hebben geprobeerd.
    const minuteKey = `${getTodayString()}_${now.getHours()}_${now.getMinutes()}_${expiredBuckets.join('-')}`;
    if (lastAutoCheckoutMinuteRef.current === minuteKey) return;
    lastAutoCheckoutMinuteRef.current = minuteKey;

    const runAutoCheckout = async () => {
      try {
        const todayStr = getTodayString();
        
        // Voor de zekerheid vragen we actieve occupancy op voor VANDAAG en GISTEREN
        const yesterdayStr = getYesterdayString();

        const occSnapToday = await getDocs(
          query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", todayStr), limit(500))
        );
        const occSnapYesterday = await getDocs(
          query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", yesterdayStr), limit(500))
        );

        const allDocs = [...occSnapToday.docs, ...occSnapYesterday.docs];

        // Filter alle documenten die actief zijn en in een verstreken bucket vallen
        const toCheckout: OccupancyEntry[] = allDocs
          .map((d): OccupancyEntry => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) }))
          .filter((entry) => {
            const isActive = entry.isActive !== false && !entry.checkedOutAt;
            if (!isActive) return false;
            
            return expiredBuckets.some(bucket => shiftMatchesBucket(entry.shift, bucket));
          });

        if (toCheckout.length === 0) return;

        // Sluit ALLE actieve operators van de verstreken diensten
        await saveOccupancyAssignments({
          records: toCheckout.map((entry) => {
            // Vind de bucket die we gaan sluiten
            const targetBucket = expiredBuckets.find(b => shiftMatchesBucket(entry.shift, b)) as ShiftKey;
            
            const previousHours = Number(entry.hoursWorked || 0);
            const checkedInDate = toDateSafe(entry.shiftEffectiveStart) || toDateSafe(entry.checkedInAt);
            
            // LET OP: bij auto-checkout gebruiken we de officiële checkout-tijd van de shift, NIET de huidige tijd (now)
            // anders zou een iPad die pas om 18:00 aangaat, de VROEGE dienst uren tot 18:00 doorrekenen.
            const shiftCfg = SHIFT_CONFIG[targetBucket];
            const autoCheckoutDate = new Date(checkedInDate || now);
            if (targetBucket === "NACHT" && checkedInDate && checkedInDate.getHours() >= 12) {
              // NACHT dienst gestart gisteren
              autoCheckoutDate.setDate(autoCheckoutDate.getDate() + 1);
            }
            autoCheckoutDate.setHours(Math.floor(shiftCfg.checkoutMinute / 60), shiftCfg.checkoutMinute % 60, 0, 0);

            // Als checkin Date ontbreekt of als we cumulatief tellen, bescherm against weird values
            let elapsedHours = 0;
            if (checkedInDate && autoCheckoutDate > checkedInDate) {
              elapsedHours = (autoCheckoutDate.getTime() - checkedInDate.getTime()) / 3600000;
            }

            const breakHours = (shiftCfg?.breakMinutes ?? 0) / 60;
            const grossHours = Number((previousHours + Math.max(0, elapsedHours)).toFixed(2));
            const finalHours = entry.isSecondary
              ? 0
              : Math.max(0, Number((grossHours - breakHours).toFixed(2)));

            return {
              assignmentId: entry.id,
              data: {
                hoursWorked: finalHours,
                hoursWorkedGross: entry.isSecondary ? 0 : grossHours,
                ...(breakHours > 0 && !entry.isSecondary ? { breakDeductedHours: breakHours } : {}),
                checkedOutAt: autoCheckoutDate, // Officiele eindtijd
                isActive: false,
                autoCheckout: true,
                autoCheckoutShift: targetBucket,
                autoCheckoutRetroactive: true, // Marker
                updatedAt: "__SERVER_TIMESTAMP__",
              },
            };
          }),
          source: "WorkstationHub.autoCheckoutRetroactive",
          actorLabel: currentUser?.email || "System",
        });

        setCheckedInOperator(null);
        setDismissedPromptShift(null);
        showInfo(`${toCheckout.length} operator(s) automatisch uitgecheckt vanwege verstreken shift.`);

      } catch (err) {
        console.error("Auto shift checkout fout:", err);
      }
    };

    runAutoCheckout();
  }, [selectedStation, timeHeartbeat, showInfo]);

    useEffect(() => {
    // handleOperatorShiftCheckinRef.current = handleOperatorShiftCheckin;
  }, []);

    const [currentOperatorIndex, setCurrentOperatorIndex] = useState(0);

    useEffect(() => {
    if (stationOccupancy.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentOperatorIndex((prev) => (prev + 1) % stationOccupancy.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [stationOccupancy.length]);

    useEffect(() => setCurrentOperatorIndex(0), [stationOccupancy]);

    const stationActivityByOrder = useMemo(() => {
    const map = new Map();
    if (!selectedStation) return map;

    const stationNorm = normalizeMachine(selectedStation);
    const stationClean = String(stationNorm || "").toUpperCase().replace(/\s/g, "");
    const isNabewerkingStation = stationClean === "NABEWERKING" || stationClean === "NABEWERKEN" || stationClean.includes("NABEWERK");
    const isBH18Station = stationClean === "BH18";
    const isBm01Station = stationClean === "BM01" || stationClean.includes("BM01");
    const isWikkelToLossenSourceStation = ["BH12", "BH15", "BH17", "BH18"].includes(stationClean);

    const matchesStation = (value: unknown) => {
      const norm = normalizeMachine(value || "");
      if (!norm) return false;
      const clean = norm.toUpperCase().replace(/\s/g, "");
      if (isNabewerkingStation) {
        return clean === "NABEWERKING" || clean === "NABEWERKEN" || clean.includes("NABEWERK");
      }
      if (isBm01Station) {
        return clean === "BM01" || clean.includes("BM01");
      }
      return norm === stationNorm;
    };

    visibleRawProducts.forEach((product) => {
      if (product.isVirtualLot) return;
      const orderId = String(product?.orderId || "").trim();
      if (!orderId) return;

      const isRelated = [
        product?.originMachine,
        product?.currentStation,
        product?.lastStation,
        product?.machine,
      ].some(matchesStation);
      if (!isRelated) return;

      const statusUpper = String(product?.status || "").toUpperCase();
      const stepUpper = String(product?.currentStep || "").toUpperCase();
      const isWaitingForLossen = stepUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("TE LOSSEN") || stepUpper === "LOSSEN";
      const isClosed =
        ["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR"].includes(statusUpper) ||
        stepUpper === "FINISHED" ||
        stepUpper === "REJECTED" ||
        (isWikkelToLossenSourceStation && !isBH18Station && isWaitingForLossen);

      const entry = map.get(orderId) || { active: 0, total: 0 };
      entry.total += 1;
      if (!isClosed) entry.active += 1;
      map.set(orderId, entry);
    });

    return map;
  }, [visibleRawProducts, selectedStation]);

    const stationOrders = useMemo(() => {
    if (!selectedStation) return [];
    if (selectedStation === "BM01" || selectedStation === "Station BM01")
      return rawOrders;

    const currentStationNorm = normalizeMachine(selectedStation);
    const currentStationClean = String(currentStationNorm || "").toUpperCase().replace(/\s/g, "");
    const isLossen1218Station = currentStationClean === "LOSSEN12/18";
    const isBH18 = currentStationClean === "BH18";
    const isWikkelToLossenSourceStation = ["BH12", "BH15", "BH17", "BH18"].includes(currentStationClean);
    const lossen1218OrderMachines = new Set(["BH12", "BH15", "BH17", "BH18", "12", "15", "17", "18"]);

    const getLossen1218Candidates = (order: PlanningOrder) => {
      const values = [
        order?.machine,
        order?.originalMachine,
        order?.sourceStation,
        order?.returnStation,
        order?.station,
        order?.workstation,
        order?.machineId,
        order?.wc,
      ];

      const normalized = values
        .map((value) => String(normalizeMachine(value || "") || "").toUpperCase().trim())
        .filter(Boolean);

      const path = String(order?.__docPath || order?.sourcePath || "").toUpperCase();
      if (path.includes("BH12") || path.includes("40BH12")) normalized.push("BH12");
      if (path.includes("BH15") || path.includes("40BH15")) normalized.push("BH15");
      if (path.includes("BH17") || path.includes("40BH17")) normalized.push("BH17");
      if (path.includes("BH18") || path.includes("40BH18")) normalized.push("BH18");

      return normalized;
    };
    const isFittingsStation = FITTING_MACHINES
      .map((s: any) => normalizeMachine(s))
      .includes(currentStationNorm);
    const stationField = getStartedCounterField(selectedStation) as string;

    const pipeStationsNorm = new Set(PIPE_MACHINES.map((s: any) => normalizeMachine(s)));
    const fittingStationsNorm = new Set(FITTING_MACHINES.map((s: any) => normalizeMachine(s)));

    const routePresenceByOrder: Record<string, { hasPipe: boolean; hasFitting: boolean }> = {};
    rawOrders.forEach((order: PlanningOrder) => {
      const orderId = String(order.orderId || "").trim();
      if (!orderId) return;

      const machineNorm = normalizeMachine(order.machine || "");
      if (!routePresenceByOrder[orderId]) {
        routePresenceByOrder[orderId] = { hasPipe: false, hasFitting: false };
      }

      if (pipeStationsNorm.has(machineNorm)) routePresenceByOrder[orderId].hasPipe = true;
      if (fittingStationsNorm.has(machineNorm)) routePresenceByOrder[orderId].hasFitting = true;
    });

    const pipeProgressCountByOrder = new Map();
    visibleRawProducts.forEach((p) => {
      if (p.isVirtualLot) return;
      const orderId = String(p.orderId || "").trim();
      if (!orderId) return;

      const sourceStationNorm = normalizeMachine(
        p.originMachine || p.machine || p.currentStation || ""
      );
      if (!pipeStationsNorm.has(sourceStationNorm)) return;

      if (p.status === "rejected" || p.currentStep === "REJECTED") return;

      const stepUpper = String(p.currentStep || "").toUpperCase();
      const statusLower = String(p.status || "").toLowerCase();
      const hasProgress =
        statusLower === "completed" ||
        (stepUpper && stepUpper !== "WIKKELEN" && stepUpper !== "HOLD_AREA");

      if (hasProgress) {
        pipeProgressCountByOrder.set(
          orderId,
          (pipeProgressCountByOrder.get(orderId) || 0) + 1
        );
      }
    });
    
    const orderStats: Record<string, { started: number; finished: number }> = {};
    visibleRawProducts.forEach((p: TrackedProductDoc) => {
      if (p.isVirtualLot) return;
      if (!p.orderId) return;
      if (p.status === "rejected" || p.currentStep === "REJECTED") return;

      if (!orderStats[p.orderId])
        orderStats[p.orderId] = { started: 0, finished: 0 };
      orderStats[p.orderId].started++;
      
      // FIX: 'Lossen' verwijderd uit active steps. Zodra een item op 'Lossen' staat, is het klaar voor de machine.
      const activeMachineSteps = ["Wikkelen", "HOLD_AREA"];
      const isFinishedForMachine = !activeMachineSteps.includes(String(p.currentStep || "")) || p.currentStep === "Finished" || p.status === "completed";
      if (isFinishedForMachine) orderStats[p.orderId].finished++;
    });

    const waitingForLossenOnlyByOrder = new Map();
    visibleRawProducts.forEach((p) => {
      if (p.isVirtualLot) return;
      const orderId = String(p?.orderId || "").trim();
      if (!orderId) return;

      const stationNorm = normalizeMachine(p?.originMachine || p?.machine || p?.currentStation || "");
      if (stationNorm !== currentStationNorm) return;

      const statusUpper = String(p?.status || "").toUpperCase();
      const stepUpper = String(p?.currentStep || "").toUpperCase();
      const isActive =
        !["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR"].includes(statusUpper) &&
        stepUpper !== "FINISHED" &&
        stepUpper !== "REJECTED";
      if (!isActive) return;

      const entry = waitingForLossenOnlyByOrder.get(orderId) || { totalActive: 0, waitingForLossen: 0 };
      entry.totalActive += 1;
      if (stepUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("TE LOSSEN") || stepUpper === "LOSSEN") {
          entry.waitingForLossen += 1;
      }
      waitingForLossenOnlyByOrder.set(orderId, entry);
    });

    const baseStationOrders = rawOrders
      .filter((o) => {
        const orderIdForActivity = String(o.orderId || "").trim();
        const activityMeta = stationActivityByOrder.get(orderIdForActivity);
        const hasStationActivityCheck = (activityMeta?.active || 0) > 0;
        const docPath = String(o?.__docPath || o?.sourcePath || "").toUpperCase();
        const strictScopedStations = new Set(["BH12", "BH18"]);
        if (strictScopedStations.has(currentStationClean)) {
          const machineScopedSuffix = `/FITTINGS/MACHINES/40${currentStationClean}/`;
          const planningBasePath = String(getPathString(PATHS.PLANNING) || "").toUpperCase();
          const trackingBasePath = String(getPathString(PATHS.TRACKING) || "").toUpperCase();
          const strictPathNeedles = [
            `${planningBasePath}${machineScopedSuffix}`,
            `${trackingBasePath}${machineScopedSuffix}`,
          ].filter(Boolean);

          const hasStrictPathMatch = strictPathNeedles.some((needle) => docPath.includes(needle));
          if (!hasStrictPathMatch) {
            return false;
          }
        }
        
        // Bereken effectieve plan: respecteer handmatige verlagingen (plan < quantity)
        const rawQuantity = toFiniteNumber(o.quantity);
        const rawPlanVal = toFiniteNumber(o.plan);
        const plannedAmt = rawPlanVal > 0 && rawPlanVal < rawQuantity ? rawPlanVal : Math.max(rawQuantity, rawPlanVal);
        const actualStartedCount = orderStats[orderIdForActivity]?.started || 0;
        const isActiveStatus = !isInactivePlanningStatus(o.status);
        // Detecteer echt tekort (actuele lots > 0 maar < plan) om spookorders te vermijden
        const hasShortage = plannedAmt > 0 && actualStartedCount > 0 && actualStartedCount < plannedAmt;
        const isManuallyIncreased = rawPlanVal > rawQuantity;

        // Verberg gesloten orders tenzij er nog stationactiviteit is of het plan handmatig is verhoogd
        if (isInactivePlanningStatus(o.status) && !hasStationActivityCheck) {
            // FIX KNIPPEREN: Verberg direct als actualStartedCount 0 is (data laadt nog) of als we niet handmatig verhoogd hebben.
            if (!isManuallyIncreased || actualStartedCount === 0 || actualStartedCount >= rawPlanVal) {
                return false;
            }
        }

        // Cross-station N2100: toon order in Fittingen pas als Spoolbouw
        // voldoende output heeft opgeleverd (x van y gating).
        const orderId = String(o.orderId || "").trim().toUpperCase();
        if (isFittingsStation && orderId.startsWith("N2100")) {
          const orderKey = String(o.orderId || "").trim();
          const routeInfo = routePresenceByOrder[orderKey];
          const isHybrid = routeInfo?.hasPipe && routeInfo?.hasFitting;

          if (isHybrid) {
            const readyCount = pipeProgressCountByOrder.get(orderKey) || 0;
            const explicitReleaseCount = Number(
              o.releaseToFittingsAtCount || o.spoolReleaseCount || 0
            );
            const plannedCount = Math.max(0, Number(o.plan || o.quantity || 0));
            const requiredCount = explicitReleaseCount > 0
              ? explicitReleaseCount
              : Math.max(1, plannedCount);

            if (readyCount < requiredCount) {
              return false;
            }
          }
        }

          const orderMachineNorm = normalizeMachine(o.machine);
          const lossenCandidates = isLossen1218Station ? getLossen1218Candidates(o) : [];
          if (isLossen1218Station && lossenCandidates.some((candidate) => lossen1218OrderMachines.has(candidate))) {
            return true;
          }
          const startedAtStation = toFiniteNumber(stationField ? o?.[stationField] || 0 : 0);
          const planAtStation = plannedAmt;
          const effectiveStarted = (hasShortage && isActiveStatus) ? actualStartedCount : startedAtStation;
          const hasRemainingPlan = (effectiveStarted > 0 && planAtStation > effectiveStarted) || (hasShortage && isActiveStatus);
          const activityMetaForOrder = stationActivityByOrder.get(orderIdForActivity);
          const hasStationActivity = (activityMetaForOrder?.active || 0) > 0;

          // Wikkelstations (BH-machines): Orders filteren op basis van "To do".
          // Als de "To do" op 0 staat, moet de order uit de planning van de BH machine 
          // gefilterd worden. Ongeacht de staat van de rest (stroomafwaarts).
          if (isWikkelToLossenSourceStation) {
            const producedAtOrder = toFiniteNumber(o.produced);
            // actualStartedCount excludes rejected products in WorkstationHub
            const effectiveGood = Math.max(producedAtOrder, actualStartedCount);
            const exactToDo = Math.max(0, planAtStation - effectiveGood);

            if (exactToDo <= 0) {
              return false;
            }
          }

        const isStationMachineMatch =
          o.machine === selectedStation || orderMachineNorm === currentStationNorm;

        // Voorkom cross-station lekken: een order hoort alleen op dit workstation
        // als de machine matcht of er aantoonbare lokale stationactiviteit is.
        // Een generiek "remaining plan" op orderniveau is op zichzelf niet genoeg.
        return isStationMachineMatch || hasStationActivity;
      })
      .map((o: PlanningOrder) => {
        const orderIdKey = String(o.orderId || "");
        const stats = orderStats[orderIdKey] || { started: 0, finished: 0 };
        let startedAtStation = 0;
        if (stationField) {
          startedAtStation = toFiniteNumber((o as Record<string, unknown>)[String(stationField)]);
        }
        const remainingAtStation = Math.max(0, Number(o.quantity || o.plan || 0) - startedAtStation);
        
        return {
          ...o,
          liveToDo: remainingAtStation,
          liveFinish: stats.finished,
          startedAtStation: startedAtStation,
        };
      })
      .sort(
        (a, b) =>
          (a.dateObj?.getTime?.() || 0) - (b.dateObj?.getTime?.() || 0) ||
          String(a.orderId).localeCompare(String(b.orderId))
      );

    return baseStationOrders;
  }, [rawOrders, visibleRawProducts, selectedStation, stationActivityByOrder]);

    const stationStats = useMemo(() => {
    const currentStationNorm = normalizeMachine(selectedStation);
    const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");

    const isBm01Station = cleanStationId.includes("BM01");
    const isLossenStation = cleanStationId === "LOSSEN";
    const isNabewerkingStation = cleanStationId === "NABEWERKING" || cleanStationId === "NABEWERKEN" || cleanStationId.includes("NABEWERK");
    const isMazakStation = cleanStationId === "MAZAK";
    const isDownstream = isBm01Station || isLossenStation || isNabewerkingStation || isMazakStation;

    if (isDownstream) {
        // BM01 Specifieke KPI Logica
      if (isBm01Station) {
            // Plan: Totaal van alle orders (want BM01 is centraal)
            let plan = 0;
            stationOrders.forEach(o => plan += Number(o.plan || 0));
            
            // Todo (Aan te bieden): Items die wachten op BM01
            let todo = 0;
            visibleRawProducts.forEach(p => {
                 const pStationNorm = normalizeMachine(p.currentStation || "");
                 const pStepUpper = (p.currentStep || "").toUpperCase();
                 const isActive = p.status !== "completed" && p.currentStep !== "Finished" && p.status !== "rejected" && p.currentStep !== "REJECTED";
                 
                 if ((pStationNorm === currentStationNorm || pStepUpper.includes("INSPECTIE") || pStepUpper === "BM01") && isActive) {
                     todo++;
                 }
            });
            
            // Done (Gereed): Items uit archief + actieve finished items
            let done = archivedStats.done;
            visibleRawProducts.forEach(p => {
                 if ((p.status === "completed" || p.currentStep === "Finished") && (p.currentStation === "GEREED" || p.lastStation === "BM01")) {
                     done++;
                 }
            });
            
            return { plan, todo, done };
        }

        const isActiveProduct = (p: TrackedProductDoc) => {
          const pStep = (p.currentStep || "").toUpperCase();
          const pStatus = String(p.status || "").toLowerCase();
          return pStep !== "FINISHED" && pStep !== "REJECTED" && pStatus !== "completed" && pStatus !== "rejected";
        };

        const todoCount = rawProducts.filter((p: TrackedProductDoc) => {
          const pStationNorm = normalizeMachine(p.currentStation || "");
          const pStep = p.currentStep || "";
          if (!isActiveProduct(p)) return false;

          if (isLossenStation) {
            return pStep === "Lossen" || pStationNorm === "LOSSEN";
          }
          if (isNabewerkingStation) {
            const pCleanUpper = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
            const sCleanUpper = (p.currentStep || "").toUpperCase().replace(/\s/g, "");
            return pCleanUpper === "NABEWERKING" || pCleanUpper === "NABEWERKEN" || pCleanUpper === "NABW" || pCleanUpper.includes("NABEWERK") || sCleanUpper === "NABEWERKING" || sCleanUpper === "NABEWERKEN" || sCleanUpper === "NABW" || sCleanUpper.includes("NABEWERK");
          }
          if (isMazakStation) {
            return pStationNorm === "MAZAK";
          }
          return pStationNorm === currentStationNorm;
        }).length;

        const doneCount = rawProducts.filter((p: TrackedProductDoc) => {
          const pLastStationNorm = normalizeMachine(p.lastStation || "");
          const pStationNorm = normalizeMachine(p.currentStation || "");
          const isFinished = p.status === "completed" || p.currentStep === "Finished";

          if (isLossenStation) {
            // Alles dat Lossen al verlaten heeft of afgerond is na Lossen
            return pLastStationNorm === "LOSSEN" || (pStationNorm === "LOSSEN" && isFinished);
          }
          if (isNabewerkingStation) {
            const pLastCleanUpper = (p.lastStation || "").toUpperCase().replace(/\s/g, "");
            return pLastCleanUpper === "NABEWERKING" || pLastCleanUpper === "NABEWERKEN" || pLastCleanUpper === "NABW" || pLastCleanUpper.includes("NABEWERK") || ((pStationNorm === "NABEWERKING" || pStationNorm === "NABEWERKEN" || pStationNorm === "NABW" || pStationNorm.includes("NABEWERK")) && isFinished);
          }
          if (isMazakStation) {
            return pLastStationNorm === "MAZAK" || (pStationNorm === "MAZAK" && isFinished);
          }
          return pLastStationNorm === currentStationNorm || (pStationNorm === currentStationNorm && isFinished);
        }).length;

        return { plan: todoCount + doneCount, done: doneCount, todo: todoCount };
    }

    let plan = 0;
    let todo = 0;
    const stationField = getStartedCounterField(selectedStation) as string;
    
    stationOrders.forEach((o: PlanningOrder) => {
      // Altijd dynamisch berekenen: plan - started_<machine>.
      const orderPlan = Number(o.plan || o.quantity || 0);
      let startedAtStation = 0;
      if (stationField) {
        startedAtStation = toFiniteNumber((o as Record<string, unknown>)[String(stationField)]);
      }
      const remainingQueue = Math.max(0, orderPlan - startedAtStation);
      
      todo += remainingQueue;
      
      const orderIdForActivity = String(o.orderId || "").trim();
      const activityMeta = stationActivityByOrder.get(orderIdForActivity);
      const activeFlowQty = activityMeta?.active || 0;
      
      plan += (remainingQueue + activeFlowQty);
    });

    // Wekelijkse 'Gereed' teller voor wikkelmachines
    let doneThisWeek = 0;
    const startOfWeekDate = startOfISOWeek(new Date());

    visibleRawProducts.forEach((p: TrackedProductDoc) => {
       const pMachineNorm = normalizeMachine(p.originMachine || p.machine || "");
       if (pMachineNorm !== currentStationNorm) return;
       if (p.status === "rejected" || p.currentStep === "REJECTED") return;
       
       const stepUpper = (p.currentStep || "").toUpperCase();
       const isFinishedForMachine = stepUpper !== "WIKKELEN" && stepUpper !== "HOLD_AREA";
       
       if (isFinishedForMachine || p.status === "completed") {
           const eventDate = p.timestamps?.lossen_start || p.timestamps?.wikkelen_end || p.updatedAt || p.createdAt;
           const d = toDateSafe(eventDate as Parameters<typeof toDateSafe>[0]);
           if (d && d >= startOfWeekDate) {
               doneThisWeek++;
           }
       }
    });

    (archivedStats.items || []).forEach((p: TrackedProductDoc) => {
       const pMachineNorm = normalizeMachine(p.originMachine || p.machine || "");
       if (pMachineNorm !== currentStationNorm) return;
       if (p.status === "rejected" || p.currentStep === "REJECTED") return;
       
       const eventDate = p.timestamps?.lossen_start || p.timestamps?.wikkelen_end || p.timestamps?.finished || p.archivedAt;
      const d = toDateSafe(eventDate as Parameters<typeof toDateSafe>[0]);
       if (d && d >= startOfWeekDate) {
           doneThisWeek++;
       }
    });

    return { plan, done: doneThisWeek, todo };
  }, [stationOrders, visibleRawProducts, selectedStation, archivedStats, stationActivityByOrder]);

    const activeUnitsHere = useMemo(() => {
    if (!selectedStation) return [];
    const currentStationNorm = normalizeMachine(selectedStation);
    const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");

    return visibleRawProducts.filter((p) => {
      if (p.currentStep === "Finished" || p.currentStep === "REJECTED")
        return false;

      const pMachine = String(p.originMachine || p.currentStation || "");
      const pMachineNorm = normalizeMachine(pMachine);
      const pClean = (pMachineNorm || "").toUpperCase().replace(/\s/g, "");

      if (cleanStationId === "MAZAK")
        return pClean === "MAZAK";
      
      if (cleanStationId === "NABEWERKING" || cleanStationId === "NABEWERKEN" || cleanStationId.includes("NABEWERK")) {
        // Altijd hoofdletterongevoelig vergelijken
        const pCleanUpper = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
        const match = (
          pCleanUpper === "NABEWERKING" || pCleanUpper === "NABEWERKEN" || pCleanUpper === "NABW" || pCleanUpper.includes("NABEWERK")
        );

        return match;
      }
      
      if (cleanStationId === "BM01" || cleanStationId.includes("BM01"))
        return pClean === "BM01" || pClean.includes("BM01");

      // NIEUW: BH31 (Reparatie) - Toon alles wat op dit station staat
      if (cleanStationId === "BH31") {
        return pClean === "BH31";
      }
      
      // Verberg items die in de wacht staan voor reparatie (Tijdelijke afkeur) op reguliere stations
      if (p.currentStep === "HOLD_AREA") return false;

      if (selectedStation.startsWith("BH")) {
        return (
          (pMachine === selectedStation ||
            pMachineNorm === currentStationNorm) &&
          (p.currentStep === "Wikkelen" || p.currentStep === "HOLD_AREA")
        );
      }
      return false;
    });
  }, [visibleRawProducts, selectedStation]);

    const selectedStationNormForHeader = normalizeMachine(selectedStation);

    const selectedStationCleanForHeader = (selectedStationNormForHeader || "").toUpperCase().replace(/\s/g, "");

    const isBm01HeaderStation = selectedStationCleanForHeader.includes("BM01");

    const isWorkstationGereedTab =
    !isBm01HeaderStation &&
    selectedStationCleanForHeader !== "LOSSEN" &&
    selectedStationCleanForHeader !== "LOSSEN12/18" &&
    selectedStationCleanForHeader !== "MAZAK" &&
    selectedStationCleanForHeader !== "NABEWERKING" &&
    selectedStationCleanForHeader !== "NABEWERKEN" &&
    !selectedStationCleanForHeader.includes("NABEWERK");

    const isTwoKpiHeaderStation =
    selectedStationCleanForHeader === "LOSSEN" ||
    selectedStationCleanForHeader === "MAZAK" ||
    selectedStationCleanForHeader === "NABEWERKING" ||
    selectedStationCleanForHeader === "NABEWERKEN" ||
    selectedStationCleanForHeader.includes("NABEWERK");

    const todoHeaderLabel = isBm01HeaderStation
    ? t("digitalplanning.terminal.tab_to_offer")
    : t("digitalplanning.workstation.todo");

    const [pullStartY, setPullStartY] = useState(0);

    const [pullDistance, setPullDistance] = useState(0);

    const [isRefreshing, setIsRefreshing] = useState(false);

    const contentRef = useRef<HTMLDivElement | null>(null);
    
    return {
        currentUserId,
        navigate,
        initialStationName,
        selectedStation,
        setSelectedStation,
        activeTab,
        setActiveTab,
        rawOrders,
        setRawOrders,
        rawProducts,
        setRawProducts,
        occupancy,
        setOccupancy,
        personnel,
        setPersonnel,
        loading,
        setLoading,
        dataSourceRefreshKey,
        setDataSourceRefreshKey,
        archivedStats,
        setArchivedStats,
        backgroundTrackingUnsubRef,
        backgroundTrackingTimerRef,
        visibleRawProducts,
        currentDate,
        currentWeekInfo,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        checkedInOperator,
        setCheckedInOperator,
        dismissedPromptShift,
        setDismissedPromptShift,
        timeHeartbeat,
        setTimeHeartbeat,
        activeDowntime,
        setActiveDowntime,
        lastShiftRef,
        nfcPendingBadgeRef,
        handleOperatorShiftCheckinRef,
        nfc,
        lastAutoCheckoutMinuteRef,
        lastAppliedInitialStationRef,
        currentAppId,
        isPostProcessing,
        isBM01,
        isLossen1218Station,
        requiresShiftCheckin,
        currentShiftKey,
        isPWA,
        getShiftColor,
        isShiftActive,
        stationOccupancy,
        currentOperatorIndex,
        setCurrentOperatorIndex,
        stationActivityByOrder,
        stationOrders,
        stationStats,
        activeUnitsHere,
        selectedStationNormForHeader,
        selectedStationCleanForHeader,
        isBm01HeaderStation,
        isWorkstationGereedTab,
        isTwoKpiHeaderStation,
        todoHeaderLabel,
        pullStartY,
        setPullStartY,
        pullDistance,
        setPullDistance,
        isRefreshing,
        setIsRefreshing,
        contentRef,
        t,
        currentUser,
        showSuccess,
        showError,
        showInfo,
        showWarning,
        requestBrowserPermission,
        showConfirm,
        notify,
        WORKSTATIONS
    };
};
