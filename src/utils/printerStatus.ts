import { collection, addDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Bestaande heartbeat-check ─────────────────────────────────────────────

type TimestampLike = { toDate?: () => Date } | Date | string | null | undefined;

export type PrinterStatusLike = {
  isOnline?: boolean | null;
  lastHeartbeat?: TimestampLike;
};

const toMillis = (value: TimestampLike): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    const time = parsed.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate();
    const time = date?.getTime?.();
    return Number.isNaN(time as number) ? null : (time as number);
  }
  return null;
};

export const isPrinterOnline = (
  printer: PrinterStatusLike | null | undefined,
  now: number = Date.now(),
  thresholdMs: number = 45_000,
): boolean => {
  const heartbeatMs = toMillis(printer?.lastHeartbeat);
  if (heartbeatMs !== null) {
    return now - heartbeatMs < thresholdMs;
  }
  return Boolean(printer?.isOnline);
};

// ─── Printer Status Result type ────────────────────────────────────────────

/**
 * Status codes afgeleid uit de ZPL ~HS response.
 * 'ready'      : printer is online en zonder fouten
 * 'paper_out'  : papier/media is op
 * 'head_open'  : printkop staat open
 * 'ribbon_out' : lint is op (thermal transfer)
 * 'paused'     : printer staat op pauze
 * 'error'      : andere printer fout
 * 'offline'    : printer heeft niet gereageerd op ~HS
 */
export type PrinterStatusCode =
  | 'ready'
  | 'paper_out'
  | 'head_open'
  | 'ribbon_out'
  | 'paused'
  | 'error'
  | 'offline';

export type PrinterStatusResult = {
  /** Geaggregeerde statuscode */
  status: PrinterStatusCode;
  /** Leesbare foutmeldingen (Nederlands) */
  errors: string[];
  /** ZPL native error codes bijv. ['PAPER_OUT', 'HEAD_OPEN'] */
  nativeCodes: string[];
  /** Ruwe ~HS response string */
  rawResponse: string;
  /** ISO timestamp van de check */
  checkedAt: string;
  /** Verbindingsmethode */
  source: 'webusb' | 'tcp';
  /** Waardoor de check getriggerd is */
  triggeredBy: 'print_job' | 'manual';
};

// ─── Firestore helpers ──────────────────────────────────────────────────────

const PRINTER_STATUS_COLLECTION = 'gateway_events/printers/records';

/**
 * Sla een printer-statuscheck op in Firestore.
 * Fire-and-forget: gooit nooit een exception richting de aanroeper.
 */
export const savePrinterStatusToFirestore = async (
  printerId: string,
  printerName: string,
  result: PrinterStatusResult,
): Promise<void> => {
  try {
    await addDoc(collection(db, PRINTER_STATUS_COLLECTION), {
      eventType: 'PRINTER_STATUS',
      printerId,
      printerName,
      status: result.status,
      errors: result.errors,
      nativeCodes: result.nativeCodes,
      rawResponse: result.rawResponse,
      source: result.source,
      triggeredBy: result.triggeredBy,
      timestamp: result.checkedAt,
    });
  } catch (err) {
    // Nooit een exception gooien — status opslaan is secundair aan de printjob
    console.warn('[PrinterStatus] Kon status niet opslaan in Firestore:', err);
  }
};

export type PrinterStatusRecord = PrinterStatusResult & {
  id: string;
  printerId: string;
  printerName: string;
  /** Alias voor checkedAt, voor tabelweergave */
  timestamp: string;
};

/**
 * Haal de statusgeschiedenis op van de afgelopen `days` dagen voor een printer.
 * Retourneert maximaal 100 records, gesorteerd op timestamp (nieuwste eerst).
 */
export const loadPrinterStatusHistory = async (
  printerId: string,
  days = 7,
): Promise<PrinterStatusRecord[]> => {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const q = query(
      collection(db, PRINTER_STATUS_COLLECTION),
      where('eventType', '==', 'PRINTER_STATUS'),
      where('printerId', '==', printerId),
      where('timestamp', '>=', cutoff),
      orderBy('timestamp', 'desc'),
      limit(100),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        printerId: String(data.printerId ?? ''),
        printerName: String(data.printerName ?? ''),
        status: (data.status ?? 'offline') as PrinterStatusCode,
        errors: Array.isArray(data.errors) ? (data.errors as string[]) : [],
        nativeCodes: Array.isArray(data.nativeCodes) ? (data.nativeCodes as string[]) : [],
        rawResponse: String(data.rawResponse ?? ''),
        checkedAt: String(data.timestamp ?? ''),
        timestamp: String(data.timestamp ?? ''),
        source: (data.source ?? 'webusb') as 'webusb' | 'tcp',
        triggeredBy: (data.triggeredBy ?? 'manual') as 'print_job' | 'manual',
      };
    });
  } catch (err) {
    console.warn('[PrinterStatus] Kon statushistorie niet laden:', err);
    return [];
  }
};
