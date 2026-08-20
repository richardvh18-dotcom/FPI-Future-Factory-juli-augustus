import { auth, logActivity } from "../config/firebase";
import { type PrinterStatusResult, savePrinterStatusToFirestore } from './printerStatus';

type UsbPrinterFilterInput = {
  vendorId?: unknown;
  productId?: unknown;
  usbVendorId?: unknown;
  usbProductId?: unknown;
  serialNumber?: unknown;
  usbSerialNumber?: unknown;
  usbSerial?: unknown;
};

type UsbPrinterRef = {
  vendorId?: number;
  productId?: number;
};

type UsbDeviceLike = {
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
};

const USB_TRANSFER_CHUNK_SIZE = 4096;
const USB_IO_TIMEOUT_MS = 12000;
const USB_PREPARE_TIMEOUT_MS = 15000;

type UsbDeviceLockState = {
  locked: boolean;
  waiters: Array<() => void>;
};

const usbDeviceLocks = new Map<string, UsbDeviceLockState>();

const getUsbDeviceLockKey = (device: USBDevice): string => {
  const vendor = Number(device?.vendorId || 0);
  const product = Number(device?.productId || 0);
  const serial = String(device?.serialNumber || "").trim();
  return `${vendor}:${product}:${serial || "na"}`;
};

const acquireUsbDeviceLock = async (device: USBDevice): Promise<() => void> => {
  const key = getUsbDeviceLockKey(device);
  let state = usbDeviceLocks.get(key);

  if (!state) {
    state = { locked: false, waiters: [] };
    usbDeviceLocks.set(key, state);
  }

  if (!state.locked) {
    state.locked = true;
    return () => {
      const current = usbDeviceLocks.get(key);
      if (!current) return;
      const next = current.waiters.shift();
      if (next) {
        next();
      } else {
        current.locked = false;
      }
    };
  }

  await new Promise<void>((resolve) => {
    state?.waiters.push(resolve);
  });

  const resumedState = usbDeviceLocks.get(key);
  if (resumedState) resumedState.locked = true;

  return () => {
    const current = usbDeviceLocks.get(key);
    if (!current) return;
    const next = current.waiters.shift();
    if (next) {
      next();
    } else {
      current.locked = false;
    }
  };
};

export const parseUsbId = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return value;

  const text = String(value).trim().toLowerCase();
  if (text.startsWith("0x")) {
    const parsedHex = parseInt(text, 16);
    return Number.isNaN(parsedHex) ? undefined : parsedHex;
  }

  const parsed = parseInt(text, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const getPrinterFilters = (printer: UsbPrinterFilterInput = {}): USBDeviceFilter[] => {
  const vendorId = parseUsbId(printer.vendorId ?? printer.usbVendorId);
  const productId = parseUsbId(printer.productId ?? printer.usbProductId);

  if (vendorId && productId) return [{ vendorId, productId }];
  if (vendorId) return [{ vendorId }];
  return [];
};

const getExpectedUsbSerial = (printer: UsbPrinterFilterInput = {}): string =>
  String(printer.serialNumber ?? printer.usbSerialNumber ?? printer.usbSerial ?? "").trim();

export const doesUsbDeviceMatchPrinter = (
  device: UsbDeviceLike | null | undefined,
  printer: UsbPrinterFilterInput = {}
): boolean => {
  if (!device) return false;

  const expectedVendorId = parseUsbId(printer.vendorId ?? printer.usbVendorId);
  const expectedProductId = parseUsbId(printer.productId ?? printer.usbProductId);
  const expectedSerial = getExpectedUsbSerial(printer);
  const deviceSerial = String(device.serialNumber || "").trim();

  // Als er een serienummer verwacht wordt en deze klopt, is het altijd een match (cruciaal voor Lighthouse drift)
  if (expectedSerial && deviceSerial === expectedSerial) {
    return true;
  }

  // Fallback: als we het serienummer niet konden matchen of er geen serial is, test dan strikt op VID/PID.
  if (expectedVendorId !== undefined && Number(device.vendorId) !== expectedVendorId) {
    return false;
  }

  if (expectedProductId !== undefined && Number(device.productId) !== expectedProductId) {
    return false;
  }

  const hasVendorOrProductIdentity = expectedVendorId !== undefined || expectedProductId !== undefined;
  if (hasVendorOrProductIdentity) {
    return true;
  }

  return false;
};

const ensureUsbSupport = (): void => {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.usb) {
    throw new Error("WebUSB is niet beschikbaar in deze browser.");
  }

  if (!window.isSecureContext) {
    throw new Error("WebUSB werkt alleen in een secure context (https of localhost).");
  }
};

