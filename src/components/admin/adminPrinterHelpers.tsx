
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
import { generatePrintData } from "../../utils/zplHelper";
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


// Parse USB ID strings (e.g., "1234" or "0x1234") to numbers
export type PrinterConnectionType = "webusb" | "windows_host" | "network";
export type PrinterProtocol = "zpl" | "epl" | "tspl" | "escpos" | "custom";

export type PrinterRecord = {
  id: string;
  name?: string;
  ip?: string;
  port?: string;
  protocol?: string;
  dpi?: string;
  width?: string;
  height?: string;
  rollWidthMm?: string;
  rollType?: string;
  darkness?: string;
  speed?: string;
  linkedStations?: string[];
  queueStations?: string[];
  routingKeys?: string[];
  type?: string;
  vendorId?: number | string | null;
  productId?: number | string | null;
  usbSerialNumber?: string;
  deviceName?: string;
  calibrationOffsetXMm?: string;
  calibrationOffsetYMm?: string;
  driverModel?: string;
  zplTextFont?: string;
  bitmapPrintEnabled?: boolean;
  department?: string;
  locationLabel?: string;
  [key: string]: unknown;
};

export type TimestampLike = {
  toMillis?: () => number;
  seconds?: number;
};

export const timestampToMillis = (value: unknown): number => {
  if (!value || typeof value !== "object") return 0;
  const timestamp = value as TimestampLike;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  return 0;
};

export type PrinterFormData = {
  name: string;
  ip: string;
  port: string;
  protocol: PrinterProtocol;
  dpi: string;
  width: string;
  height: string;
  rollWidthMm: string;
  rollType: string;
  darkness: string;
  speed: string;
  linkedStations: string[];
  routingKeysText: string;
  type: PrinterConnectionType;
  vendorId: number | null;
  productId: number | null;
  usbSerialNumber: string;
  deviceName: string;
  calibrationOffsetXMm: string;
  calibrationOffsetYMm: string;
  driverModel: string;
  zplTextFont: string;
  bitmapPrintEnabled: boolean;
  department: string;
  locationLabel: string;
};

export type TempOrderRecord = {
  id: string;
  orderDisplay?: string;
  productDisplay?: string;
  orderId?: string;
  Order?: string;
  Productieorder?: string;
  order?: string;
  item?: string;
  itemCode?: string;
  Item?: string;
  Artikel?: string;
  description?: string;
  Description?: string;
  Omschrijving?: string;
  [key: string]: unknown;
};

export type LabelTemplate = {
  id: string;
  name?: string;
  tags?: string[];
  width?: number;
  height?: number;
  [key: string]: unknown;
};

export const getErrMsg = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message || "onbekende fout");
  }
  return String(err);
};

export const colPath = (path: string[]) => collection(db, getPathString(path));
export const docPath = (path: string[], id?: string) => (id ? doc(db, `${getPathString(path)}/${id}`) : doc(db, getPathString(path)));

export const MAX_USB_ID = 0xffff;

export const parseUsbId = (idStr: unknown): number | undefined => {
  if (idStr === undefined || idStr === null || idStr === "") return undefined;

  let parsed: number;
  if (typeof idStr === "number") {
    parsed = idStr;
  } else {
    const trimmed = String(idStr).trim();
    if (!trimmed) return undefined;

    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
      parsed = parseInt(trimmed, 16);
    } else if (/^[0-9]+$/.test(trimmed)) {
      parsed = parseInt(trimmed, 10);
    } else {
      return undefined;
    }
  }

  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_USB_ID) return undefined;
  return parsed;
};

export const PRINTER_PROTOCOLS: PrinterProtocol[] = ["zpl", "epl", "tspl", "escpos", "custom"];
export const PRINT_SETTINGS_KEY = 'printConfig';
export const CONNECTION_TYPES = {
  WEBUSB: 'webusb',
  WINDOWS_HOST: 'windows_host',
  NETWORK: 'network',
} as const;

export const normalizeProtocol = (value: unknown): PrinterProtocol => {
  const raw = String(value || "").toLowerCase();
  return (PRINTER_PROTOCOLS.includes(raw as PrinterProtocol) ? raw : "zpl") as PrinterProtocol;
};

export const normalizePrinterType = (type: unknown): PrinterConnectionType => {
  if (type === 'zebra_local') return CONNECTION_TYPES.WEBUSB;
  if (type === CONNECTION_TYPES.WEBUSB || type === CONNECTION_TYPES.WINDOWS_HOST || type === CONNECTION_TYPES.NETWORK) {
    return type;
  }
  return CONNECTION_TYPES.WEBUSB;
};

