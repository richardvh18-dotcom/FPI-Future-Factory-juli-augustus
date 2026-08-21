import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../config/firebase';
import { PATHS, getPathString } from '../../config/dbPaths';
import { doc, getDoc, getDocs, query, collectionGroup, where, documentId, limit } from 'firebase/firestore';
import { Loader2, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { isUsbDirectSupported as usbDirectSupported, printRawUsbToDevice } from '../../utils/usbPrintService';
import { normalizeQueueStationKey, resolvePrintTransport } from '../../services/printRouting';
import { isQueueJobAllowedForPrinter } from './printQueueProcessorHelpers';
import { AnyRecord, PrinterConfig, PrintJob, TempLabelItemProps, LabelTemplate, DepartmentGroup } from './printQueue.types';
import { filterOrderLabelsByProduct, } from '../../utils/labelHelpers';
import { buildOrderLabelTemplateProduct, pickPreferredTempTemplateId, getOrderLabelDescription, getOrderLabelItemCode, getOrderLabelOrder } from '../../utils/orderLabelTemplateUtils';
import AutoScaledLabelPreview from './AutoScaledLabelPreview';

export const USB_PRINTER_VENDOR_KEY = 'usb_printer_vendor';
export const USB_PRINTER_PRODUCT_KEY = 'usb_printer_product';
export const USB_PRINTER_SERIAL_KEY = 'usb_printer_serial';
export const USB_PRINTER_ID_KEY = 'usb_printer_id';
export const PRINT_STATION_SELECTED_KEY = 'print_station_selected_station';
export const PRINT_STATION_BINDINGS_KEY = 'print_station_printer_bindings_v1';
export const PRINT_QUEUE_ADMIN_PROCESSOR_LOCK_KEY = 'print_queue_admin_processor_lock_v1';
export const PRINT_QUEUE_ADMIN_AUTO_PRINT_KEY = 'print_queue_admin_auto_print_v1';
export const MACHINE_ORDERS_READ_LIMIT = 400;
export const SCOPED_ORDERS_FALLBACK_LIMIT = 600;
export const SCOPED_ORDERS_SEARCH_FALLBACK_LIMIT = 120;
export const ORDER_LABELS_PAGE_SIZE = 50;
export const ORDER_LABELS_LIST_MIN_HEIGHT = 'min-h-[280px]';
export const ADMIN_PROCESSOR_LOCK_HEARTBEAT_MS = 4_000;

export const safeStoredUsbSerial = (value: unknown): string => {
  const serial = String(value || '').trim();
  if (!serial) return '';
  return serial.slice(0, 64);
};

export const isInvalidPrintQueueTransitionError = (error: unknown): boolean => {
  const message = String(
    (error as { message?: unknown })?.message
      || (error as { details?: unknown })?.details
      || error
      || ''
  ).toLowerCase();
  return message.includes('ongeldige print queue statusovergang') || message.includes('invalid_print_queue_transition');
};
export const getLivePrintQueueJobStatus = async (jobId: string): Promise<string> => {
  const safeJobId = String(jobId || '').trim();
  if (!safeJobId) return '';

  const jobRef = doc(db, getPathString(PATHS.PRINT_QUEUE), safeJobId);
  const jobSnap = await getDoc(jobRef);
  if (jobSnap.exists()) {
    return String(jobSnap.data()?.status || '').trim().toLowerCase();
  }

  const printQueuePathFragment = `${PATHS.PRINT_QUEUE.join('/')}/`.toLowerCase();
  const isScopedPrintQueuePath = (refPath: string): boolean => {
    const normalizedPath = String(refPath || '').replace(/^\/+/, '').toLowerCase();
    return normalizedPath.includes(printQueuePathFragment);
  };

  try {
    const scopedByDocIdSnap = await getDocs(
      query(collectionGroup(db, 'items'), where(documentId(), '==', safeJobId), limit(20))
    );
    const scopedByDocId = scopedByDocIdSnap.docs.find((snap) => isScopedPrintQueuePath(snap.ref.path));
    if (scopedByDocId) {
      return String(scopedByDocId.data()?.status || '').trim().toLowerCase();
    }
  } catch {
    // Best effort fallback.
  }

  try {
    const scopedByIdFieldSnap = await getDocs(
      query(collectionGroup(db, 'items'), where('id', '==', safeJobId), limit(20))
    );
    const scopedByIdField = scopedByIdFieldSnap.docs.find((snap) => isScopedPrintQueuePath(snap.ref.path));
    if (scopedByIdField) {
      return String(scopedByIdField.data()?.status || '').trim().toLowerCase();
    }
  } catch {
    // Best effort fallback.
  }

  return '';
};

export const stationNameFromValue = (stationValue: unknown): string => {
  if (!stationValue) return '';
  if (typeof stationValue === 'string') return stationValue.trim();
  if (typeof stationValue === 'object') {
    const stationObj = stationValue as AnyRecord;
    return String(
      stationObj.name || stationObj.station || stationObj.id || stationObj.code || ''
    ).trim();
  }
  return String(stationValue).trim();
};

export const normalizeStationKey = (value: unknown): string => {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .replace(/^40(?=BH|BM|BA)/, '');

  // Legacy alias op de vloer: BM18/40BM18 is functioneel BH18.
  if (compact === 'BM18') return 'BH18';

  if (compact.includes('LABELSPRINTING')) return 'LABELSPRINTING';

  const stationTokenMatch = compact.match(/(BH|BM|BA)\d{2,3}/);
  if (stationTokenMatch?.[0]) return stationTokenMatch[0];

  return compact;
};
export const normalizeQueueStatus = (value: unknown): string => String(value || 'pending').trim().toLowerCase();
export const isQueuedJobStatus = (value: unknown): boolean => {
  const status = normalizeQueueStatus(value);
  return status === 'pending' || status === 'queued' || status === 'processing' || status === 'printing';
};
export const normalizeDepartmentKey = (value: unknown): string =>
  String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');

export const DEPARTMENT_CANONICAL_RULES: Array<{ key: string; needles: string[] }> = [
  { key: 'FITTINGS', needles: ['FITTING', 'FITTINGS'] },
  { key: 'PIPES', needles: ['PIPE', 'PIPES'] },
  { key: 'SPOOLS', needles: ['SPOOL', 'SPOOLS'] },
  { key: 'PLANNING', needles: ['PLANNING', 'PLAN'] },
  { key: 'LOGISTICS', needles: ['LOGISTIEK', 'LOGISTICS'] },
  { key: 'WAREHOUSE', needles: ['MAGAZIJN', 'WAREHOUSE'] },
  { key: 'QUALITY', needles: ['QUALITY', 'KWALITEIT', 'QC'] },
];

export const getDepartmentMatchKeys = (value: unknown): string[] => {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const normalized = normalizeDepartmentKey(raw);
  if (!normalized) return [];

  const cleaned = normalized
    .replace(/^(AFDELING|PRODUCTIE|DEPARTMENT)+/g, '')
    .replace(/(AFDELING|PRODUCTIE|DEPARTMENT)$/g, '');

  const keys = new Set<string>([normalized]);
  if (cleaned) keys.add(cleaned);

  DEPARTMENT_CANONICAL_RULES.forEach(({ key, needles }) => {
    if (needles.some((needle) => normalized.includes(needle))) {
      keys.add(key);
    }
  });

  return Array.from(keys);
};

export const getDepartmentKeys = (department: AnyRecord): string[] => {
  const candidates = [department?.id, department?.slug, department?.name, department?.title];
  return Array.from(new Set(candidates.flatMap((entry) => getDepartmentMatchKeys(entry)).filter(Boolean)));
};

export const normalizeStationBindingKey = normalizeQueueStationKey;

export const readStationBindings = (): Record<string, string> => {
  try {
    const raw = String(localStorage.getItem(PRINT_STATION_BINDINGS_KEY) || '').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed || {})
        .map(([key, value]) => [normalizeStationBindingKey(key), String(value || '').trim()])
        .filter(([key, value]) => Boolean(key) && Boolean(value))
    );
  } catch {
    return {};
  }
};

