
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { jsPDF } from "jspdf";
import * as QRCode from "qrcode";
import { 
  Printer, 
  Plus, 
  Trash2, 
  Save, 
  Play,
  X,
  MapPin,
  Edit,
  Usb,
  List,
  Server,
  QrCode,
  Hash,
  Tag,
  Search,
  Crosshair,
  Loader2,
  Activity,
  CheckCircle,
  AlertCircle,
  WifiOff,
  PauseCircle,
} from "lucide-react";
import { 
  collection, 
  collectionGroup,
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  setDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  documentId,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { getDriver, applyCalibration, PRINTER_DRIVERS } from "../../utils/printerDrivers";
import { queuePrintJob } from "../../services/planningSecurityService";
import { generatePrintData, generateLotBatchZPL } from "../../utils/zplHelper";
import {
  processLabelData,
  resolveLabelContent,
  applyLabelLogic,
  filterTempOrderLabelsByProduct,
} from "../../utils/labelHelpers";
import PrintQueueAdminView from "../printer/PrintQueueAdminView";
import AutoScaledLabelPreview from "../printer/AutoScaledLabelPreview";
import InternalQrImage from "../../utils/InternalQrImage";
import { useNotifications } from "../../contexts/NotificationContext";
import { logComplianceEvent } from "../../services/complianceAudit";
import { useLabelCatalog } from "../../hooks/useLabelCatalog";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { serializeRoutingKeys } from "../../utils/printRouting";
import { renderLabelToBitmapZpl } from "../../utils/zebraLabelRenderEngine";
import { normalizePrinterProtocol, renderLabelForPrinter } from "../../utils/printerProtocolService";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { isUsbDirectSupported, requestUsbDevice, printRawUsb, printBinaryUsbToDevice, resolveUsbDeviceForPrinter } from "../../utils/usbPrintService";
import { buildTsplUsbPayload, renderLabelToBitmapTspl } from "../../utils/tsplPrintService";
import { executeOrderLabelSearch, loadFactoryMachinePaths, normalizeText } from "../../utils/orderLabelSearch";
import {
  buildOrderLabelPreviewData,
  buildOrderLabelTemplateProduct,
} from "../../utils/orderLabelTemplateUtils";
import { isPrinterOnline } from "../../utils/printerStatus";
import { loadPrinterStatusHistory, type PrinterStatusRecord } from "../../utils/printerStatus";
import { queryAndSavePrinterStatusUsb } from "../../utils/usbPrintService";
import { resolvePreferredQueueDepartment } from "../../utils/printerQueueStationUtils";


import { buildCalibrationCrossZpl, buildLabelaryPreviewUrl, CONNECTION_TYPES, DEFAULT_PRINTER_FORM, getIsoWeekAndYear, getMachineCode, normalizeProtocol, normalizeRollType, normalizeUsbSerial, normalizeZplTextFont, parseMm, PRINT_SETTINGS_KEY, PRINTER_PROTOCOLS, resolveRollWidthMm, PrinterRecord, PrinterFormData, TempOrderRecord, PrinterProtocol, PrinterConnectionType, getErrMsg, colPath, docPath, MAX_USB_ID, timestampToMillis, LabelTemplate, resolveStableUsbSerial, parseUsbId, normalizePrinterType } from './adminPrinterHelpers';

export const useAdminPrinterManager = ({ onNavigate }: { onNavigate?: (screen: string | null) => void }) => {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo, showConfirm } = useNotifications();
  const [activeTab, setActiveTab] = useState<"config" | "queue-stations" | "queue" | "status-history">("config"); // 'config' | 'queue-stations' | 'queue' | 'status-history'
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [availableStations, setAvailableStations] = useState<string[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [departmentStations, setDepartmentStations] = useState<Record<string, string[]>>({});
  const [selectedQueuePrinterId, setSelectedQueuePrinterId] = useState("");
  const [selectedQueueDepartment, setSelectedQueueDepartment] = useState("");
  const [queueStations, setQueueStations] = useState<string[]>([]);
  const [queueStationToAdd, setQueueStationToAdd] = useState("");
  const [isSavingQueueStations, setIsSavingQueueStations] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [showTempModal, setShowTempModal] = useState(false);
  const [showTestMenu, setShowTestMenu] = useState<string | null>(null);
  const [calibrationPrinter, setCalibrationPrinter] = useState<PrinterRecord | null>(null);
  const [tsplDiagPrinter, setTsplDiagPrinter] = useState<PrinterRecord | null>(null);
  const [tsplDiagCommands, setTsplDiagCommands] = useState('SIZE 90 mm,40 mm\r\nGAP 2 mm,0 mm\r\nDENSITY 8\r\nSPEED 4\r\nCLS\r\nTEXT 20,20,"ARIAL.TTF",0,20,20,"TSPL TEST"\r\nPRINT 1,1');
  const [tsplDiagStatus, setTsplDiagStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const { labelTemplates, labelRules: labelLogicRules } = useLabelCatalog();
  const [windowsHostMode, setWindowsHostMode] = useState(false);
  const [savingWindowsHostMode, setSavingWindowsHostMode] = useState(false);

  // Printer status state
  const [printerStatusHistory, setPrinterStatusHistory] = useState<PrinterStatusRecord[]>([]);
  const [loadingStatusHistory, setLoadingStatusHistory] = useState(false);
  const [manualStatusResult, setManualStatusResult] = useState<PrinterStatusRecord | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  
  // Form state
  const [formData, setFormData, clearPersistedPrinterForm] = useFormPersistence<PrinterFormData>(
    "admin_printer_manager_form",
    DEFAULT_PRINTER_FORM
  );

  // Fetch printers
  useEffect(() => {
    const unsub = onSnapshot(colPath(PATHS.PRINTERS), (snap) => {
      const list: PrinterRecord[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) } as PrinterRecord));
      setPrinters(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (selectedQueuePrinterId && !printers.some((printer) => printer.id === selectedQueuePrinterId)) {
      setSelectedQueuePrinterId("");
    }
  }, [printers, selectedQueuePrinterId]);

  useEffect(() => {
    if (!selectedQueuePrinterId) {
      setQueueStations([]);
      return;
    }

    const selectedPrinter = printers.find((p) => p.id === selectedQueuePrinterId);
    if (!selectedPrinter) {
      setQueueStations([]);
      return;
    }

    const stations = Array.isArray(selectedPrinter.queueStations)
      ? selectedPrinter.queueStations
      : (selectedPrinter.linkedStations || []);
    setQueueStations(Array.from(new Set(stations)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  }, [printers, selectedQueuePrinterId]);

  // Fetch stations uit factory config
  useEffect(() => {
    const unsub = onSnapshot(docPath(PATHS.FACTORY_CONFIG), (snap) => {
      if (!snap.exists()) {
        setAvailableStations([]);
        setAvailableDepartments([]);
        setDepartmentStations({});
        return;
      }

      const data = (snap.data() || {}) as { departments?: Array<{ name?: string, stations?: Array<{ name?: string, isAvailableForPlanning?: boolean }> }> };
      const stations: string[] = [];
      const depts: string[] = [];
      const deptStationsMap: Record<string, string[]> = {};
      
      (data.departments || []).forEach((dept) => {
        const deptName = String(dept?.name || "").trim();
        if (deptName) {
          depts.push(deptName);
          const deptStations = (dept.stations || [])
            .map((s) => String(s?.name || "").trim())
            .filter(Boolean);
          if (deptStations.length > 0) {
            deptStationsMap[deptName] = Array.from(new Set(deptStations));
          }
        }

        (dept.stations || []).forEach((s) => {
          const name = String(s?.name || "").trim();
          if (name) stations.push(name);
        });
      });

      setAvailableStations(Array.from(new Set(stations)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      setAvailableDepartments(Array.from(new Set(depts)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      setDepartmentStations(deptStationsMap);
    }, (e) => {
      console.error("Err stations", e);
    });

    return () => unsub();
  }, []);

  // Centrale printmodus instelling (AAN/UIT) voor tijdelijke Windows print-host flow
  useEffect(() => {
    const unsub = onSnapshot(docPath(PATHS.GENERAL_SETTINGS), (snap) => {
      const data = (snap.data() || {}) as Record<string, unknown>;
      const cfg = (data?.[PRINT_SETTINGS_KEY] || {}) as { windowsHostModeEnabled?: boolean };
      setWindowsHostMode(Boolean(cfg.windowsHostModeEnabled));
    }, (err) => {
      console.error('Windows host mode listen error:', err);
    });

    return () => unsub();
  }, []);

  const handleToggleWindowsHostMode = async () => {
    const next = !windowsHostMode;
    setSavingWindowsHostMode(true);
    try {
      await setDoc(docPath(PATHS.GENERAL_SETTINGS), {
        [PRINT_SETTINGS_KEY]: {
          windowsHostModeEnabled: next,
          updatedAt: serverTimestamp(),
          updatedBy: {
            uid: auth.currentUser?.uid || null,
            email: auth.currentUser?.email || null,
          },
        },
      }, { merge: true });

      await logActivity(
        auth.currentUser?.uid || "system",
        'SETTINGS_UPDATE',
        `Windows Print Host Mode ${next ? 'enabled' : 'disabled'}`
      );

      setWindowsHostMode(next);
      showSuccess(`Windows Print Host modus ${next ? 'AAN' : 'UIT'} gezet.`);
    } catch (err: unknown) {
      console.error('Toggle windows host mode error:', err);
      showError('Opslaan van Windows Print Host modus mislukt: ' + getErrMsg(err));
    } finally {
      setSavingWindowsHostMode(false);
    }
  };

  const saveQueueStations = async (nextStations: string[]) => {
    if (!selectedQueuePrinterId) {
      showError("Kies eerst een printer.");
      return;
    }
    setIsSavingQueueStations(true);
    try {
      await updateDoc(docPath(PATHS.PRINTERS, selectedQueuePrinterId), {
        queueStations: nextStations,
        updatedAt: serverTimestamp(),
      });
      await logActivity(auth.currentUser?.uid || "system", "SETTINGS_UPDATE", `Queue stations updated for printer ${selectedQueuePrinterId} (${nextStations.length})`);
    } catch (err: unknown) {
      console.error("Queue stations save error:", err);
      showError("Opslaan queue stations mislukt: " + getErrMsg(err));
    } finally {
      setIsSavingQueueStations(false);
    }
  };

  const handleAddQueueStation = async () => {
    const station = queueStationToAdd.trim();
    if (!station) return;
    // Stations mogen printer-afdeling overstijgen (bijv. Labels Printing op meerdere printers).
    const selectableStations = availableStations;
    if (!selectableStations.includes(station)) return;
    if (queueStations.includes(station)) {
      setQueueStationToAdd("");
      return;
    }
    const next = [...queueStations, station].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    setQueueStations(next);
    setQueueStationToAdd("");
    await saveQueueStations(next);
  };

  const handleRemoveQueueStation = async (station: string) => {
    const next = queueStations.filter((s) => s !== station);
    setQueueStations(next);
    await saveQueueStations(next);
  };

  // Network status checks removed as we focus on USB/Queue

  const handleSave = async () => {
    if (!formData.name) return showError(t('adminPrinterManager.nameRequired'));
    if (normalizePrinterType(formData.type) === CONNECTION_TYPES.NETWORK && !String(formData.ip || '').trim()) {
      return showError('IP adres is verplicht voor netwerkprinters.');
    }

    const parsedVendorId = parseUsbId(formData.vendorId);
    const parsedProductId = parseUsbId(formData.productId);
    const hasVendorInput = formData.vendorId !== null && formData.vendorId !== undefined && String(formData.vendorId).trim() !== '';
    const hasProductInput = formData.productId !== null && formData.productId !== undefined && String(formData.productId).trim() !== '';

    if (normalizePrinterType(formData.type) === CONNECTION_TYPES.WEBUSB) {
      if (hasVendorInput && parsedVendorId === undefined) {
        return showError('USB Vendor ID is ongeldig. Koppel de printer opnieuw.');
      }
      if (hasProductInput && parsedProductId === undefined) {
        return showError('USB Product ID is ongeldig. Koppel de printer opnieuw.');
      }
    }

    try {
      const normalizedRollWidth = String(Math.max(20, resolveRollWidthMm(formData)));
      const parsedSpeed = parseInt(formData.speed, 10);
      const normalizedSpeed = String(Number.isFinite(parsedSpeed) ? Math.min(14, Math.max(1, parsedSpeed)) : 3);
      const payload = {
        ...formData,
        rollWidthMm: normalizedRollWidth,
        speed: normalizedSpeed,
        rollType: normalizeRollType(formData.rollType),
        zplTextFont: normalizeZplTextFont(formData.zplTextFont),
        routingKeys: serializeRoutingKeys(formData.routingKeysText),
        department: formData.department || "",
        locationLabel: formData.locationLabel || "",
        vendorId: parsedVendorId ?? null,
        productId: parsedProductId ?? null,
        usbSerialNumber: normalizeUsbSerial(formData.usbSerialNumber),
        // Legacy compat: bestaand veld blijft gevuld voor oude flows.
        width: normalizedRollWidth,
      };

      if (editingId) {
        await updateDoc(docPath(PATHS.PRINTERS, editingId), {
          ...payload,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(colPath(PATHS.PRINTERS), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      await logActivity(auth.currentUser?.uid || "system", "SETTINGS_UPDATE", `Printer saved: ${formData.name}`);

      setIsAdding(false);
      setEditingId(null);
      clearPersistedPrinterForm();
      setFormData(DEFAULT_PRINTER_FORM);
    } catch (err: unknown) {
      console.error("Error saving printer:", err);
      showError(t('adminPrinterManager.saveError') + getErrMsg(err));
    }
  };

  const getQueueMetadataBase = (printer: PrinterRecord) => {
    const queueStations = Array.isArray(printer?.queueStations) ? printer.queueStations : [];
    const linkedStations = Array.isArray(printer?.linkedStations) ? printer.linkedStations : [];
    const stationCandidate = [...queueStations, ...linkedStations]
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const maybe = entry as Record<string, unknown>;
          return String(maybe.name || maybe.station || maybe.id || maybe.code || '').trim();
        }
        return '';
      })
      .find(Boolean);

    return {
      source: 'admin-printer-manager',
      targetPrinterName: printer?.name || 'Onbekende printer',
      protocol: normalizePrinterProtocol(printer).toLowerCase(),
      // Belangrijk: gebruik een station dat binnen de printerroutering valt,
      // anders wordt de queue-job door de auto-processor overgeslagen.
      stationId: stationCandidate || 'LABELS PRINTING'
    };
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm({
      title: t('adminPrinterManager.deletePrinterTitle', 'Printer verwijderen'),
      message: t('adminPrinterManager.confirmDeletePrinter'),
      confirmText: t('common.delete', 'Verwijderen'),
      cancelText: t('common.cancel', 'Annuleren'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDoc(docPath(PATHS.PRINTERS, id));
      await logActivity(auth.currentUser?.uid || "system", "SETTINGS_UPDATE", `Printer deleted: ${id}`);
    } catch (err: unknown) {
      console.error("Error deleting:", err);
    }
  };

  const handleApplyCalibration = async (printer: PrinterRecord, payload: { calibrationOffsetXMm: number; calibrationOffsetYMm: number }) => {
    if (!printer?.id) return;
    try {
      await updateDoc(docPath(PATHS.PRINTERS, printer.id), {
        calibrationOffsetXMm: String(payload.calibrationOffsetXMm ?? 0),
        calibrationOffsetYMm: String(payload.calibrationOffsetYMm ?? 0),
        updatedAt: serverTimestamp(),
      });
      await logActivity(auth.currentUser?.uid || "system", "SETTINGS_UPDATE", `Printer calibration updated: ${printer.name}`);
      await logComplianceEvent(auth.currentUser?.uid || "system", "CALIBRATION_CHANGE", {
        printerName: printer.name,
        calibrationOffsetXMm: payload.calibrationOffsetXMm,
        calibrationOffsetYMm: payload.calibrationOffsetYMm,
      });
      showSuccess(`Calibratie opgeslagen voor ${printer.name}.`);
      setCalibrationPrinter(null);
      setShowTestMenu(null);
    } catch (err: unknown) {
      console.error("Calibration save error:", err);
      showError("Calibratie opslaan mislukt: " + getErrMsg(err));
    }
  };

  const handleCalibrationPrint = async (printer: PrinterRecord, { labelHeightMm }: { labelHeightMm: number }) => {
    if (!printer) return;
    try {
      const rollWidthMm = resolveRollWidthMm(printer);
      const zpl = buildCalibrationCrossZpl({ printer, labelWidthMm: rollWidthMm, labelHeightMm });
      const result = await sendPrintJob(printer, zpl, {
        description: `Calibratieprint ${rollWidthMm}x${labelHeightMm}mm`,
        width: rollWidthMm,
        height: labelHeightMm
      }, { allowQueueFallback: true });
      showSuccess(
        result.mode === 'queue'
          ? `Calibratieprint in wachtrij gezet voor ${printer.name}.`
          : `Calibratieprint ${rollWidthMm}x${labelHeightMm}mm verzonden naar ${printer.name}.`
      );
      setCalibrationPrinter(null);
      setShowTestMenu(null);
    } catch (err: unknown) {
      showError("Calibratie print mislukt: " + getErrMsg(err));
    }
  };

  // Print dispatch: WebUSB direct voor webusb-printers, anders via wachtrij.
  const sendPrintJob = async (
    printerData: PrinterRecord,
    printContent: string,
    metadata: Record<string, unknown> = {},
    options: { allowQueueFallback?: boolean } = {}
  ): Promise<{ mode: "webusb" | "queue" }> => {
    const { allowQueueFallback = true } = options;
    const printerType = normalizePrinterType(printerData?.type);

    if (printerType === CONNECTION_TYPES.WEBUSB) {
      if (!isUsbDirectSupported()) {
        if (allowQueueFallback && printerData?.id) {
          await queuePrintJob(printerData.id, printContent, {
            ...getQueueMetadataBase(printerData),
            ...metadata,
            fallbackReason: 'webusb-not-supported'
          });
          return { mode: 'queue' };
        }
        throw new Error('WebUSB wordt niet ondersteund in deze browser.');
      }

      try {
        await printRawUsb({ content: printContent, printer: printerData || {} });
        return { mode: 'webusb' };
      } catch (err: unknown) {
        const e = err as { message?: string; name?: string };
        const message = String(e?.message || "");
        const isDeviceSelectionCanceled = e?.name === 'NotFoundError' || /no device selected|geen usb-printer geselecteerd|geen apparaat geselecteerd/i.test(message);
        const isAccessIssue = e?.name === 'SecurityError' || /access denied|permission|toegang/i.test(message);
        const isClaimIssue = /claiminterface|claim interface|unable to claim/i.test(message);

        if (isDeviceSelectionCanceled) {
          throw new Error("Geen USB-printer geselecteerd. Kies een printer in de browser-popup om te printen.", { cause: err });
        }

        console.error("USB print error:", err);

        // Robuuste fallback: alle niet-geannuleerde WebUSB-fouten mogen naar queue,
        // zodat testlabels niet blokkeren op browser USB state.
        if (allowQueueFallback && printerData?.id) {
          const fallbackReason = isClaimIssue
            ? 'webusb-claim-interface'
            : isAccessIssue
              ? 'webusb-access'
              : 'webusb-error';

          try {
            await queuePrintJob(printerData.id, printContent, {
              ...getQueueMetadataBase(printerData),
              ...metadata,
              fallbackReason,
            });
            return { mode: 'queue' };
          } catch (queueErr: unknown) {
            const queueMsg = getErrMsg(queueErr);
            throw new Error(`USB print mislukt en fallback naar wachtrij faalde: ${queueMsg}`, { cause: queueErr });
          }
        }

        if (!allowQueueFallback && (isAccessIssue || isClaimIssue)) {
          throw new Error(
            "Directe testprint mislukt: USB-interface is bezet of toegang geweigerd. Sluit andere USB-sessies en probeer opnieuw (zonder wachtrij-fallback).",
            { cause: err }
          );
        }

        if (isAccessIssue) {
          throw new Error(
            "USB toegang geweigerd. Controleer browserrechten en of de printer door een ander systeemproces/driver is bezet. " +
            "Op Windows kan dit door de systeemdriver komen; op Chromebook vaak door geweigerde USB-permissie of een bezette interface.",
            { cause: err }
          );
        }
        throw new Error(`USB print mislukt: ${message || 'onbekende fout'}`, { cause: err });
      }
    }

    if (!allowQueueFallback) {
      throw new Error('Deze test gebruikt alleen directe USB-print en mag niet naar de wachtrij. Kies een WebUSB-printer.');
    }

    if (!printerData?.id) {
      throw new Error('Geen geldige printer-ID voor wachtrijprint.');
    }

    await queuePrintJob(printerData.id, printContent, {
      ...getQueueMetadataBase(printerData),
      ...metadata
    });
    return { mode: 'queue' };
  };

  const handleBulkLotPrint = async (config: { printerId: string; station: string; year: string; week: string; count: number; startSeq: number; mode: "sequential" | "identical" }) => {
    const printer = printers.find((p) => p.id === config.printerId);
    if (!printer) return showError("Selecteer een printer.");

    const yy = config.year.replace(/\D/g, '').slice(-2).padStart(2, '0');
    const ww = config.week.replace(/\D/g, '').padStart(2, '0');
    const machineCode = getMachineCode(config.station);
    const baseLot = `40${yy}${ww}${machineCode}40`;

    const driver = getDriver(printer);
    const darkness = printer.darkness ? parseInt(printer.darkness) : driver.defaultDarkness;
    const rollWidthMm = resolveRollWidthMm(printer);

    const lots = [];
    for (let i = 0; i < config.count; i++) {
      const seqNum = config.mode === 'sequential' ? config.startSeq + i : config.startSeq;
      lots.push(`${baseLot}${String(seqNum).padStart(4, '0')}`);
    }

    const batchData = generateLotBatchZPL({
      lots,
      printerDpi: driver.nativeDpi || 203,
      darkness: darkness,
      labelWidthMm: rollWidthMm || 90,
    });

    try {
      const result = await sendPrintJob(printer, batchData, {
        description: `Lotnummers batch (${config.count})`,
        quantity: 1,
        stationId: config.station,
        targetPrinterName: printer.name,
        queuedAsBatch: true,
        source: 'lot_number_batch',
        lotCount: config.count,
      });

      showSuccess(
        result.mode === 'queue'
          ? `Batch van ${config.count} lotnummers in wachtrij gezet voor ${printer.name}.`
          : `Batch van ${config.count} lotnummers afgedrukt via USB.`
      );
      setShowLotModal(false);
    } catch (err: unknown) {
      showError("Fout bij afdrukken lotnummers: " + getErrMsg(err));
    }
  };

  const handleTempLegacyPrint = async (orderData: TempOrderRecord, targetPrinterId: string, templateId?: string) => {
    const printer = printers.find((p) => p.id === targetPrinterId);
    if (!printer) return showError("Printer niet gevonden.");
    
    const driver = getDriver(printer);
    const darkness = printer.darkness ? parseInt(printer.darkness) : driver.defaultDarkness;
    const printSpeed = printer.speed ? parseInt(printer.speed, 10) : driver.defaultSpeed;
    const dotsPerMm = driver.dotsPerMm;
    
    const order = orderData.orderId || orderData.Order || orderData.Productieorder || orderData.order || orderData.id || "ONBEKEND";
    const item = orderData.itemCode || orderData.Item || orderData.Artikel || orderData.item || "";
    const desc = orderData.description || orderData.Description || orderData.Omschrijving || "";

    const tempCandidates = filterTempOrderLabelsByProduct(labelTemplates, buildOrderLabelTemplateProduct(orderData as Record<string, unknown>)) as LabelTemplate[];
    const explicitTemplate = templateId ? labelTemplates.find((tpl) => tpl.id === templateId) : null;
    const selectedTemplate = explicitTemplate || tempCandidates[0] || null;
    
    let zpl = "";
    if (selectedTemplate) {
      const labelData = processLabelData({
        ...orderData,
        orderNumber: order,
        productId: item,
        description: desc,
        lotNumber: String(orderData.lotNumber || order),
      });
      const processedData = applyLabelLogic(labelData, labelLogicRules);
      const widthMm = Number((selectedTemplate as Record<string, unknown>)?.width) || resolveRollWidthMm(printer);
      const heightMm = Number((selectedTemplate as Record<string, unknown>)?.height) || 40;

      try {
        const bitmapZpl = await renderLabelForPrinter({
          printer,
          template: selectedTemplate as LabelTemplate,
          data: processedData as Record<string, unknown>,
          printerDpi: driver.nativeDpi,
          darkness,
          printSpeed,
          widthMm,
          heightMm,
        });
        zpl = normalizePrinterProtocol(printer) === 'tspl'
          ? bitmapZpl
          : applyCalibration(bitmapZpl, printer, driver);
      } catch (bitmapError) {
        console.error("Bitmap rendering mislukt (strict mode):", bitmapError);
        throw new Error(`Bitmap print mislukt: ${getErrMsg(bitmapError)}`);
      }
    } else {
      const fallbackTemplate = {
        width: 90,
        height: 40,
        elements: [
          { type: 'text', x: 5, y: 4, width: 52, height: 8, fontSize: 12, isBold: true, content: 'Order: {orderNumber}' },
          { type: 'text', x: 5, y: 14, width: 52, height: 7, fontSize: 9, isBold: true, content: 'Item: {itemCode}' },
          { type: 'text', x: 5, y: 23, width: 52, height: 10, fontSize: 8, isBold: true, maxLines: 2, content: '{description}' },
          { type: 'qr', x: 60, y: 5, width: 25, height: 25, content: '{orderNumber}' },
        ],
      };
      const fallbackBitmapZpl = await renderLabelForPrinter({
        printer,
        template: fallbackTemplate as unknown as LabelTemplate,
        data: {
          orderNumber: order,
          itemCode: item,
          description: String(desc || '').substring(0, 80),
        },
        printerDpi: driver.nativeDpi,
        darkness,
        printSpeed,
        widthMm: 90,
        heightMm: 40,
      });
      zpl = normalizePrinterProtocol(printer) === 'tspl'
        ? fallbackBitmapZpl
        : applyCalibration(fallbackBitmapZpl, printer, driver);
    }
    if (!selectedTemplate) {
      zpl = applyCalibration(zpl, printer, driver);
    }

    try {
      const result = await sendPrintJob(printer, zpl, {
        description: `Legacy label voor ${order}`,
        orderId: order,
        renderMode: selectedTemplate ? "bitmap" : "zpl"
      });
      showSuccess(
        result.mode === 'queue'
          ? `Legacy label voor ${order} in wachtrij gezet voor ${printer.name}`
          : `Legacy label voor ${order} verzonden naar ${printer.name}`
      );
    } catch (e: unknown) {
      showError("Print Fout: " + getErrMsg(e));
    }
  };

  const handlePairUsb = async () => {
    if (normalizePrinterType(formData.type) !== CONNECTION_TYPES.WEBUSB) {
      showInfo('USB koppelen is alleen nodig bij verbindingstype WebUSB / Zadig.');
      return;
    }

    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      const detectedSerial = normalizeUsbSerial(device.serialNumber);
      let serialChanged = false;
      setFormData(prev => {
        const existingSerial = normalizeUsbSerial(prev.usbSerialNumber);
        serialChanged = Boolean(existingSerial && detectedSerial && existingSerial !== detectedSerial);
        return {
          ...prev,
          vendorId: device.vendorId,
          productId: device.productId,
          usbSerialNumber: resolveStableUsbSerial(prev.usbSerialNumber, detectedSerial),
          deviceName: device.productName || "USB Printer"
        };
      });

      if (serialChanged) {
        showInfo('Gedetecteerd USB-serial wijkt af na reconnect. Bestaande opgeslagen serial is behouden om configuratie stabiel te houden.');
      }
    } catch (err: unknown) {
      console.error("Pairing error:", err);
      const e = err as { name?: string; message?: string };
      if (e.name !== 'NotFoundError') {
          showError("Koppelen geannuleerd of mislukt: " + (e.message || "onbekende fout"));
      }
    }
  };

  const handleUsbResetReconnect = async () => {
    if (normalizePrinterType(formData.type) !== CONNECTION_TYPES.WEBUSB) {
      showInfo('USB reset is alleen beschikbaar voor WebUSB / Zadig.');
      return;
    }

    try {
      const vendorId = parseUsbId(formData.vendorId);
      const productId = parseUsbId(formData.productId);

      // Sluit bestaande browser-USB sessies zodat reconnect schoon kan starten.
      const devices = await navigator.usb.getDevices();
      const matching = devices.filter((d) => {
        if (vendorId && productId) return d.vendorId === vendorId && d.productId === productId;
        if (vendorId) return d.vendorId === vendorId;
        return true;
      });

      for (const d of matching) {
        try {
          if (d.opened) await d.close();
        } catch {
          // best effort close
        }
      }

      const device = await requestUsbDevice({ vendorId, productId });
      const detectedSerial = normalizeUsbSerial(device.serialNumber);
      let serialChanged = false;
      setFormData(prev => {
        const existingSerial = normalizeUsbSerial(prev.usbSerialNumber);
        serialChanged = Boolean(existingSerial && detectedSerial && existingSerial !== detectedSerial);
        return {
          ...prev,
          vendorId: device.vendorId,
          productId: device.productId,
          usbSerialNumber: resolveStableUsbSerial(prev.usbSerialNumber, detectedSerial),
          deviceName: device.productName || 'USB Printer',
        };
      });

      if (serialChanged) {
        showInfo('USB serial lijkt te wisselen na power-cycle. Bestaande opgeslagen serial is niet overschreven.');
      }

      showSuccess(`USB opnieuw gekoppeld: ${device.productName || 'Onbekende printer'}`);
    } catch (err: unknown) {
      console.error('USB reset/reconnect error:', err);
      const e = err as { name?: string; message?: string };
      if (e?.name !== 'NotFoundError') {
        showError('USB reset/reconnect mislukt: ' + (e?.message || 'onbekende fout'));
      }
    }
  };

  const buildProtocolTestPayload = (printer: PrinterRecord, { lengthMm = 50, title = 'TEST PRINT' }: { lengthMm?: number; title?: string } = {}) => {
    const protocol = normalizePrinterProtocol(printer).toLowerCase();
    const testDriver = getDriver(printer);
    const dpi = testDriver.nativeDpi;
    const darkness = printer?.darkness ? parseInt(printer.darkness, 10) : testDriver.defaultDarkness;
    const printSpeed = printer?.speed ? parseInt(printer.speed, 10) : testDriver.defaultSpeed;
    const widthMm = resolveRollWidthMm(printer);
    const rollType = normalizeRollType(printer?.rollType);
    const widthDots = Math.round(widthMm * testDriver.dotsPerMm);
    const heightDots = Math.round(lengthMm * testDriver.dotsPerMm);

    if (protocol === 'tspl') {
      return [
        `SIZE ${widthMm} mm,${lengthMm} mm`,
        rollType === 'continuous' ? 'GAP 0 mm,0 mm' : 'GAP 2 mm,0 mm',
        `DENSITY ${darkness}`,
        `SPEED ${printSpeed}`,
        'DIRECTION 0,0',
        'CLS',
        `TEXT 24,20,"3",0,1,1,"${title}"`,
        `TEXT 24,55,"2",0,1,1,"${printer.name || 'PRINTER'}"`,
        `TEXT 24,85,"2",0,1,1,"${dpi} DPI"`,
        'BAR 20,115,640,2',
        'PRINT 1,1'
      ].join('\r\n') + '\r\n';
    }

    if (protocol === 'epl') {
      return [
        'N',
        `q${widthDots}`,
        `Q${heightDots},24`,
        `D${Math.max(1, Math.min(15, Math.round(darkness / 2)))}`,
        `A20,20,0,4,1,1,N,"${title}"`,
        `A20,70,0,3,1,1,N,"${printer.name || 'PRINTER'}"`,
        `A20,105,0,2,1,1,N,"${dpi} DPI"`,
        `LO20,140,${Math.max(100, widthDots - 40)},2`,
        'P1'
      ].join('\n') + '\n';
    }

    const zplHint = [
      String(printer?.name || ''),
      String(printer?.deviceName || ''),
      String(printer?.driverModel || ''),
    ].join(' ').toUpperCase();
    const isLighthouseLike = zplHint.includes('LIGHTHOUSE') || zplHint.includes('PPLZ') || zplHint.includes('CJ-PRO');

    // Lighthouse/PPLZ: ultra-minimale ZPL om firmware-fouten op uitgebreide commando's te vermijden.
    if (isLighthouseLike) {
      const safeTitle = String(title || 'TEST PRINT').replace(/[\^~]/g, ' ').slice(0, 24);
      const safePrinter = String(printer.name || 'PRINTER').replace(/[\^~]/g, ' ').slice(0, 24);
      return [
        '^XA',
        '^CI28',
        rollType === 'continuous' ? '^MNN' : '',
        `^LL${heightDots}`,
        '^LH0,0',
        `^FO24,24^A0N,34,28^FD${safeTitle}^FS`,
        `^FO24,70^A0N,24,20^FD${safePrinter}^FS`,
        '^XZ',
        '',
      ].filter(Boolean).join('\r\n');
    }

    // ZPL/default: zonder QR voor maximale firmware-compatibiliteit.
    let zpl = `^XA
~SD${darkness}
^PR${printSpeed}
^PW${widthDots}
^LL${heightDots}
^FO20,20^GB${Math.max(100, widthDots - 40)},${Math.max(60, heightDots - 40)},2^FS
^FO40,45^A0N,42,34^FD${title}^FS
^FO40,95^A0N,30,24^FD${printer.name || 'PRINTER'}^FS
^FO40,130^A0N,28,22^FD${dpi} DPI^FS
^XZ`;

    return applyCalibration(zpl, printer, getDriver(printer));
  };

  const handleTestPrint = async (printer: PrinterRecord) => {
    const payload = buildProtocolTestPayload(printer, { lengthMm: 50, title: 'TEST PRINT' });
    setShowTestMenu(null);

    try {
      const result = await sendPrintJob(printer, payload, {
        description: `Testprint 90x50mm (${printer?.name || 'printer'})`
      }, { allowQueueFallback: true });
      showSuccess(
        result.mode === 'queue'
          ? `Testprint in wachtrij gezet voor ${printer.name}.`
          : t('adminPrinterManager.usbDirectPrintSent')
      );
    } catch (err: unknown) {
      showError("USB Print Fout: " + getErrMsg(err));
    }
  };

  const handleLengthTestPrint = async (printer: PrinterRecord, lengthMm: number) => {
    const payload = buildProtocolTestPayload(printer, {
      lengthMm,
      title: `TEST ${lengthMm}MM`,
    });
    setShowTestMenu(null);

    try {
      const result = await sendPrintJob(printer, payload, {
        description: `Lengte testprint ${lengthMm}mm (${printer?.name || 'printer'})`,
        height: lengthMm
      }, { allowQueueFallback: true });
      showSuccess(
        result.mode === 'queue'
          ? `Testlabel van ${lengthMm}mm in wachtrij gezet voor ${printer.name}.`
          : `Testlabel van ${lengthMm}mm verzonden naar ${printer.name}.`
      );
    } catch (err: unknown) {
      showError("Test Print Fout: " + getErrMsg(err));
    }
  };

  const handleTsplDiagSend = async () => {
    if (!tsplDiagPrinter) return;
    setTsplDiagStatus('sending');
    try {
      const device = await resolveUsbDeviceForPrinter(tsplDiagPrinter as Record<string, unknown>);
      const payload = buildTsplUsbPayload({ content: tsplDiagCommands, quantity: 1 });
      await printBinaryUsbToDevice({ device, payload: new TextEncoder().encode(payload), logMessage: `TSPL diagnostiek: ${tsplDiagPrinter.name}` });
      setTsplDiagStatus('ok');
    } catch (err: unknown) {
      setTsplDiagStatus('error');
      showError("TSPL Diagnostiek fout: " + getErrMsg(err));
    }
  };

  const handlePrintA4QrPdf = async () => {
    const qrContent = 'FPI-ACTION-APPROVE-OK';
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    const doc = new jsPDF('p', 'mm', 'a4');
    const qrSize = 100; // 10cm in mm
    const pageWidth = 210;
    const pageHeight = 297;
    const x = (pageWidth - qrSize) / 2;
    const y = (pageHeight - qrSize) / 2 - 20; // Iets hoger dan het midden

    try {
      const qrDataUrl = await QRCode.toDataURL(qrContent, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 1200,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      doc.addImage(qrDataUrl, 'PNG', x, y, qrSize, qrSize);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('SCAN: OK / GEREED', pageWidth / 2, y + qrSize + 15, { align: 'center' });

      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);

      if (popup) {
        popup.location.href = blobUrl;
      } else {
        doc.save('OK-QR-A4.pdf');
        showInfo('Pop-up geblokkeerd, PDF is gedownload als bestand.');
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err: unknown) {
      if (popup && !popup.closed) popup.close();
      console.error('A4 QR PDF error:', err);
      showError('A4 PDF genereren mislukt: ' + getErrMsg(err));
    }
  };

  const handleEdit = (printer: PrinterRecord) => {
    setFormData({
      name: printer.name || "",
      ip: printer.ip || "",
      port: printer.port || "9100",
      protocol: normalizeProtocol(printer.protocol),
      dpi: printer.dpi || "203",
      width: String(resolveRollWidthMm(printer)),
      height: printer.height || "50",
      rollWidthMm: String(resolveRollWidthMm(printer)),
      rollType: normalizeRollType(printer.rollType),
      darkness: printer.darkness || "15",
      speed: printer.speed || String(getDriver(printer).defaultSpeed),
      linkedStations: printer.linkedStations || [],
      routingKeysText: Array.isArray(printer.routingKeys) ? printer.routingKeys.join(", ") : "",
      type: normalizePrinterType(printer.type),
      vendorId: parseUsbId(printer.vendorId) ?? null,
      productId: parseUsbId(printer.productId) ?? null,
      usbSerialNumber: normalizeUsbSerial(printer.usbSerialNumber),
      deviceName: printer.deviceName || "",
      calibrationOffsetXMm: String(parseMm(printer.calibrationOffsetXMm, 0)),
      calibrationOffsetYMm: String(parseMm(printer.calibrationOffsetYMm, 0)),
      driverModel: printer.driverModel || "",
      zplTextFont: normalizeZplTextFont(printer.zplTextFont),
      bitmapPrintEnabled: Boolean(printer.bitmapPrintEnabled),
      department: printer.department || "",
      locationLabel: printer.locationLabel || "",
    });
    setEditingId(printer.id);
    setIsAdding(true);
    // Laad statushistorie voor deze printer
    setManualStatusResult(null);
    setLoadingStatusHistory(true);
    loadPrinterStatusHistory(printer.id, 7)
      .then((records) => setPrinterStatusHistory(records))
      .catch(() => setPrinterStatusHistory([]))
      .finally(() => setLoadingStatusHistory(false));
  };

  return {
    activeTab,
    setActiveTab,
    availableDepartments,
    availableStations,
    calibrationPrinter,
    setCalibrationPrinter,
    checkingStatus,
    setCheckingStatus,
    clearPersistedPrinterForm,
    editingId,
    setEditingId,
    error,
    formData,
    setFormData,
    handleAddQueueStation,
    handleApplyCalibration,
    handleBulkLotPrint,
    handleCalibrationPrint,
    handleDelete,
    handleEdit,
    handleLengthTestPrint,
    handlePairUsb,
    handlePrintA4QrPdf,
    handleRemoveQueueStation,
    handleSave,
    handleTempLegacyPrint,
    handleTestPrint,
    handleToggleWindowsHostMode,
    handleTsplDiagSend,
    handleUsbResetReconnect,
    isAdding,
    setIsAdding,
    isSavingQueueStations,
    labelLogicRules,
    labelTemplates,
    loading,
    loadingStatusHistory,
    setLoadingStatusHistory,
    manualStatusResult,
    setManualStatusResult,
    printers,
    printerStatusHistory,
    setPrinterStatusHistory,
    queueStations,
    queueStationToAdd,
    setQueueStationToAdd,
    savingWindowsHostMode,
    selectedQueueDepartment,
    setSelectedQueueDepartment,
    selectedQueuePrinterId,
    setSelectedQueuePrinterId,
    showLotModal,
    setShowLotModal,
    showTempModal,
    setShowTempModal,
    showTestMenu,
    setShowTestMenu,
    tsplDiagCommands,
    setTsplDiagCommands,
    tsplDiagPrinter,
    setTsplDiagPrinter,
    tsplDiagStatus,
    setTsplDiagStatus,
    windowsHostMode
  };
};
export type AdminPrinterManagerState = ReturnType<typeof useAdminPrinterManager>;