export const getConnectionLabel = (type: unknown): string => {
  const normalized = normalizePrinterType(type);
  if (normalized === CONNECTION_TYPES.WINDOWS_HOST) return 'Windows Host';
  if (normalized === CONNECTION_TYPES.NETWORK) return 'Netwerk (IP)';
  return 'WebUSB / Zadig';
};

export const DEFAULT_PRINTER_FORM: PrinterFormData = {
  name: "",
  ip: "",
  port: "9100",
  protocol: "zpl",
  dpi: "203",
  width: "90",
  height: "50",
  rollWidthMm: "90",
  rollType: "gap", // gap (stickers), continuous (doorlopend), mark (black mark)
  darkness: "15",
  speed: "3",
  linkedStations: [],
  routingKeysText: "",
  type: CONNECTION_TYPES.WEBUSB,
  vendorId: null,
  productId: null,
  usbSerialNumber: "",
  deviceName: "",
  calibrationOffsetXMm: "0",
  calibrationOffsetYMm: "0",
  driverModel: "",  // bijv. 'zebra-zm400-300' of 'lighthouse-cjpro2'
  zplTextFont: "0",
  bitmapPrintEnabled: false,
  department: "",
  locationLabel: "",
};

export const parseMm = (value: unknown, fallback = 0): number => {
  const parsed = Number.parseFloat(String(value ?? "").replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeRollType = (value: unknown): "gap" | "continuous" | "mark" => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'continuous' || raw === 'mark') return raw;
  return 'gap';
};

export const normalizeZplTextFont = (value: unknown): "0" | "A" => {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "A") return "A";
  return "0";
};

export const resolveRollWidthMm = (printerLike: Partial<PrinterFormData | PrinterRecord> = {}) => {
  return parseMm(printerLike.rollWidthMm ?? printerLike.width, 90);
};

export const mmToDots = (mm: unknown, dpi = 203) => Math.round((Number(mm) || 0) * (dpi / 25.4));

export const normalizeUsbSerial = (value: unknown): string => String(value || "").trim();

export const resolveStableUsbSerial = (existingSerial: unknown, detectedSerial: unknown): string => {
  const existing = normalizeUsbSerial(existingSerial);
  const detected = normalizeUsbSerial(detectedSerial);
  if (existing) return existing;
  return detected;
};

// applyCalibrationToRawZpl is vervangen door applyCalibration() uit printerDrivers.js.
// buildCalibrationCrossZpl gebruikt nu getDriver() voor correcte DPI-berekening.