const getOutEndpoint = (
  device: USBDevice
): { interfaceNumber: number; alternateSetting: number; endpointNumber: number } | null => {
  const interfaces = device.configuration?.interfaces || [];
  const candidates: Array<{
    interfaceNumber: number;
    alternateSetting: number;
    endpointNumber: number;
    score: number;
  }> = [];

  for (const iface of interfaces) {
    for (const alternate of iface.alternates || []) {
      const outEndpoints = (alternate.endpoints || []).filter((ep) => ep.direction === "out");
      for (const endpoint of outEndpoints) {
        let score = 0;

        // USB printer-class interfaces zijn de veiligste keuze voor raw label output.
        if (alternate.interfaceClass === 7) score += 100;
        if (alternate.interfaceSubclass === 1) score += 20;
        if (alternate.interfaceProtocol === 1 || alternate.interfaceProtocol === 2) score += 10;

        // Bulk is doorgaans het juiste transport voor label printers.
        if (endpoint.type === "bulk") score += 30;

        // Historische fallback: interface 0 vaak bruikbaar, maar niet als primaire voorkeur.
        if (iface.interfaceNumber === 0) score += 5;

        candidates.push({
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alternate.alternateSetting,
          endpointNumber: endpoint.endpointNumber,
          score,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return {
    interfaceNumber: best.interfaceNumber,
    alternateSetting: best.alternateSetting,
    endpointNumber: best.endpointNumber,
  };
};

const getInEndpoint = (
  device: USBDevice,
  interfaceNumber: number,
  alternateSetting: number
): number | null => {
  const iface = device.configuration?.interfaces.find((i) => i.interfaceNumber === interfaceNumber);
  if (!iface) return null;
  const alternate = iface.alternates.find((a) => a.alternateSetting === alternateSetting);
  if (!alternate) return null;
  const inEndpoint = (alternate.endpoints || []).find((ep) => ep.direction === "in");
  return inEndpoint ? inEndpoint.endpointNumber : null;
};


const safeCloseDevice = async (device: USBDevice | null | undefined): Promise<void> => {
  if (!device) return;

  try {
    if (device.opened) {
      await device.close();
    }
  } catch {
    // Best effort close; ignore close failures.
  }
};

const closeMatchingAuthorizedDevices = async ({
  printer = {},
  excludeDevice,
}: {
  printer?: UsbPrinterFilterInput;
  excludeDevice?: USBDevice;
} = {}): Promise<void> => {
  ensureUsbSupport();
  const filters = getPrinterFilters(printer);
  const authorizedDevices = await navigator.usb.getDevices();

  const matching = authorizedDevices.filter((device) => {
    if (excludeDevice && device === excludeDevice) return false;
    if (filters.length === 0) return true;
    return filters.some(
      (f) => device.vendorId === f.vendorId && (f.productId ? device.productId === f.productId : true)
    );
  });

  for (const device of matching) {
    await safeCloseDevice(device);
  }
};

const normalizeUsbError = (err: unknown): Error => {
  if (err instanceof Error) {
    const name = String(err.name || "");
    const message = String(err.message || "");
    const combined = `${name} ${message}`.toLowerCase();

    if (name === "NotFoundError" || /no device selected|geen apparaat geselecteerd/i.test(combined)) {
      return new Error("Geen USB-printer geselecteerd. Kies een printer in de browser-popup om te printen.");
    }

    if (name === "SecurityError" || /access denied|permission|toegang|not allowed/i.test(combined)) {
      return new Error(
        "USB toegang geweigerd. Sluit andere tabbladen/apps die de printer gebruiken, koppel USB opnieuw en geef browsertoegang opnieuw."
      );
    }

    if (/claiminterface|claim interface|unable to claim interface|interface/i.test(combined)) {
      return new Error(
        "USB interface kon niet geclaimd worden. Printer kan nog bezet zijn door een ander tabblad of proces. Sluit andere printsessies en probeer opnieuw."
      );
    }

    return err;
  }

  return new Error(String(err || "Onbekende USB fout"));
};

/**
 * Parseert de ruwe ZPL ~HS (Host Status) response naar een gestructureerd PrinterStatusResult.
 *
 * ZPL ~HS retourneert 3 regels CSV:
 *   Regel 1: <STX>NNN,PAPER_OUT,PAUSE,LABEL_LEN,unused,BUFFER_FULL,...<ETX>
 *   Regel 2: <STX>NNN,HEAD_OPEN,RIBBON_OUT,THERMAL_FAULT,...<ETX>
 *   Regel 3: <STX>label_length,...<ETX>
 *
 * Argox PPLZ (Lighthouse) is ZPL-compatibel en retourneert hetzelfde formaat.
 */
const parseZebraStatus = (
  rawResponse: string,
  source: 'webusb' | 'tcp' = 'webusb',
  triggeredBy: 'print_job' | 'manual' = 'print_job',
): PrinterStatusResult => {
  const errors: string[] = [];
  const nativeCodes: string[] = [];

  if (!rawResponse || rawResponse.trim() === '') {
    return { status: 'offline', errors: ['Geen antwoord van printer.'], nativeCodes: ['NO_RESPONSE'], rawResponse, checkedAt: new Date().toISOString(), source, triggeredBy };
  }

  // Strip STX (\u0002) en ETX (\u0003) control chars
  // eslint-disable-next-line no-control-regex
  const lines = rawResponse.split('\n').map(l => l.trim().replace(/[\u0002\u0003]/g, ''));

  const line1 = (lines[0] ?? '').split(',');
  if (line1.length >= 6) {
    if (line1[1] === '1') { errors.push('Papier/media is op.'); nativeCodes.push('PAPER_OUT'); }
    if (line1[2] === '1') { errors.push('Printer staat op pauze.'); nativeCodes.push('PAUSED'); }
    if (line1[5] === '1') { errors.push('Databuffer is vol.'); nativeCodes.push('BUFFER_FULL'); }
  }

  if (lines.length > 1) {
    const line2 = (lines[1] ?? '').split(',');
    if (line2.length >= 3) {
      if (line2[1] === '1') { errors.push('Printkop staat open.'); nativeCodes.push('HEAD_OPEN'); }
      if (line2[2] === '1') { errors.push('Inktlint is op.'); nativeCodes.push('RIBBON_OUT'); }
      if (line2.length >= 4 && line2[3] === '1') { errors.push('Thermal transfer fout.'); nativeCodes.push('THERMAL_FAULT'); }
    }
  }

  // Bepaal geaggregeerde status
  let status: PrinterStatusResult['status'] = 'ready';
  if (nativeCodes.includes('PAPER_OUT')) status = 'paper_out';
  else if (nativeCodes.includes('HEAD_OPEN')) status = 'head_open';
  else if (nativeCodes.includes('RIBBON_OUT')) status = 'ribbon_out';
  else if (nativeCodes.includes('PAUSED')) status = 'paused';
  else if (errors.length > 0) status = 'error';

  return { status, errors, nativeCodes, rawResponse, checkedAt: new Date().toISOString(), source, triggeredBy };
};

/**
 * Vraag de printerstatus op via USB (~HS commando).
 * Retourneert een PrinterStatusResult — altijd, ook bij fouten.
 * Gooit nooit een exception.
 */
const readPrinterStatusUsb = async (
  device: USBDevice,
  outEndpointNumber: number,
  inEndpointNumber: number | null,
  triggeredBy: 'print_job' | 'manual' = 'print_job',
): Promise<PrinterStatusResult | null> => {
  if (inEndpointNumber === null || inEndpointNumber === undefined) return null;

  try {
    const req = new TextEncoder().encode('~HS\r\n');
    await device.transferOut(outEndpointNumber, req as unknown as BufferSource);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (device as any).transferIn(inEndpointNumber, 1024);
    if (res.status === 'ok' && res.data) {
      const rawResponse = new TextDecoder().decode(res.data as ArrayBuffer);
      return parseZebraStatus(rawResponse, 'webusb', triggeredBy);
    }
    return parseZebraStatus('', 'webusb', triggeredBy);
  } catch (err) {
    console.warn('[PrinterStatus] USB status read mislukt:', err);
    return {
      status: 'offline',
      errors: ['Kon printer niet bereiken via USB.'],
      nativeCodes: ['USB_READ_ERROR'],
      rawResponse: '',
      checkedAt: new Date().toISOString(),
      source: 'webusb',
      triggeredBy,
    };
  }
};

/**
 * Publieke export: vraag printer status op via USB, sla op in Firestore.
 * Bedoeld voor de handmatige "Controleer Status" knop in AdminPrinterManager.
 * @param device       - geopend USBDevice
 * @param printerId    - Firestore printer ID
 * @param printerName  - Leesbare printernaam
 * @param triggeredBy  - 'print_job' of 'manual'
 */
export const queryAndSavePrinterStatusUsb = async (
  device: USBDevice,
  printerId: string,
  printerName: string,
  triggeredBy: 'print_job' | 'manual' = 'manual',
): Promise<PrinterStatusResult | null> => {
  try {
    const endpointInfo = getOutEndpoint(device);
    if (!endpointInfo) return null;
    const inEp = getInEndpoint(device, endpointInfo.interfaceNumber, endpointInfo.alternateSetting);
    const result = await readPrinterStatusUsb(device, endpointInfo.endpointNumber, inEp, triggeredBy);
    if (result) {
      // Fire-and-forget — wacht niet op Firestore
      void savePrinterStatusToFirestore(printerId, printerName, result);
    }
    return result;
  } catch {
    return null;
  }
};


const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const prepareDevice = async (
  device: USBDevice,
  printer: UsbPrinterRef = {}
): Promise<{ interfaceNumber: number; alternateSetting: number; endpointNumber: number }> => {
  if (!device.opened) {
    try {
      await device.open();
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : "";
      const errMessage = err instanceof Error ? err.message : String(err || "");
      const isAccessIssue =
        errName === "SecurityError" || /access denied|permission|toegang/i.test(String(errMessage || ""));

      if (!isAccessIssue) throw err;

      // One retry after cleaning up potentially stale sessions in this browser context.
      await closeMatchingAuthorizedDevices({ printer, excludeDevice: device });
      await safeCloseDevice(device);
      await device.open();
    }
  }

  if (!device.configuration) {
    await device.selectConfiguration(1);
  }

  let endpointInfo = getOutEndpoint(device);
  if (!endpointInfo) {
    if (device.configuration?.interfaces?.[0]) {
      endpointInfo = {
        interfaceNumber: device.configuration.interfaces[0].interfaceNumber,
        alternateSetting: device.configuration.interfaces[0].alternates?.[0]?.alternateSetting ?? 0,
        endpointNumber: device.configuration.interfaces[0].alternates?.[0]?.endpoints?.find((ep) => ep.direction === "out")?.endpointNumber ?? 0,
      };
    }
  }

  if (!endpointInfo || endpointInfo.endpointNumber === undefined || endpointInfo.endpointNumber === 0) {
    throw new Error("Geen bruikbare USB OUT endpoint gevonden voor deze printer.");
  }

  try {
    await device.claimInterface(endpointInfo.interfaceNumber);
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.name : "";
    const message = String(err instanceof Error ? err.message : err || "").toLowerCase();
    const isAlreadyClaimed = errName === "InvalidStateError" || /already|claimed|state/i.test(message);
    if (!isAlreadyClaimed) {
      // Retry once after forcefully resetting this browser-context USB session.
      await closeMatchingAuthorizedDevices({ printer, excludeDevice: device });
      await safeCloseDevice(device);
      await device.open();
      if (!device.configuration) {
        await device.selectConfiguration(1);
      }
      await device.claimInterface(endpointInfo.interfaceNumber);
    }
  }

  if (endpointInfo.alternateSetting !== undefined) {
    await device.selectAlternateInterface(endpointInfo.interfaceNumber, endpointInfo.alternateSetting);
  }

  return endpointInfo;
};

const selectUsbDevice = async (printer: UsbPrinterFilterInput = {}): Promise<USBDevice> => {
  ensureUsbSupport();

  const filters = getPrinterFilters(printer);
  const authorizedDevices = await navigator.usb.getDevices();

  const matchAuthorized =
    filters.length > 0
      ? authorizedDevices.find((d) =>
          filters.some((f) => d.vendorId === f.vendorId && (f.productId ? d.productId === f.productId : true))
        )
      : authorizedDevices[0];

  if (matchAuthorized) return matchAuthorized;

  // Altijd zonder filter vragen — één popup, geen dubbele requestDevice.
  try {
    return await navigator.usb.requestDevice({ filters: [] });
  } catch (err: unknown) {
    throw normalizeUsbError(err);
  }
};

export const findAuthorizedUsbDevice = async (
  printer: UsbPrinterFilterInput = {}
): Promise<USBDevice | null> => {
  ensureUsbSupport();
  const filters = getPrinterFilters(printer);
  const expectedSerial = getExpectedUsbSerial(printer);
  const authorizedDevices = await navigator.usb.getDevices();

  // Als een serienummer is opgegeven, proberen we deze eerst te matchen in ALLE geautoriseerde apparaten.
  // Dit lost het probleem op van printers (zoals Lighthouse) waarvan de VID/PID driften.
  if (expectedSerial) {
    const bySerial = authorizedDevices.find((d) => String(d.serialNumber || "").trim() === expectedSerial);
    if (bySerial) return bySerial;
  }

  if (filters.length === 0) {
    return authorizedDevices[0] || null;
  }

  const matchingByVidPid = authorizedDevices.filter((d) =>
    filters.some((f) => d.vendorId === f.vendorId && (f.productId ? d.productId === f.productId : true))
  );

  return matchingByVidPid[0] || null;
};

export const resolveUsbDeviceForPrinter = async (
  printer: UsbPrinterFilterInput = {},
  currentDevice?: USBDevice | null
): Promise<USBDevice | null> => {
  const strictDevice = await findAuthorizedUsbDevice(printer);
  if (strictDevice) {
    return strictDevice;
  }

  const hasPrinterIdentity =
    parseUsbId(printer.vendorId ?? printer.usbVendorId) !== undefined ||
    parseUsbId(printer.productId ?? printer.usbProductId) !== undefined;
  const hasStrictSerial = Boolean(getExpectedUsbSerial(printer));

  if (currentDevice && doesUsbDeviceMatchPrinter(currentDevice, printer)) {
    return currentDevice;
  }

  if (hasPrinterIdentity && !hasStrictSerial) {
    const fallbackDevice = await findAuthorizedUsbDevice({});
    if (fallbackDevice) {
      return fallbackDevice;
    }
  }

  try {
    return await requestUsbDevice(printer);
  } catch {
    return null;
  }
};

export const requestUsbDevice = async (printer: UsbPrinterFilterInput = {}): Promise<USBDevice> => {
  ensureUsbSupport();
  const filters = getPrinterFilters(printer);
  const expectedSerial = getExpectedUsbSerial(printer);

  const ensureExpectedSerial = (device: USBDevice): USBDevice => {
    if (!expectedSerial) return device;

    const serial = String(device.serialNumber || "").trim();
    if (!serial) {
      return device;
    }

    if (serial !== expectedSerial) {
      return device;
    }

    return device;
  };

  // Gebruik altijd één popup zonder filter zodat de gebruiker elke printer kan kiezen.
  // Dubbele requestDevice-aanroepen vermijden — dit veroorzaakte twee popups achter elkaar.
  try {
    const selected = await navigator.usb.requestDevice({ filters: [] });
    return ensureExpectedSerial(selected);
  } catch (err: unknown) {
    throw normalizeUsbError(err);
  }
};

import { normalizePrinterProtocol } from './printerProtocolService';

export const printRawUsbToDevice = async ({
  device,
  content,
  logMessage,
  printer,
}: {
  device: USBDevice | null | undefined;
  content: unknown;
  logMessage?: string;
  printer?: UsbPrinterFilterInput;
}) => {
  if (!device) {
    throw new Error("Geen printer verbonden.");
  }
  if (!content || !String(content).trim()) {
    throw new Error("Geen printinhoud opgegeven.");
  }

  ensureUsbSupport();
  const releaseDeviceLock = await acquireUsbDeviceLock(device);
  try {
    const endpointInfo = await withTimeout(
      prepareDevice(device, {
        vendorId: device.vendorId,
        productId: device.productId,
      }),
      USB_PREPARE_TIMEOUT_MS,
      "USB printer voorbereiden duurt te lang (timeout)."
    );
    const data = new TextEncoder().encode(String(content));

    const transferPayload = async (payload: Uint8Array) => {
      const transferBuffer = payload as unknown as BufferSource;
      const result = await withTimeout(
        device.transferOut(endpointInfo.endpointNumber, transferBuffer),
        USB_IO_TIMEOUT_MS,
        "USB gegevensoverdracht duurt te lang (timeout)."
      );
      if (result.status !== "ok") {
        throw new Error(`USB print mislukt met status: ${result.status}`);
      }
    };

    if (data.length <= USB_TRANSFER_CHUNK_SIZE) {
      await transferPayload(data);
    } else {
      for (let offset = 0; offset < data.length; offset += USB_TRANSFER_CHUNK_SIZE) {
        const chunk = data.slice(offset, offset + USB_TRANSFER_CHUNK_SIZE);
        await transferPayload(chunk);
      }
    }

    // Status check na printen voor ZPL printers — fire-and-forget, blokkeert printjob niet
    const isZpl = normalizePrinterProtocol(printer as any) === 'zpl';
    if (isZpl) {
      const inEndpoint = getInEndpoint(device, endpointInfo.interfaceNumber, endpointInfo.alternateSetting);
      if (inEndpoint !== null) {
        void (async () => {
          // Korte wachttijd: geeft printer kans om foutstatus bij te werken na het printen
          await new Promise(r => setTimeout(r, 500));
          const statusResult = await readPrinterStatusUsb(device, endpointInfo.endpointNumber, inEndpoint, 'print_job');
          if (statusResult) {
            const printerId = String((printer as Record<string, unknown>)?.id ?? '');
            const printerName = String((printer as Record<string, unknown>)?.name ?? device.productName ?? 'USB Printer');
            void savePrinterStatusToFirestore(printerId, printerName, statusResult);
          }
        })();
      }
    }

    if (logMessage) {
      try {
        await logActivity(auth.currentUser?.uid || "system", "PRINT_LABEL", logMessage);
      } catch (e) {
        console.error("Logging print mislukt:", e);
      }
    }

    return {
      productName: device.productName || "Onbekende USB printer",
      vendorId: device.vendorId,
      productId: device.productId,
    };
  } catch (err: unknown) {
    throw normalizeUsbError(err);
  } finally {
    await safeCloseDevice(device);
    releaseDeviceLock();
  }
};

/**
 * Verzendt een binaire payload (Uint8Array) naar het USB device.
 * Gebruik voor TSPL BITMAP of andere gemixte tekst+binaire protocollen.
 */
export const printBinaryUsbToDevice = async ({
  device,
  payload,
  logMessage,
}: {
  device: USBDevice | null | undefined;
  payload: Uint8Array;
  logMessage?: string;
}) => {
  if (!device) throw new Error("Geen printer verbonden.");
  if (!payload?.length) throw new Error("Geen printinhoud opgegeven.");

  ensureUsbSupport();
  const releaseDeviceLock = await acquireUsbDeviceLock(device);
  try {
    const endpointInfo = await withTimeout(
      prepareDevice(device, { vendorId: device.vendorId, productId: device.productId }),
      USB_PREPARE_TIMEOUT_MS,
      "USB printer voorbereiden duurt te lang (timeout)."
    );

    const transferChunk = async (chunk: Uint8Array) => {
      const result = await withTimeout(
        device.transferOut(endpointInfo.endpointNumber, chunk as unknown as BufferSource),
        USB_IO_TIMEOUT_MS,
        "USB gegevensoverdracht duurt te lang (timeout)."
      );
      if (result.status !== "ok") throw new Error(`USB print mislukt: ${result.status}`);
    };

    if (payload.length <= USB_TRANSFER_CHUNK_SIZE) {
      await transferChunk(payload);
    } else {
      for (let offset = 0; offset < payload.length; offset += USB_TRANSFER_CHUNK_SIZE) {
        await transferChunk(payload.slice(offset, offset + USB_TRANSFER_CHUNK_SIZE));
      }
    }

    // Status check na binaire print — fire-and-forget
    void (async () => {
      await new Promise(r => setTimeout(r, 500));
      const endpointInfo2 = getOutEndpoint(device);
      if (endpointInfo2) {
        const inEp = getInEndpoint(device, endpointInfo2.interfaceNumber, endpointInfo2.alternateSetting);
        if (inEp !== null) {
          const statusResult = await readPrinterStatusUsb(device, endpointInfo2.endpointNumber, inEp, 'print_job');
          if (statusResult) {
            const printerId = String((device as unknown as Record<string, unknown>)?.id ?? '');
            const printerName = String(device.productName ?? 'USB Printer');
            void savePrinterStatusToFirestore(printerId, printerName, statusResult);
          }
        }
      }
    })();

    if (logMessage) {
      try { await logActivity(auth.currentUser?.uid || "system", "PRINT_LABEL", logMessage); }
      catch (e) { console.error("Logging print mislukt:", e); }
    }

    return { productName: device.productName || "Onbekende USB printer", vendorId: device.vendorId, productId: device.productId };
  } catch (err: unknown) {
    throw normalizeUsbError(err);
  } finally {
    await safeCloseDevice(device);
    releaseDeviceLock();
  }
};

export const printRawUsb = async ({
  content,
  printer = {},
  logMessage,
}: {
  content: unknown;
  printer?: UsbPrinterFilterInput;
  logMessage?: string;
}) => {
  if (!content || !String(content).trim()) {
    throw new Error("Geen printinhoud opgegeven.");
  }

  const device = await selectUsbDevice(printer);
  return printRawUsbToDevice({ device, content, logMessage, printer });
};

export const isUsbDirectSupported = (): boolean => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  // Electron (bijv. VS Code ingebouwde browser) crasht bij requestDevice() — knop verbergen.
  if (/Electron/i.test(navigator.userAgent)) return false;
  return !!navigator.usb && !!window.isSecureContext;
};
