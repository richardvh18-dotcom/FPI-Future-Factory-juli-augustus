import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { db } from '../../config/firebase';
import {
  collection, collectionGroup, onSnapshot, orderBy, query, doc,
  where, getDocs, limit, getDoc, documentId, startAfter
} from 'firebase/firestore';
import { PATHS, getPathString, getArchiveItemsPath } from '../../config/dbPaths';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle,
  Printer, Usb, Play, ArrowLeft, Zap, Search,
  RotateCcw, Eye, X, Tag, Settings2
} from 'lucide-react';
import { generateLotBatchZPL } from '../../utils/zplHelper';
import { resolvePrinterDpi } from '../../utils/printerDrivers';
import { applyLabelLogic, processLabelData, getCompactPrintVariables, filterOrderLabelsByProduct } from '../../utils/labelHelpers';
import { getISOWeekInfo, getStationMachineCode } from '../../utils/lotLogic';
import {
  transitionPrintQueueJobStatus,
  requeuePrintQueueJob,
  deletePrintQueueJob,
  queuePrintJob,
} from '../../services/planningSecurityService';
import {
  doesUsbDeviceMatchPrinter,
  parseUsbId,
  resolveUsbDeviceForPrinter,
  printRawUsbToDevice,
  isUsbDirectSupported as usbDirectSupported,
} from '../../utils/usbPrintService';
import TempLabelModal from './modals/TempLabelModal';
import LotPrintModal from './modals/LotPrintModal';
import AutoScaledLabelPreview from './AutoScaledLabelPreview';
import { useNotifications } from '../../contexts/NotificationContext';
import { useLabelCatalog } from '../../hooks/useLabelCatalog';
import { renderLabelToBitmapZpl } from '../../utils/zebraLabelRenderEngine';
import {
  buildProtocolAwareUsbPayload,
  renderLabelForPrinter,
} from '../../utils/printerProtocolService';
import { resolvePrinterForRouting } from '../../utils/printRouting';
import { getPreferredQueuePrinterForContext, isQueueJobAllowedForPrinter } from './printQueueProcessorHelpers';
import {
  LABELS_PRINTING_QUEUE_STATION,
  normalizeQueueStationKey,
  resolvePrintTransport,
} from '../../services/printRouting';
import {
  buildOrderLabelPreviewData,
  buildOrderLabelTemplateProduct,
  hasOrderLabelCode,
  getOrderLabelDescription,
  getOrderLabelItemCode,
  getOrderLabelOrder,
  isOrderLabelFlangeProduct,
  normalizeOrderLabelProductData,
  pickPreferredTempTemplateId,
  resolveLinkedTemplateChain,
} from '../../utils/orderLabelTemplateUtils';
import { loadFactoryMachinePaths } from '../../utils/orderLabelSearch';
import { shouldResetOrderLabelMachineState } from '../../utils/orderLabelMachineState';
import { safeSetLocalStorage } from '../../utils/safeStorage';
import { isPrinterOnline } from '../../utils/printerStatus';

import { AnyRecord, LabelTemplate, PrinterConfig, DepartmentGroup, TempLabelItemProps, TempLabelModalProps, LotPrintModalProps, PrintJob } from './printQueue.types';
import {
  USB_PRINTER_VENDOR_KEY, USB_PRINTER_PRODUCT_KEY, USB_PRINTER_SERIAL_KEY, USB_PRINTER_ID_KEY,
  PRINT_STATION_SELECTED_KEY, PRINT_STATION_BINDINGS_KEY, PRINT_QUEUE_ADMIN_PROCESSOR_LOCK_KEY,
  PRINT_QUEUE_ADMIN_AUTO_PRINT_KEY, MACHINE_ORDERS_READ_LIMIT, SCOPED_ORDERS_FALLBACK_LIMIT,
  SCOPED_ORDERS_SEARCH_FALLBACK_LIMIT, ORDER_LABELS_PAGE_SIZE, ORDER_LABELS_LIST_MIN_HEIGHT,
  ADMIN_PROCESSOR_LOCK_HEARTBEAT_MS, PREVIEW_ROLL_WIDTH_MM,
  safeStoredUsbSerial, isInvalidPrintQueueTransitionError, getLivePrintQueueJobStatus,
  stationNameFromValue, normalizeStationKey, normalizeQueueStatus, isQueuedJobStatus,
  normalizeDepartmentKey, DEPARTMENT_CANONICAL_RULES, getDepartmentMatchKeys, getDepartmentKeys,
  normalizeStationBindingKey, readStationBindings, writeStationBindings, getPrinterAllowedStationKeys,
  getJobStationKeys, getPrinterRoutingViolation, resolveUsbBoundPrinter, StatusBadge,
  isUsbDirectSupported, printRawUsb, isLikelyPreBatchedZpl, replaceLastLiteral,
  enforceCutModeOnBatchPayload, getTimestampMillis
} from './printQueueHelpers';