export const writeStationBindings = (nextBindings: Record<string, string>) => {
  localStorage.setItem(PRINT_STATION_BINDINGS_KEY, JSON.stringify(nextBindings || {}));
};

export const getPrinterAllowedStationKeys = (printer: PrinterConfig | null | undefined): string[] => {
  if (!printer) return [];
  const stations = Array.isArray(printer.queueStations)
    ? printer.queueStations
    : (printer.linkedStations || []);

  return Array.from(new Set(
    stations
      .map(stationNameFromValue)
      .map((station) => normalizeStationKey(station))
      .filter(Boolean)
  ));
};

export const getJobStationKeys = (job: PrintJob): string[] => {
  const metadata = (job?.metadata || {}) as AnyRecord;
  const refPath = String((job as AnyRecord)?.__refPath || '');
  const pathMatch = refPath.match(/\/machines\/([^/]+)\/items\//i);
  const stationFromPath = pathMatch?.[1] || '';
  const candidates = [
    metadata.stationId,
    metadata.station,
    metadata.currentStation,
    metadata.targetStation,
    metadata.targetStationId,
    metadata.machineId,
    metadata.machine,
    job.machineId,
    job.stationId,
    job.currentStation,
    job.machine,
    stationFromPath,
  ];

  return Array.from(new Set(
    candidates
      .map((value) => normalizeStationKey(stationNameFromValue(value)))
      .filter(Boolean)
  ));
};

export const getPrinterRoutingViolation = (job: PrintJob, printer: PrinterConfig | null | undefined): string | null => {
  if (!printer) return null;

  if (isQueueJobAllowedForPrinter(job, printer)) {
    return null;
  }

  const allowedStationKeys = getPrinterAllowedStationKeys(printer);
  if (allowedStationKeys.length === 0) return null;

  const jobStationKeys = getJobStationKeys(job);
  if (jobStationKeys.length === 0) return null;

  const matches = jobStationKeys.some((key) => allowedStationKeys.includes(key));
  if (matches) return null;

  const printerName = String(printer?.name || printer?.id || 'onbekend');
  return `Station-routering mismatch: job-station (${jobStationKeys.join(', ')}) valt niet onder printer ${printerName} (${allowedStationKeys.join(', ')}).`;
};

export const resolveUsbBoundPrinter = (printers: PrinterConfig[], usbDevice: USBDevice | null, stationId?: string): PrinterConfig | null => {
  if (usbDevice) {
    const usbSerial = String(usbDevice.serialNumber || '').trim();
    if (usbSerial) {
      const serialMatch = printers.find((printer) => String((printer as AnyRecord).usbSerialNumber || '').trim() === usbSerial) || null;
      if (serialMatch) return serialMatch;
    }

    const usbMatches = printers.filter(
      (printer) => Number(printer.vendorId) === usbDevice.vendorId && Number(printer.productId) === usbDevice.productId
    );
    if (usbMatches.length === 1) return usbMatches[0];
  }

  const stationKey = normalizeStationBindingKey(stationId);
  if (stationKey) {
    const stationBindings = readStationBindings();
    const boundPrinterId = String(stationBindings[stationKey] || '').trim();
    if (boundPrinterId) {
      const boundPrinter = printers.find((printer) => printer.id === boundPrinterId) || null;
      if (boundPrinter) return boundPrinter;
    }
  }

  const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();
  if (savedPrinterId) {
    const savedPrinter = printers.find((printer) => printer.id === savedPrinterId) || null;
    if (savedPrinter) return savedPrinter;
  }

  if (!usbDevice) return null;

  const matches = printers.filter(
    (printer) => Number(printer.vendorId) === usbDevice.vendorId && Number(printer.productId) === usbDevice.productId
  );

  if (matches.length === 1) return matches[0];
  return null;
};

export const PREVIEW_ROLL_WIDTH_MM = 90;

// Local Helper: StatusBadge
export const StatusBadge = ({ status }: { status?: string }) => {
  const config = {
    pending: { icon: <Loader2 className="animate-spin text-yellow-500" size={16} />, text: 'Wachtend', color: 'bg-yellow-100 text-yellow-800' },
    printing: { icon: <RefreshCw className="animate-spin text-blue-500" size={16} />, text: 'Printen', color: 'bg-blue-100 text-blue-800' },
    completed: { icon: <CheckCircle className="text-green-500" size={16} />, text: 'Voltooid', color: 'bg-green-100 text-green-800' },
    error: { icon: <AlertTriangle className="text-red-500" size={16} />, text: 'Fout', color: 'bg-red-100 text-red-800' },
    processing: { icon: <RefreshCw className="animate-spin text-blue-500" size={16} />, text: 'Verwerken', color: 'bg-blue-100 text-blue-800' }
  };
  const key = status && status in config ? (status as keyof typeof config) : 'pending';
  const current = config[key];
  return (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${current.color}`}>
      {current.icon}
      {current.text}
    </span>
  );
};

// Local Helper: WebUSB logic
export const isUsbDirectSupported = () => usbDirectSupported();

export const printRawUsb = async (device: USBDevice, content: string) => {
  return printRawUsbToDevice({ device, content });
};

export const isLikelyPreBatchedZpl = (content: unknown): boolean => {
  const raw = String(content || '');
  if (!raw) return false;
  const xaCount = (raw.match(/\^XA/g) || []).length;
  const xzCount = (raw.match(/\^XZ/g) || []).length;
  return xaCount > 1 || xzCount > 1;
};

export const replaceLastLiteral = (source: string, searchValue: string, replaceValue: string): string => {
  const idx = source.lastIndexOf(searchValue);
  if (idx < 0) return source;
  return `${source.slice(0, idx)}${replaceValue}${source.slice(idx + searchValue.length)}`;
};

export const enforceCutModeOnBatchPayload = (payload: unknown, shouldCutAtEnd: boolean, isPreBatchedJob: boolean = false): string => {
  const normalized = String(payload || '').trim();
  if (!normalized) return '';
  if (isPreBatchedJob) return normalized;

  // We dwingen af dat élk label wordt geknipt
  let transformed = normalized
    .replace(/\^MM[CT]/g, '^MMC')
    .replace(/\^PQ1,0,1,[YN]/g, '^PQ1,0,1,Y');

  return transformed;
};

export const getTimestampMillis = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().getTime();
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
};