export const buildCalibrationCrossZpl = ({ printer, labelWidthMm = 90, labelHeightMm = 40 }: { printer: PrinterRecord | PrinterFormData; labelWidthMm?: number; labelHeightMm?: number }) => {
  const driver = getDriver(printer);
  const dpi = driver.nativeDpi;
  const darkness = printer?.darkness ? parseInt(printer.darkness, 10) : driver.defaultDarkness;
  const printSpeed = printer?.speed ? parseInt(printer.speed, 10) : driver.defaultSpeed;
  const toDots = (mm: number) => mmToDots(mm, dpi);

  const widthDots = toDots(labelWidthMm);
  const heightDots = toDots(labelHeightMm);
  const centerX = Math.round(widthDots / 2);
  const centerY = Math.round(heightDots / 2);

  const margin = toDots(2);
  const crossHalf = toDots(8);
  const tick = toDots(1.4);
  const tickLen = toDots(2.4);
  const bottomTextY = Math.max(toDots(2), heightDots - toDots(4));

  const mediaMode = driver?.mediaMode ?? '^MMC';

  let zpl = "^XA\n";
  if (mediaMode) zpl += `${mediaMode}\n`; // cut-mode vroeg in format
  zpl += "^MTT\n";   // Thermal Transfer — gebruik inktlint; voorkomt dat het lint scheurt
  zpl += `~SD${darkness}\n`;

  zpl += `^PR${printSpeed}\n`;
  zpl += `^PW${widthDots}\n`;
  zpl += `^LL${heightDots}\n`;
  // Buitenrand als 4 losse dunne lijnen i.p.v. één grote ^GB rechthoek.
  // Reden: de Argox PPLZ firmware (AME-3230Pro) crasht bij een ^GB die groter is dan ~30KB
  // renderbuffer (bijv. 688×368 dots ≈ 32KB). Vier dunne lijnen vermijden dit.
  const bw = Math.max(1, widthDots - (margin * 2));
  const bh = Math.max(1, heightDots - (margin * 2));
  zpl += `^FO${margin},${margin}^GB${bw},2,2^FS\n`;                    // boven
  zpl += `^FO${margin},${margin + bh - 2}^GB${bw},2,2^FS\n`;           // onder
  zpl += `^FO${margin},${margin}^GB2,${bh},2^FS\n`;                    // links
  zpl += `^FO${margin + bw - 2},${margin}^GB2,${bh},2^FS\n`;           // rechts

  zpl += `^FO${centerX - crossHalf},${centerY}^GB${crossHalf * 2},1,1^FS\n`;
  zpl += `^FO${centerX},${centerY - crossHalf}^GB1,${crossHalf * 2},1^FS\n`;

  const topMarks = [10, 20, 30, 40, 50, 60, 70, 80].filter((m) => m < (labelWidthMm - 4));
  topMarks.forEach((markMm) => {
    const x = toDots(markMm);
    zpl += `^FO${x},${margin}^GB1,${tickLen},1^FS\n`;
    zpl += `^FO${x - tick},${margin + tickLen + toDots(0.4)}^A0N,${toDots(1.7)},${toDots(1.4)}^FD${markMm}^FS\n`;

    const bottomTickY = heightDots - margin - tickLen;
    const bottomLabelY = heightDots - margin - tickLen - toDots(2.2);
    zpl += `^FO${x},${bottomTickY}^GB1,${tickLen},1^FS\n`;
    zpl += `^FO${x - tick},${bottomLabelY}^A0N,${toDots(1.7)},${toDots(1.4)}^FD${markMm}^FS\n`;
  });

  const leftMarks = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
    .filter((m) => m < (labelHeightMm - 3));
  leftMarks.forEach((markMm) => {
    const y = toDots(markMm);
    zpl += `^FO${margin},${y}^GB${tickLen},1,1^FS\n`;
    zpl += `^FO${margin + tickLen + toDots(0.4)},${y - tick}^A0N,${toDots(1.6)},${toDots(1.3)}^FD${markMm}^FS\n`;

    const rightTickX = widthDots - margin - tickLen;
    const rightLabelX = widthDots - margin - tickLen - toDots(5.2);
    zpl += `^FO${rightTickX},${y}^GB${tickLen},1,1^FS\n`;
    zpl += `^FO${rightLabelX},${y - tick}^A0N,${toDots(1.6)},${toDots(1.3)}^FD${markMm}^FS\n`;
  });

  zpl += `^FO${toDots(3)},${toDots(4)}^A0N,${toDots(2.5)},${toDots(2.2)}^FDCALIB ${labelWidthMm}x${labelHeightMm}mm^FS\n`;
  zpl += `^FO${toDots(3)},${toDots(7.5)}^A0N,${toDots(2.2)},${toDots(2)}^FDMidden kruis = referentie^FS\n`;
  zpl += `^FO${toDots(3)},${bottomTextY}^A0N,${toDots(2.2)},${toDots(2)}^FDMeet L/R en B/O en geef correctie in mm op^FS\n`;
  zpl += "^PQ1,0,1,Y\n"; // print en snij calibratie label
  zpl += "^XZ";

  return applyCalibration(zpl, printer, driver);
};

export const buildLabelaryPreviewUrl = ({ zpl, dpi = 203, widthMm = 90, heightMm = 40 }: { zpl: string; dpi?: number; widthMm?: number; heightMm?: number }) => {
  // dpmm: Labelary ondersteunt 6, 8, 12, 24 (dpm = dots per mm)
  const dpmm = dpi >= 500 ? 24 : dpi >= 250 ? 12 : dpi >= 150 ? 8 : 6;
  const widthInch = (widthMm / 25.4).toFixed(2);
  const heightInch = (heightMm / 25.4).toFixed(2);
  return `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthInch}x${heightInch}/0/${encodeURIComponent(zpl)}`;
};

// Helpers voor Lotnummer generatie
export const getMachineCode = (station: unknown): string => {
  if (!station) return "999";
  const normalized = String(station).toUpperCase().trim();
  const baseStation = normalized.startsWith('40') ? normalized.substring(2) : normalized;
  
  const map = {
    'BH11': '411',
    'BH12': '412',
    'BH15': '415',
    'BH16': '416',
    'BH17': '417',
    'BH18': '418',
    'BH31': '431',
    'BH05': '405',
    'BH07': '407',
    'BH08': '408',
    'BH09': '409',
    'BA05': '405',
    'BA07': '417'
  };
  
  if (baseStation in map) return map[baseStation as keyof typeof map];

  const digits = baseStation.replace(/\D/g, "");
  if (!digits) return "999";
  
  if (digits.length === 3) return digits;
  if (digits.length === 1) return `40${digits}`;
  return `4${digits.slice(-2).padStart(2, "0")}`;
};

export const getIsoWeekAndYear = (d: Date): { week: string; year: string } => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week: String(weekNo).padStart(2, '0'), year: String(year) };
};