export const usePrintQueueAdmin = () => {
  const { role, user } = useAdminAuth();
  const { t } = useTranslation();
  const { showConfirm , notify} = useNotifications();
  const canManage = ['admin', 'teamleader', 'planner'].includes(String(role || ''));
  const canQueueReprint = canManage || String(role || '').toLowerCase() === 'operator';

  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [usbDevice, setUsbDevice] = useState<USBDevice | null>(null);
  const usbDeviceRef = useRef<USBDevice | null>(null);
  // In Electron/VS Code: geen WebUSB beschikbaar, auto-print altijd uit.
  const [autoPrint, setAutoPrint] = useState<boolean>(() => isUsbDirectSupported() ? true : false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const [error, setError] = useState('');

  const [showTempModal, setShowTempModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  
  // Nieuwe state voor navigatie en reprint
  const [viewMode, setViewMode] = useState<'overview' | 'station' | 'printer'>('overview');
  const [selectedOverviewPrinterId, setSelectedOverviewPrinterId] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [reprintSearch, setReprintSearch] = useState('');
  const [reprintResult, setReprintResult] = useState<AnyRecord | null>(null);
  const [exactReprintJob, setExactReprintJob] = useState<PrintJob | null>(null);
  const { labelTemplates, labelRules } = useLabelCatalog();
  const [isSearching, setIsSearching] = useState(false);
  const [previewJob, setPreviewJob] = useState<PrintJob | null>(null);
  const [previewSize, setPreviewSize] = useState("3.54x5.91");
  const [previewSizeLabel, setPreviewSizeLabel] = useState("90x150 mm");
  const [factoryConfig, setFactoryConfig] = useState<AnyRecord | null>(null);
  const [bindingStation, setBindingStation] = useState<string>(() => String(localStorage.getItem(PRINT_STATION_SELECTED_KEY) || '').trim());
  const [stationBindings, setStationBindings] = useState<Record<string, string>>(() => readStationBindings());
  const [isLabelsPrinterPickerOpen, setIsLabelsPrinterPickerOpen] = useState(false);
  const [labelsPrinterPickerReason, setLabelsPrinterPickerReason] = useState('');
  const [labelsPrinterPickerSelectionId, setLabelsPrinterPickerSelectionId] = useState('');
  const labelsPrinterPickerResolveRef = useRef<((printer: PrinterConfig | null) => void) | null>(null);

  useEffect(() => {
    usbDeviceRef.current = usbDevice;
  }, [usbDevice]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PRINT_QUEUE_ADMIN_AUTO_PRINT_KEY, autoPrint ? 'true' : 'false');
    } catch {
      // no-op
    }
  }, [autoPrint]);

  useEffect(() => {
    if (previewJob?.metadata?.width && previewJob?.metadata?.height) {
        const widthMm = PREVIEW_ROLL_WIDTH_MM;
        const heightMm = Number(previewJob.metadata.height);
        const widthInches = (widthMm / 25.4).toFixed(2);
        const heightInches = (heightMm / 25.4).toFixed(2);
        setPreviewSize(`${widthInches}x${heightInches}`);
        setPreviewSizeLabel(`${widthMm}x${heightMm} mm`);
    }
  }, [previewJob]);

  useEffect(() => {
    // 1. Probeer automatisch te verbinden met een eerder gekozen USB printer
    const matchesSavedUsbDevice = (
      device: USBDevice,
      savedVendor?: string | null,
      savedProduct?: string | null,
      savedSerial?: string | null,
      savedPrinterId?: string
    ): boolean => {
      const expectedSerial = String(savedSerial || '').trim();
      if (expectedSerial) {
        return String(device.serialNumber || '').trim() === expectedSerial;
      }

      if (savedVendor && savedProduct) {
        return (
          device.vendorId === parseInt(savedVendor, 10) &&
          device.productId === parseInt(savedProduct, 10)
        );
      }

      if (savedPrinterId) {
        const savedPrinter = printers.find((printer) => printer.id === savedPrinterId);
        if (savedPrinter?.vendorId !== undefined && savedPrinter?.productId !== undefined) {
          return (
            Number(savedPrinter.vendorId) === device.vendorId &&
            Number(savedPrinter.productId) === device.productId
          );
        }
      }

      return false;
    };

    const restoreUsbConnection = async () => {
      if (!isUsbDirectSupported()) return;
      
      const savedVendor = localStorage.getItem(USB_PRINTER_VENDOR_KEY);
      const savedProduct = localStorage.getItem(USB_PRINTER_PRODUCT_KEY);
      const savedSerial = localStorage.getItem(USB_PRINTER_SERIAL_KEY);
      const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();
      
      try {
        const devices = await navigator.usb.getDevices();
        if (devices.length === 0) return;

        const match = devices.find((device) =>
          matchesSavedUsbDevice(device, savedVendor, savedProduct, savedSerial, savedPrinterId)
        );

        if (match) {
          setUsbDevice(match);
          return;
        }

        if (!savedVendor && !savedProduct && !savedSerial && !savedPrinterId && devices.length === 1) {
          setUsbDevice(devices[0]);
          return;
        }
      } catch (err) {
        console.warn("Kon USB printer niet automatisch herstellen:", err);
      }
    };

    const handleUsbConnect = (event: Event) => {
      const device = event.device;
      if (!device) return;
      const savedVendor = localStorage.getItem(USB_PRINTER_VENDOR_KEY);
      const savedProduct = localStorage.getItem(USB_PRINTER_PRODUCT_KEY);
      const savedSerial = localStorage.getItem(USB_PRINTER_SERIAL_KEY);
      const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();

      if (matchesSavedUsbDevice(device, savedVendor, savedProduct, savedSerial, savedPrinterId) || (!savedVendor && !savedProduct && !savedSerial && !savedPrinterId)) {
        setUsbDevice(device);
      }
    };

    const handleUsbDisconnect = (event: Event) => {
      const disconnectedDevice = event.device;
      const currentUsbDevice = usbDeviceRef.current;
      if (!disconnectedDevice || !currentUsbDevice) return;

      const disconnectedSerial = String(disconnectedDevice.serialNumber || '').trim();
      const currentSerial = String(currentUsbDevice.serialNumber || '').trim();
      const sameDevice = disconnectedSerial && currentSerial
        ? (
          disconnectedDevice.vendorId === currentUsbDevice.vendorId
          && disconnectedDevice.productId === currentUsbDevice.productId
          && disconnectedSerial === currentSerial
        )
        : (
          disconnectedDevice.vendorId === currentUsbDevice.vendorId
          && disconnectedDevice.productId === currentUsbDevice.productId
        );

      if (!sameDevice) return;

      void navigator.usb.getDevices()
        .then((devices) => {
          const stillAuthorized = devices.some((device) => {
            const deviceSerial = String(device.serialNumber || '').trim();
            if (currentSerial && deviceSerial) {
              return (
                device.vendorId === currentUsbDevice.vendorId
                && device.productId === currentUsbDevice.productId
                && deviceSerial === currentSerial
              );
            }
            return device.vendorId === currentUsbDevice.vendorId && device.productId === currentUsbDevice.productId;
          });

          if (!stillAuthorized) {
            setUsbDevice(null);
          }
        })
        .catch(() => {
          setUsbDevice(null);
        });
    };

    void restoreUsbConnection();
    if (typeof navigator !== 'undefined' && 'usb' in navigator && (navigator as any).usb) {
      (navigator as any).usb.addEventListener('connect', handleUsbConnect as EventListener);
      (navigator as any).usb.addEventListener('disconnect', handleUsbDisconnect as EventListener);
    };

    // Printers ophalen
    const unsubPrinters = onSnapshot(collection(db, getPathString(PATHS.PRINTERS)), (snapshot) => {
      setPrinters(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as AnyRecord) })));
    });

    let rootJobs: PrintJob[] = [];
    let scopedJobs: PrintJob[] = [];

    const normalizeJob = (docSnap: import("firebase/firestore").DocumentSnapshot): PrintJob | null => {
      const data = (docSnap.data() || {}) as AnyRecord;
      const metadata = (data.metadata || {}) as AnyRecord;
      const isQueueJob = Boolean(
        String(data._scopeType || '').trim() === 'print_queue'
        || data.printerId
        || data.zpl
        || data.printData
        || data.labelZPL
        || data.status
        || data.machineId
        || metadata.description
        || metadata.stationId
        || metadata.targetStation
      );
      if (!isQueueJob) return null;
      return { id: docSnap.id, ...data, __refPath: String(docSnap.ref?.path || '') } as PrintJob;
    };

    const tsToMillis = (ts: unknown) => {
      if (!ts) return 0;
      if (typeof (ts as any).toDate === 'function') return (ts as any).toDate().getTime();
      const parsed = new Date(String(ts));
      return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
    };

    const printQueuePathFragment = `${PATHS.PRINT_QUEUE.join('/')}/`;
    const isScopedPrintQueuePath = (refPath: unknown): boolean => {
      const normalizedPath = String(refPath || '').replace(/^\/+/, '').toLowerCase();
      const normalizedFragment = String(printQueuePathFragment || '').replace(/^\/+/, '').toLowerCase();
      return normalizedPath.includes(normalizedFragment);
    };

    const mergeJobs = () => {
      const byId = new Map<string, PrintJob>();
      rootJobs.forEach((job) => {
        if (job?.id) byId.set(job.id, job);
      });
      // Scoped docs krijgen voorrang op legacy root docs.
      scopedJobs.forEach((job) => {
        if (job?.id) byId.set(job.id, job);
      });
      const merged = Array.from(byId.values()).sort((a: PrintJob, b: PrintJob) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
      setPrintJobs(merged);
      setLoading(false);
    };

    const rootQ = query(
      collection(db, getPathString(PATHS.PRINT_QUEUE)),
      orderBy('createdAt', 'desc'),
      limit(300)
    );
    const unsubscribeRoot = onSnapshot(rootQ, (snapshot) => {
      rootJobs = snapshot.docs.map(normalizeJob).filter((job): job is PrintJob => Boolean(job));
      mergeJobs();
    }, (err) => {
      console.error('Error fetching legacy print jobs:', err);
      rootJobs = [];
      mergeJobs();
    });

    let unsubscribeScopedFallback: (() => void) | null = null;

    const applyScopedSnapshot = (snapshot: import("firebase/firestore").QuerySnapshot) => {
      scopedJobs = snapshot.docs
        .filter((docSnap: import("firebase/firestore").DocumentSnapshot) => isScopedPrintQueuePath(docSnap.ref?.path))
        .map(normalizeJob)
        .filter((job: PrintJob | null): job is PrintJob => {
          if (!job) return false;
          const scopeType = String((job as PrintJob)._scopeType || '').trim().toLowerCase();
          return !scopeType || scopeType === 'print_queue';
        });
      mergeJobs();
    };

    const subscribeScopedFallback = () => {
      const fallbackQ = query(
        collectionGroup(db, 'items'),
        where('_scopeType', '==', 'print_queue'),
        limit(600)
      );

      unsubscribeScopedFallback = onSnapshot(fallbackQ, (snapshot) => {
        applyScopedSnapshot(snapshot);
      }, (fallbackErr) => {
        console.error('Error fetching scoped print jobs (fallback):', fallbackErr);
        scopedJobs = [];
        mergeJobs();
      });
    };

    const scopedQ = query(
      collectionGroup(db, 'items'),
      where('_scopeType', '==', 'print_queue'),
      orderBy('createdAt', 'desc'),
      limit(600)
    );
    const unsubscribeScoped = onSnapshot(scopedQ, (snapshot) => {
      applyScopedSnapshot(snapshot);
    }, (err) => {
      console.error('Error fetching scoped print jobs:', err);

      const errCode = String((err as { code?: unknown })?.code || '').toLowerCase();
      const errMessage = String((err as { message?: unknown })?.message || '').toLowerCase();
      const looksLikeMissingIndex = errCode.includes('failed-precondition') || errMessage.includes('index');

      if (looksLikeMissingIndex && !unsubscribeScopedFallback) {
        subscribeScopedFallback();
        return;
      }

      scopedJobs = [];
      mergeJobs();
    });

    return () => {
      unsubPrinters();
      unsubscribeRoot();
      unsubscribeScoped();
      if (unsubscribeScopedFallback) unsubscribeScopedFallback();
      if (typeof navigator !== 'undefined' && 'usb' in navigator && (navigator as any).usb) {
        (navigator as any).usb.removeEventListener('connect', handleUsbConnect as EventListener);
        (navigator as any).usb.removeEventListener('disconnect', handleUsbDisconnect as EventListener);
      }
    };
  }, []);

  useEffect(() => {
    const unsubFactory = onSnapshot(doc(db, getPathString(PATHS.FACTORY_CONFIG)), (snap) => {
      setFactoryConfig(snap.exists() ? snap.data() : null);
    });

    return () => {
      unsubFactory();
    };
  }, []);

  const userDepartmentKeys = useMemo(() => {
    const userRecord = (user || {}) as AnyRecord;
    return getDepartmentMatchKeys(
      userRecord.departmentId
      || userRecord.department
      || userRecord.currentDepartment
      || userRecord.dept
      || ''
    );
  }, [user]);

  const scopedFactoryDepartments = useMemo<AnyRecord[]>(() => {
    const departments = Array.isArray(factoryConfig?.departments) ? (factoryConfig?.departments as AnyRecord[]) : [];
    if (userDepartmentKeys.length === 0 || String(role || '').toLowerCase() === 'admin') {
      return departments;
    }

    return departments.filter((department) => {
      const departmentKeys = getDepartmentKeys(department);
      return userDepartmentKeys.some((userKey) => departmentKeys.includes(userKey));
    });
  }, [factoryConfig, role, userDepartmentKeys]);

  const allFactoryStations = useMemo<string[]>(() => {
    const stations = scopedFactoryDepartments
      .flatMap((dept: AnyRecord) => (Array.isArray(dept?.stations) ? dept.stations : []))
      .map(stationNameFromValue)
      .filter(Boolean) as string[];

    return Array.from(new Set(stations)).sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
  }, [scopedFactoryDepartments]);

  useEffect(() => {
    if (allFactoryStations.length === 0) return;
    if (!bindingStation) {
      setBindingStation(allFactoryStations[0]);
      return;
    }

    const exists = allFactoryStations.some((station) => station === bindingStation);
    if (!exists) setBindingStation(allFactoryStations[0]);
  }, [allFactoryStations, bindingStation]);

  useEffect(() => {
    if (!bindingStation) return;
    localStorage.setItem(PRINT_STATION_SELECTED_KEY, bindingStation);
  }, [bindingStation]);

  const stationContext = selectedStation || bindingStation || null;
  const wizardStationContext = bindingStation || null;

  const persistStationBinding = useCallback((station: string, printerId: string) => {
    const stationKey = normalizeStationBindingKey(station);
    if (!stationKey || !printerId) return;

    const nextBindings = {
      ...readStationBindings(),
      [stationKey]: printerId,
    };

    writeStationBindings(nextBindings);
    setStationBindings(nextBindings);
    setBindingStation(station);
    localStorage.setItem(USB_PRINTER_ID_KEY, printerId);
  }, []);

  const handleSaveStationBinding = useCallback((station: string, printerId: string) => {
    persistStationBinding(station, printerId);
    const selectedPrinter = printers.find((printer) => printer.id === printerId);
    notify(
      t('printStationView.printerWizardSaved', 'Station {{station}} gekoppeld aan printer {{printer}}.', {
        station,
        printer: String(selectedPrinter?.name || printerId),
      })
    );
  }, [persistStationBinding, printers, notify, t]);

  const activeStationBindingPrinterName = useMemo(() => {
    if (!wizardStationContext) return '';
    const stationKey = normalizeStationBindingKey(wizardStationContext);
    const printerId = String(stationBindings?.[stationKey] || '').trim();
    if (!printerId) return '';
    return String(printers.find((printer) => printer.id === printerId)?.name || printerId);
  }, [wizardStationContext, stationBindings, printers]);

  const preferredLabelQueuePrinter = useMemo(() => {
    return getPreferredQueuePrinterForContext(printers, {
      stationId: stationContext || undefined,
      preferLabelsQueue: true,
    });
  }, [printers, stationContext]);

  const labelsQueuePrinters = useMemo(() => {
    return printers.filter((printer) => getPrinterAllowedStationKeys(printer).includes('LABELSPRINTING'));
  }, [printers]);

  const selectedLabelsQueuePrinter = useMemo(() => preferredLabelQueuePrinter || labelsQueuePrinters[0] || null, [preferredLabelQueuePrinter, labelsQueuePrinters]);

  const requestLabelsQueuePrinter = useCallback((reason: string) => {
    if (labelsQueuePrinters.length === 0) {
      return Promise.resolve(null);
    }

    if (labelsQueuePrinters.length === 1) {
      return Promise.resolve(labelsQueuePrinters[0]);
    }

    return new Promise<PrinterConfig | null>((resolve) => {
      labelsPrinterPickerResolveRef.current = resolve;
      setLabelsPrinterPickerReason(reason);
      setLabelsPrinterPickerSelectionId(labelsQueuePrinters[0]?.id || '');
      setIsLabelsPrinterPickerOpen(true);
    });
  }, [labelsQueuePrinters]);

  const closeLabelsPrinterPicker = useCallback((printer: PrinterConfig | null) => {
    const resolver = labelsPrinterPickerResolveRef.current;
    labelsPrinterPickerResolveRef.current = null;
    setIsLabelsPrinterPickerOpen(false);
    setLabelsPrinterPickerReason('');
    setLabelsPrinterPickerSelectionId('');
    if (resolver) resolver(printer);
  }, []);

  const activeTilePrinterContext = useMemo(() => {
    const labelsPrinterName = String(
      selectedLabelsQueuePrinter?.name || selectedLabelsQueuePrinter?.id || 'Geen queue printer'
    );

    if (selectedLabelsQueuePrinter) {
      return `Queue: ${labelsPrinterName}`;
    }

    return 'Queue printer nog niet toegewezen';
  }, [selectedLabelsQueuePrinter]);

  // Auto-print logica
  useEffect(() => {
    const matchedPrinter = resolveUsbBoundPrinter(printers, usbDevice, stationContext || undefined);
    const currentPrinterId = matchedPrinter?.id || null;
    console.log('[AutoPrint] check', { autoPrint, hasUsbDevice: !!usbDevice, usbVid: usbDevice?.vendorId, usbPid: usbDevice?.productId, isProcessing, currentPrinterId, matchedPrinterName: matchedPrinter?.name });
    if (!autoPrint || !usbDevice || isProcessing || isProcessingRef.current || !currentPrinterId) return;

    const pendingJobs = printJobs.filter((j) => {
      // Only pick jobs that are still pending. Processing/printing jobs are already claimed.
      if (normalizeQueueStatus(j.status) !== 'pending') return false;
      console.log('[AutoPrint] job check', { jobId: j.id, jobPrinterId: j.printerId, currentPrinterId, match: j.printerId === currentPrinterId });
      if (j.printerId !== currentPrinterId) return false;
      if (!selectedStation) return true;
      const selectedKey = normalizeStationKey(selectedStation);
      const jobStationKeys = getJobStationKeys(j);
      return jobStationKeys.includes(selectedKey);
    }).sort((a: PrintJob, b: PrintJob) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));

    if (pendingJobs.length > 0) {
      const processQueue = async () => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setIsProcessing(true);
        try {
          for (const job of pendingJobs) {
            try {
              await handlePrintJob(job);
            } catch (e) {
              if (isInvalidPrintQueueTransitionError(e)) {
                // Deze taak is waarschijnlijk al verwerkt door een andere actieve queue-processor.
                continue;
              }
              const message = e instanceof Error ? e.message : String(e);
              const lowerMessage = String(message || '').toLowerCase();
              const isUsbSessionIssue = /claim interface|claiminterface|usb|geen usb printer verbonden|access denied|toegang geweigerd|not allowed/.test(lowerMessage);

              if (isUsbSessionIssue) {
                // Houd auto-print aan, maar forceer reconnect van USB zodat de volgende run schoon start.
                setUsbDevice(null);
                if (isUsbDirectSupported()) {
                  setError(`Auto-print wacht op USB-herstel. Taak ${job.id} mislukt: ${message}`);
                } else {
                  setAutoPrint(false);
                  setError('Auto-print vereist een WebUSB-verbinding. Open de print wachtrij in Chrome op de factory PC.');
                }
                break;
              }

              // Voor niet-USB taakfouten blijven we de rest van de queue verwerken.
              setError(`Taak ${job.id} mislukt: ${message}`);
            }
          }
        } finally {
          setIsProcessing(false);
          isProcessingRef.current = false;
        }
      };
      processQueue();
    }
  }, [printJobs, autoPrint, usbDevice, isProcessing, selectedStation, printers, stationContext]);

  const filteredJobs = useMemo(() => {
    let jobs = printJobs;
    const matchedPrinter = resolveUsbBoundPrinter(printers, usbDevice, stationContext || undefined);
    const currentPrinterId = matchedPrinter?.id || null;

    if (viewMode === 'printer' && selectedOverviewPrinterId) {
      return jobs.filter((j) => j.printerId === selectedOverviewPrinterId);
    }

    // In stationweergave willen we alle jobs voor dat station zien, ongeacht printer-id.
    if (currentPrinterId && !selectedStation) {
      jobs = jobs.filter((j) => j.printerId === currentPrinterId);
    }
    
    // Filter op station als er een geselecteerd is
    if (selectedStation) {
      const selectedKey = normalizeStationKey(selectedStation);
      jobs = jobs.filter((j) => {
        const jobStationKeys = getJobStationKeys(j);
        return jobStationKeys.includes(selectedKey);
      });
    } else if (role !== 'admin') {
      // Standaard filter voor niet-admins
      const allowedPrinterIds = printers.map((p) => p.id);
      jobs = jobs.filter((job) => job.printerId ? allowedPrinterIds.includes(job.printerId) : false);
    }
    
    return jobs;
  }, [printJobs, printers, role, selectedStation, usbDevice, stationContext, viewMode, selectedOverviewPrinterId]);

  const stationContextPrinter = useMemo(() => {
    const boundPrinter = resolveUsbBoundPrinter(printers, usbDevice, stationContext || undefined);
    if (boundPrinter) return boundPrinter;

    return resolvePrinterForRouting(printers, {
      stationId: stationContext || undefined,
      routeKey: stationContext || undefined,
    });
  }, [printers, usbDevice, stationContext]);

  const activeQueuePrinter = useMemo(() => {
    const labelsQueuePrinter = getPreferredQueuePrinterForContext(printers, {
      stationId: stationContext || undefined,
      preferLabelsQueue: true,
    });
    if (labelsQueuePrinter) return labelsQueuePrinter;

    return stationContextPrinter;
  }, [printers, stationContext, stationContextPrinter]);

  const usbMatchesActiveQueuePrinter = useMemo(() => {
    if (!usbDevice || !activeQueuePrinter) return false;

    const activeVendor = parseUsbId(activeQueuePrinter.vendorId);
    const activeProduct = parseUsbId(activeQueuePrinter.productId);
    const activeHasUsbIdentity = activeVendor !== undefined && activeProduct !== undefined;

    if (!activeHasUsbIdentity) {
      return true;
    }

    return doesUsbDeviceMatchPrinter(usbDevice, activeQueuePrinter as Record<string, unknown>);
  }, [usbDevice, activeQueuePrinter]);

  const connectedConfiguredPrinter = useMemo(() => {
    if (!usbDevice) return null;

    const usbSerial = String(usbDevice.serialNumber || '').trim();
    if (usbSerial) {
      const serialMatch = printers.find((printer) => String((printer as AnyRecord).usbSerialNumber || '').trim() === usbSerial);
      if (serialMatch) return serialMatch;
    }

    const byVidPid = printers.filter(
      (printer) => Number(printer.vendorId) === usbDevice.vendorId && Number(printer.productId) === usbDevice.productId
    );

    return byVidPid.length === 1 ? byVidPid[0] : null;
  }, [usbDevice, printers]);

  const queuePrinterOnline = useMemo(() => {
    if (usbDevice) return usbMatchesActiveQueuePrinter;
    return isPrinterOnline(activeQueuePrinter as any);
  }, [usbDevice, usbMatchesActiveQueuePrinter, activeQueuePrinter]);

  const usbMismatchMessage = useMemo(() => {
    if (!usbDevice || !activeQueuePrinter) return '';
    if (usbMatchesActiveQueuePrinter) return '';

    const connectedName = String(connectedConfiguredPrinter?.name || usbDevice.productName || 'Onbekende USB printer');
    const expectedName = String(activeQueuePrinter.name || activeQueuePrinter.id || 'onbekende doelprinter');
    const connectedSerial = String(usbDevice.serialNumber || '').trim();
    const expectedSerial = String((activeQueuePrinter as AnyRecord)?.usbSerialNumber || '').trim();

    const connectedSuffix = connectedSerial ? ` (serial ${connectedSerial})` : '';
    const expectedSuffix = expectedSerial ? ` (verwacht serial ${expectedSerial})` : '';
    return `USB mismatch: verbonden met ${connectedName}${connectedSuffix}, maar station gebruikt ${expectedName}${expectedSuffix}.`;
  }, [usbDevice, activeQueuePrinter, usbMatchesActiveQueuePrinter, connectedConfiguredPrinter]);

  const stationGroups = useMemo(() => {
    const sourcePrinter = stationContextPrinter || activeQueuePrinter;
    if (!sourcePrinter) return [];
    const stations = Array.isArray(sourcePrinter.queueStations)
      ? sourcePrinter.queueStations
      : (sourcePrinter.linkedStations || []);
    const scopedStationKeys = new Set(allFactoryStations.map((station) => normalizeStationKey(station)));
    return Array.from(new Set(stations.map(stationNameFromValue).filter(Boolean)))
      .filter((station: unknown) => scopedStationKeys.size === 0 || scopedStationKeys.has(normalizeStationKey(station)))
      .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
  }, [stationContextPrinter, activeQueuePrinter, allFactoryStations]);

  useEffect(() => {
    if (!selectedStation) return;
    const exists = stationGroups.some((station) => normalizeStationKey(station) === normalizeStationKey(selectedStation));
    if (!exists) {
      setSelectedStation(null);
      setViewMode('overview');
    }
  }, [selectedStation, stationGroups]);

  const departmentGroups = useMemo<DepartmentGroup[]>(() => {
    const fromConfig = scopedFactoryDepartments
      .map((dept, idx) => {
        const stations = Array.from(new Set((Array.isArray(dept?.stations) ? dept.stations : [])
          .map(stationNameFromValue)
          .filter((name): name is string => Boolean(name))))
          .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
        if (stations.length === 0) return null;

        const key = String(dept?.id || dept?.slug || `dept-${idx}`) + `_${idx}`;
        const label = String(dept?.name || dept?.slug || dept?.id || `Afdeling ${idx + 1}`);
        return { key, label, stations } as DepartmentGroup;
      })
      .filter((group): group is DepartmentGroup => group !== null);

    if (fromConfig.length > 0) return fromConfig;

    return stationGroups.length > 0
      ? [{ key: 'all-stations', label: 'Alle stations', stations: stationGroups }]
      : [];
  }, [scopedFactoryDepartments, stationGroups]);

  const wizardStations = useMemo(() => {
    if (allFactoryStations.length > 0) return allFactoryStations;
    return stationGroups;
  }, [allFactoryStations, stationGroups]);

  const printerDpi = useMemo(() => {
    const parsed = parseInt(String((activeQueuePrinter as any)?.dpi ?? ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return resolvePrinterDpi(activeQueuePrinter as Record<string, unknown>, 203);
  }, [activeQueuePrinter]);

  const printerDarkness = useMemo(() => {
    const parsed = parseInt(String((activeQueuePrinter as any)?.darkness ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
  }, [activeQueuePrinter]);

  const printerZplTextFont = useMemo(() => {
    const raw = String((activeQueuePrinter as any)?.zplTextFont || '').trim().toUpperCase();
    return raw === 'A' ? 'A' : '0';
  }, [activeQueuePrinter]);

  const hasUsbIdentity = useCallback((printer: Partial<PrinterConfig> | null | undefined) => {
    return Number.isFinite(Number(printer?.vendorId)) && Number.isFinite(Number(printer?.productId));
  }, []);

  const resolvePrinterIdToPersistForUsb = useCallback((device: USBDevice | null | undefined): string => {
    if (!device) return '';

    const deviceSerial = String(device.serialNumber || '').trim();
    if (deviceSerial) {
      const serialMatch = printers.find((printer) => String((printer as AnyRecord).usbSerialNumber || '').trim() === deviceSerial);
      if (serialMatch?.id) return serialMatch.id;
    }

    const usbMatches = printers.filter(
      (printer) => Number(printer.vendorId) === device.vendorId && Number(printer.productId) === device.productId
    );
    if (usbMatches.length === 1) return usbMatches[0].id;

    const routingPrinter = resolvePrinterForRouting(printers, {
      stationId: stationContext || undefined,
      routeKey: stationContext || undefined,
    });

    return String(routingPrinter?.id || '');
  }, [printers, stationContext]);

  const ensureUsbDeviceForPrint = useCallback(async (expectedPrinter?: Partial<PrinterConfig> | null): Promise<USBDevice> => {
    const expected = expectedPrinter || activeQueuePrinter;
    const expectedHasUsbIdentity = hasUsbIdentity(expected);
    console.info('[PrintQueueAdminView] ensureUsbDeviceForPrint:start', {
      expectedPrinterId: String((expected as PrinterConfig | null)?.id || ''),
      expectedPrinterName: String((expected as PrinterConfig | null)?.name || ''),
      expectedVendorId: Number((expected as PrinterConfig | null)?.vendorId ?? NaN),
      expectedProductId: Number((expected as PrinterConfig | null)?.productId ?? NaN),
      hasExistingUsbDevice: Boolean(usbDevice),
      existingUsbVendorId: usbDevice?.vendorId,
      existingUsbProductId: usbDevice?.productId,
      stationContext,
    });

    if (usbDevice) {
      if (!expectedHasUsbIdentity || doesUsbDeviceMatchPrinter(usbDevice, expected || {})) {
        console.info('[PrintQueueAdminView] ensureUsbDeviceForPrint:reuse-existing-device', {
          vendorId: usbDevice.vendorId,
          productId: usbDevice.productId,
        });
        return usbDevice;
      }
    }

    const strictFilter = expectedHasUsbIdentity
      ? (expected as Record<string, unknown>)
      : {};

    const authorizedDevice = await resolveUsbDeviceForPrinter(strictFilter, usbDevice);
    if (authorizedDevice) {
      console.info('[PrintQueueAdminView] ensureUsbDeviceForPrint:authorized-device-found', {
        vendorId: authorizedDevice.vendorId,
        productId: authorizedDevice.productId,
      });
    }
    const device = authorizedDevice;
    if (!device) {
      throw new Error('Geen USB-printer beschikbaar voor deze printopdracht.');
    }
    console.info('[PrintQueueAdminView] ensureUsbDeviceForPrint:selected-device', {
      vendorId: device.vendorId,
      productId: device.productId,
      productName: String(device.productName || ''),
      manufacturerName: String((device as USBDevice & { manufacturerName?: string }).manufacturerName || ''),
    });

    if (expectedHasUsbIdentity && !doesUsbDeviceMatchPrinter(device, expected || {})) {
      const targetName = String((expected as PrinterConfig | null)?.name || (expected as PrinterConfig | null)?.id || 'doelprinter');
      throw new Error(`Geselecteerde USB-printer komt niet overeen met ${targetName}.`);
    }

    setUsbDevice(device);
    safeSetLocalStorage(USB_PRINTER_VENDOR_KEY, String(device.vendorId), {
      cleanupKeys: [USB_PRINTER_SERIAL_KEY, PRINT_STATION_BINDINGS_KEY],
    });
    safeSetLocalStorage(USB_PRINTER_PRODUCT_KEY, String(device.productId), {
      cleanupKeys: [USB_PRINTER_SERIAL_KEY, PRINT_STATION_BINDINGS_KEY],
    });
    safeSetLocalStorage(USB_PRINTER_SERIAL_KEY, safeStoredUsbSerial(device.serialNumber), {
      cleanupKeys: [PRINT_STATION_BINDINGS_KEY, USB_PRINTER_ID_KEY],
    });

    const printerIdToStore = resolvePrinterIdToPersistForUsb(device);
    if (printerIdToStore) {
      if (stationContext) {
        persistStationBinding(stationContext, printerIdToStore);
      } else {
        safeSetLocalStorage(USB_PRINTER_ID_KEY, printerIdToStore, {
          cleanupKeys: [USB_PRINTER_SERIAL_KEY, PRINT_STATION_BINDINGS_KEY],
        });
      }
    }

    if (!stationContext) {
      safeSetLocalStorage(USB_PRINTER_VENDOR_KEY, String(device.vendorId), {
        cleanupKeys: [USB_PRINTER_SERIAL_KEY, PRINT_STATION_BINDINGS_KEY],
      });
      safeSetLocalStorage(USB_PRINTER_PRODUCT_KEY, String(device.productId), {
        cleanupKeys: [USB_PRINTER_SERIAL_KEY, PRINT_STATION_BINDINGS_KEY],
      });
      safeSetLocalStorage(USB_PRINTER_SERIAL_KEY, safeStoredUsbSerial(device.serialNumber), {
        cleanupKeys: [PRINT_STATION_BINDINGS_KEY, USB_PRINTER_ID_KEY],
      });
    }

    return device;
  }, [usbDevice, hasUsbIdentity, activeQueuePrinter, resolvePrinterIdToPersistForUsb, stationContext, persistStationBinding]);

  const handleConnectUsb = async () => {
    setError('');
    try {
      const strictFilter = hasUsbIdentity(activeQueuePrinter)
        ? (activeQueuePrinter as Record<string, unknown>)
        : {};
      const device = await resolveUsbDeviceForPrinter(strictFilter, usbDevice);
      if (!device) {
        throw new Error('Geen USB-printer beschikbaar voor deze printopdracht.');
      }
      setUsbDevice(device);
      // Sla de printer op voor de volgende keer
      safeSetLocalStorage(USB_PRINTER_VENDOR_KEY, String(device.vendorId), {
        cleanupKeys: [USB_PRINTER_SERIAL_KEY, PRINT_STATION_BINDINGS_KEY],
      });
      safeSetLocalStorage(USB_PRINTER_PRODUCT_KEY, String(device.productId), {
        cleanupKeys: [USB_PRINTER_SERIAL_KEY, PRINT_STATION_BINDINGS_KEY],
      });
      safeSetLocalStorage(USB_PRINTER_SERIAL_KEY, safeStoredUsbSerial(device.serialNumber), {
        cleanupKeys: [PRINT_STATION_BINDINGS_KEY, USB_PRINTER_ID_KEY],
      });

      const routingPrinter = resolvePrinterForRouting(printers, {
        stationId: stationContext || undefined,
        routeKey: stationContext || undefined,
      });
      const printerIdToStore = resolvePrinterIdToPersistForUsb(device) || routingPrinter?.id || '';
      if (printerIdToStore) {
        if (stationContext) {
          persistStationBinding(stationContext, printerIdToStore);
        } else {
          safeSetLocalStorage(USB_PRINTER_ID_KEY, printerIdToStore, {
            cleanupKeys: [USB_PRINTER_SERIAL_KEY, PRINT_STATION_BINDINGS_KEY],
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDirectLotPrintBatch = async (batchData: string, lotCount: number, firstLot?: string) => {
    const chosenPrinter = await requestLabelsQueuePrinter('Lotnummers afdrukken');
    if (!chosenPrinter?.id) {
      throw new Error('Geen wachtrijprinter geconfigureerd.');
    }

    await queuePrintJob(
      chosenPrinter.id,
      batchData,
      {
        description: `Lotnummers batch (${lotCount})${firstLot ? ` - Start: ${firstLot}` : ''}`,
        quantity: 1,
        stationId: LABELS_PRINTING_QUEUE_STATION,
        targetPrinterName: chosenPrinter.name,
        queuedAsBatch: true,
        source: 'lot_number_batch',
        lotCount,
      }
    );

    setError('');
    notify(`Lotnummers in wachtrij gezet (${lotCount}) naar ${String(chosenPrinter.name || chosenPrinter.id)}.`);
  };

  const resolveTargetPrinterForJob = useCallback((job: PrintJob): PrinterConfig | null => {
    const explicitPrinterId = String(job?.printerId || '').trim();
    if (explicitPrinterId) {
      const explicitPrinter = printers.find((printer) => String(printer.id || '').trim() === explicitPrinterId);
      if (explicitPrinter) return explicitPrinter;
    }

    return activeQueuePrinter
      || resolvePrinterForRouting(printers, {
        stationId: stationContext || undefined,
        routeKey: stationContext || undefined,
      });
  }, [printers, activeQueuePrinter, stationContext]);

  const regenerateBitmapPayloadFromJob = useCallback(async (job: PrintJob, targetPrinter?: PrinterConfig | null): Promise<string | null> => {
    const templateId = String(job.metadata?.templateId || '').trim();
    const template = templateId ? labelTemplates.find((entry) => String(entry.id) === templateId) : null;
    const variables = job.metadata?.variables;
    const effectivePrinter = targetPrinter || activeQueuePrinter;

    if (!template || !variables || typeof variables !== 'object' || Array.isArray(variables)) {
      return null;
    }

    const widthMm = Number((template as any)?.width) || 90;
    const heightMm = Number((template as any)?.height) || 40;

    const effectiveDpi = resolvePrinterDpi(effectivePrinter as Record<string, unknown>, 203);
    const effectiveDarknessRaw = parseInt(String((effectivePrinter as PrinterConfig | null)?.darkness ?? ''), 10);
    const effectiveDarkness = Number.isFinite(effectiveDarknessRaw) && effectiveDarknessRaw > 0
      ? effectiveDarknessRaw
      : 15;

    return renderLabelForPrinter({
      printer: effectivePrinter as Record<string, unknown>,
      template: template as any,
      data: variables as AnyRecord,
      printerDpi: effectiveDpi,
      darkness: Math.max(15, Number(effectiveDarkness) || 15),
      printSpeed: 3,
      widthMm,
      heightMm,
    });
  }, [activeQueuePrinter, labelTemplates]);

  const handlePrintJob = async (job: PrintJob) => {
    const targetPrinter = resolveTargetPrinterForJob(job);
    if (!targetPrinter) throw new Error('Geen doelprinter gevonden voor deze taak.');

    console.info('[PrintQueueAdminView] handlePrintJob:start', {
      jobId: job.id,
      jobPrinterId: String(job?.printerId || ''),
      jobStationId: String(job?.stationId || ''),
      targetPrinterId: String(targetPrinter.id || ''),
      targetPrinterName: String(targetPrinter.name || ''),
      targetVendorId: Number(targetPrinter.vendorId ?? NaN),
      targetProductId: Number(targetPrinter.productId ?? NaN),
    });

    const deviceToUse = await ensureUsbDeviceForPrint(targetPrinter);
    if (!deviceToUse) throw new Error("Geen juiste USB printer verbonden voor deze taak.");

    console.info('[PrintQueueAdminView] handlePrintJob:resolved-device', {
      jobId: job.id,
      vendorId: deviceToUse.vendorId,
      productId: deviceToUse.productId,
      productName: String(deviceToUse.productName || ''),
      manufacturerName: String((deviceToUse as USBDevice & { manufacturerName?: string }).manufacturerName || ''),
    });

    const routingViolation = getPrinterRoutingViolation(job, targetPrinter);
    if (routingViolation) {
      try {
        await transitionPrintQueueJobStatus({
          jobId: job.id,
          status: 'error',
          error: routingViolation,
          source: 'PrintQueueAdminView',
        });
      } catch (transitionError) {
        if (!isInvalidPrintQueueTransitionError(transitionError)) {
          throw transitionError;
        }
      }
      throw new Error(routingViolation);
    }

    const liveStatusBeforeStart = await getLivePrintQueueJobStatus(job.id);
    if (liveStatusBeforeStart && !['pending', 'queued', 'processing'].includes(liveStatusBeforeStart)) {
      return;
    }

    try {
      await transitionPrintQueueJobStatus({
        jobId: job.id,
        status: 'printing',
        source: 'PrintQueueAdminView',
      });
    } catch (error) {
      if (isInvalidPrintQueueTransitionError(error)) {
        // Taak is intussen al door een andere client opgepakt of afgewerkt.
        return;
      }
      throw error;
    }
    try {
      const regeneratedContent = await regenerateBitmapPayloadFromJob(job, targetPrinter);
      const content = regeneratedContent || job.printData || job.zpl;
      if (!content) throw new Error("Geen printdata gevonden in job.");
      const quantity = getJobQuantity(job) || 1;
      const isPreBatchedJob = Boolean(job?.metadata?.queuedAsBatch) || isLikelyPreBatchedZpl(content);
      const batchSeqIndex = Number(job?.metadata?.batchSequenceIndex);
      const batchSeqTotal = Number(job?.metadata?.batchSequenceTotal);
      const hasBatchSequence = Number.isFinite(batchSeqIndex) && Number.isFinite(batchSeqTotal) && batchSeqTotal > 0;
      const shouldCutAtEnd = hasBatchSequence ? batchSeqIndex === batchSeqTotal : true;
      const basePayload = buildProtocolAwareUsbPayload({
        printer: targetPrinter as Record<string, unknown>,
        content,
        quantity,
        isPreBatchedJob,
      });
      const payload = enforceCutModeOnBatchPayload(basePayload, shouldCutAtEnd, isPreBatchedJob);

      console.info('[PrintQueueAdminView] handlePrintJob:usb-write', {
        jobId: job.id,
        payloadLength: payload.length,
        isPreBatchedJob,
        quantity,
      });
      await printRawUsb(deviceToUse, payload);
      await transitionPrintQueueJobStatus({
        jobId: job.id,
        status: 'completed',
        source: 'PrintQueueAdminView',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[PrintQueueAdminView] handlePrintJob:error', {
        jobId: job.id,
        targetPrinterId: String(targetPrinter.id || ''),
        message,
      });
      try {
        const liveStatus = await getLivePrintQueueJobStatus(job.id);
        if (liveStatus === 'completed' || liveStatus === 'cancelled') {
          throw e;
        }
        await transitionPrintQueueJobStatus({
          jobId: job.id,
          status: 'error',
          error: message,
          source: 'PrintQueueAdminView',
        });
      } catch (transitionError) {
        if (!isInvalidPrintQueueTransitionError(transitionError)) {
          throw transitionError;
        }
      }
      throw e;
    }
  };

  const handleReprint = async (jobId: string) => {
    const confirmed = await showConfirm({
      title: 'Taak opnieuw printen',
      message: 'Weet u zeker dat u deze taak opnieuw wilt printen?',
      confirmText: 'Opnieuw printen',
      cancelText: 'Annuleren',
      tone: 'warning',
    });
    if (!confirmed) return;
    await requeuePrintQueueJob({
      jobId,
      source: 'PrintQueueAdminView',
    });
  };

  const handleDelete = async (jobId: string) => {
    const confirmed = await showConfirm({
      title: 'Printtaak verwijderen',
      message: 'Weet u zeker dat u deze taak permanent wilt verwijderen?',
      confirmText: 'Verwijderen',
      cancelText: 'Annuleren',
      tone: 'danger',
    });
    if (!confirmed) return;
    await deletePrintQueueJob({
      jobId,
      source: 'PrintQueueAdminView',
    });
  };

  const getJobSizeLabel = (job: PrintJob): string | null => {
    const height = Number(job?.metadata?.height);
    if (!height) return null;
    return `${PREVIEW_ROLL_WIDTH_MM}x${height} mm`;
  };

  const getJobQuantity = (job: PrintJob): number | null => {
    const quantity = Number(job?.metadata?.quantity);
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
    const description = String(job?.metadata?.description || job?.description || '');
    const match = description.match(/\(x(\d+)\)/i);
    return match ? Number(match[1]) : null;
  };

  const handleSearchProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reprintSearch.trim()) return;
    
    setIsSearching(true);
    setReprintResult(null);
    setExactReprintJob(null);
    setError('');

    let searchStr = reprintSearch.trim().toUpperCase();
    if (searchStr.includes('/')) {
      searchStr = searchStr.split('/').filter(Boolean).pop() || searchStr;
    }

    const searchOptions = new Set<string>([searchStr]);
    const digitsMatch = searchStr.match(/\d+/);
    if (digitsMatch?.[0]) {
      const digits = digitsMatch[0];
      searchOptions.add(digits);
      if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
        searchOptions.add(`N${digits}`);
        searchOptions.add(`N20${digits}`);
        searchOptions.add(`N200${digits}`);
        searchOptions.add(`N21${digits}`);
        searchOptions.add(`N210${digits}`);
        searchOptions.add(`P${digits}`);
      }
    }

    const optionList = Array.from(searchOptions).slice(0, 10);

    const searchCollectionByFields = async (colRef: import("firebase/firestore").CollectionReference | import("firebase/firestore").Query, fields: string[]) => {
      for (const field of fields) {
        try {
          const snap = await getDocs(query(colRef, where(field, 'in', optionList), limit(1)));
          if (!snap.empty) {
            const row = snap.docs[0].data() as Record<string, unknown>;
            return { id: snap.docs[0].id, ...row } as AnyRecord;
          }
        } catch {
          // best-effort query, probeer volgende veld
        }
      }
      return null;
    };

    try {
      let foundDoc: AnyRecord | null = null;

      // 1. Actieve productie (Lotnummer)
      try {
        const trackingRef = collection(db, getPathString(PATHS.TRACKING));
        const match = await searchCollectionByFields(trackingRef, [
          'lotNumber',
          'orderId',
          'orderNumber',
          'Order',
          'originalOrderId',
          'itemCode',
          'productCode',
        ]);
        if (match) {
          foundDoc = { ...match, source: 'active' };
        } else {
          // Zoek ook in scoped items (collectionGroup)
          const itemsQueries = [
            getDocs(query(collectionGroup(db, 'items'), where('lotNumber', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'items'), where('orderId', 'in', optionList), limit(1)))
          ];
          const itemSnaps = await Promise.all(itemsQueries.map(p => p.catch(() => null)));
          for (const snap of itemSnaps) {
            if (snap && !snap.empty) {
              foundDoc = { id: snap.docs[0].id, ...snap.docs[0].data(), source: 'active_scoped' };
              break;
            }
          }
        }
      } catch (e) { console.warn(e); }

      // 2. Archief (Lotnummer / order) - meerdere jaren
      if (!foundDoc) {
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= currentYear - 4; year--) {
          try {
            const archiveRef = collection(db, getPathString(getArchiveItemsPath(year)));
            const match = await searchCollectionByFields(archiveRef, [
              'lotNumber',
              'orderId',
              'orderNumber',
              'Order',
              'originalOrderId',
              'itemCode',
              'productCode',
            ]);
            if (match) {
              foundDoc = { ...match, source: 'archive' };
              break;
            }
          } catch (e) {
            console.warn(e);
          }
        }
      }

      // 3. Fallback: Zoek in orders via collectionGroup
      if (!foundDoc) {
        try {
          const orderQueries = [
            getDocs(query(collectionGroup(db, 'orders'), where('orderId', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('orderNumber', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('Order', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('originalOrderId', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('itemCode', 'in', optionList), limit(1)))
          ];
          const snaps = await Promise.all(orderQueries.map(p => p.catch(() => null)));
          for (const snap of snaps) {
            if (snap && !snap.empty) {
              foundDoc = { id: snap.docs[0].id, ...snap.docs[0].data(), source: 'orders' };
              break;
            }
          }
        } catch (e) { console.warn(e); }
      }

      // 4. Fallback: Direct Document ID Lookup (Legacy BH18)
      if (!foundDoc) {
        const targetedPaths = [
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
          getPathString(PATHS.TEMP_PLANNING),
          getPathString(PATHS.PLANNING)
        ];
        for (const path of targetedPaths) {
          for (const option of optionList) {
            try {
              const docRef = doc(db, path, option);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                foundDoc = { id: docSnap.id, ...docSnap.data(), source: 'legacy_path' };
                break;
              }
            } catch (e) {
              console.warn(e);
            }
          }
          if (foundDoc) break;
        }
      }

      if (foundDoc) {
        setReprintResult(foundDoc);

        const lotCandidates = new Set<string>(
          [
            String((foundDoc as AnyRecord)?.lotNumber || ''),
            ...optionList,
          ]
            .map((v) => String(v || '').trim().toUpperCase())
            .filter(Boolean)
        );

        const orderCandidates = new Set<string>(
          [
            getOrderLabelOrder(foundDoc),
            String((foundDoc as AnyRecord)?.orderId || ''),
            String((foundDoc as AnyRecord)?.orderNumber || ''),
            String((foundDoc as AnyRecord)?.Order || ''),
            String((foundDoc as AnyRecord)?.originalOrderId || ''),
            ...optionList,
          ]
            .map((v) => String(v || '').trim().toUpperCase())
            .filter(Boolean)
        );

        const matchedQueueJob = [...printJobs]
          .filter((job) => {
            const content = String(job?.zpl || job?.printData || job?.labelZPL || '').trim();
            if (!content) return false;

            const metadata = (job?.metadata || {}) as AnyRecord;
            const lot = String(metadata?.lotNumber || '').trim().toUpperCase();
            const orderId = String(metadata?.orderId || '').trim().toUpperCase();
            const orderNumber = String(metadata?.orderNumber || '').trim().toUpperCase();
            const originalOrderId = String(metadata?.originalOrderId || '').trim().toUpperCase();
            const description = String(metadata?.description || job?.description || '').toUpperCase();

            if (lot && lotCandidates.has(lot)) return true;
            if (orderId && orderCandidates.has(orderId)) return true;
            if (orderNumber && orderCandidates.has(orderNumber)) return true;
            if (originalOrderId && orderCandidates.has(originalOrderId)) return true;

            return Array.from(new Set([...Array.from(lotCandidates), ...Array.from(orderCandidates)]))
              .filter((token) => token.length >= 4)
              .some((token) => description.includes(token));
          })
          .sort((a: PrintJob, b: PrintJob) => getTimestampMillis(b?.createdAt) - getTimestampMillis(a?.createdAt))[0] || null;

        setExactReprintJob(matchedQueueJob);

        if (!matchedQueueJob) {
          setError('Product gevonden, maar geen eerdere queue-job met exacte printdata gevonden.');
        }
      } else {
        setError(`Order of Lotnummer '${searchStr}' niet gevonden.`);
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError("Fout bij zoeken: " + message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleReprintLabel = async () => {
    const deviceToUse = await ensureUsbDeviceForPrint();

    if (!reprintResult || !deviceToUse) {
      setError('Geen product gevonden of geen printer verbonden.');
      return;
    }

    if (!exactReprintJob) {
      setError('Geen eerdere queue-job met exacte printdata gevonden voor dit product.');
      return;
    }

    setIsProcessing(true);
    try {
      const basePayload = String(exactReprintJob.zpl || exactReprintJob.printData || exactReprintJob.labelZPL || '').trim();
      if (!basePayload) {
        throw new Error('De gevonden queue-job bevat geen printdata.');
      }

      const quantity = getJobQuantity(exactReprintJob) || 1;
      const payload = buildProtocolAwareUsbPayload({
        printer: activeQueuePrinter as Record<string, unknown>,
        content: basePayload,
        quantity,
      });

      setUsbDevice(deviceToUse);
      await printRawUsb(deviceToUse, payload);
      setReprintSearch('');
      setReprintResult(null);
      setExactReprintJob(null);
      notify(`Exacte kopie geprint (x${quantity}).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError('Print fout: ' + message);
    } finally {
      setIsProcessing(false);
    }
  };


  return {
    canManage,
    canQueueReprint,
    printJobs,
    loading,
    printers,
    usbDevice,
    usbDeviceRef,
    autoPrint,
    isProcessing,
    isProcessingRef,
    error,
    showTempModal,
    showLotModal,
    viewMode,
    selectedOverviewPrinterId,
    selectedStation,
    reprintSearch,
    reprintResult,
    exactReprintJob,
    isSearching,
    previewJob,
    previewSize,
    previewSizeLabel,
    factoryConfig,
    bindingStation,
    stationBindings,
    isLabelsPrinterPickerOpen,
    labelsPrinterPickerReason,
    labelsPrinterPickerSelectionId,
    labelsPrinterPickerResolveRef,
    userDepartmentKeys,
    scopedFactoryDepartments,
    allFactoryStations,
    stationContext,
    wizardStationContext,
    persistStationBinding,
    handleSaveStationBinding,
    activeStationBindingPrinterName,
    preferredLabelQueuePrinter,
    labelsQueuePrinters,
    selectedLabelsQueuePrinter,
    requestLabelsQueuePrinter,
    closeLabelsPrinterPicker,
    activeTilePrinterContext,
    filteredJobs,
    stationContextPrinter,
    activeQueuePrinter,
    usbMatchesActiveQueuePrinter,
    connectedConfiguredPrinter,
    queuePrinterOnline,
    usbMismatchMessage,
    stationGroups,
    departmentGroups,
    wizardStations,
    printerDpi,
    printerDarkness,
    printerZplTextFont,
    hasUsbIdentity,
    resolvePrinterIdToPersistForUsb,
    ensureUsbDeviceForPrint,
    handleConnectUsb,
    handleDirectLotPrintBatch,
    resolveTargetPrinterForJob,
    regenerateBitmapPayloadFromJob,
    handlePrintJob,
    handleReprint,
    handleDelete,
    getJobSizeLabel,
    getJobQuantity,
    handleSearchProduct,
    handleReprintLabel,
    setPrintJobs,
    setLoading,
    setPrinters,
    setUsbDevice,
    setAutoPrint,
    setIsProcessing,
    setError,
    setShowTempModal,
    setShowLotModal,
    setViewMode,
    setSelectedOverviewPrinterId,
    setSelectedStation,
    setReprintSearch,
    setReprintResult,
    setExactReprintJob,
    setIsSearching,
    setPreviewJob,
    setPreviewSize,
    setPreviewSizeLabel,
    setFactoryConfig,
    setBindingStation,
    setStationBindings,
    setIsLabelsPrinterPickerOpen,
    setLabelsPrinterPickerReason,
    setLabelsPrinterPickerSelectionId,
    labelTemplates,
    labelRules
  };
};
export type PrintQueueAdminState = ReturnType<typeof usePrintQueueAdmin>;
