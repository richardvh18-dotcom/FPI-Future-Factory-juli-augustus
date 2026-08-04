export type QueuePrinterConfig = {
  id: string;
  vendorId?: number | string;
  productId?: number | string;
  name?: string;
  queueStations?: unknown[];
  linkedStations?: unknown[];
};

export type QueueJobLike = {
  printerId?: string | null;
  metadata?: Record<string, unknown>;
  machineId?: unknown;
  stationId?: unknown;
  currentStation?: unknown;
  machine?: unknown;
};

const normalizeStationKey = (value: unknown): string =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^40(?=BH|BM|BA)/, '');

const stationNameFromValue = (stationValue: unknown): string => {
  if (!stationValue) return '';
  if (typeof stationValue === 'string') return stationValue.trim();
  if (typeof stationValue === 'object') {
    const stationObj = stationValue as Record<string, unknown>;
    return String(
      stationObj.name || stationObj.station || stationObj.id || stationObj.code || ''
    ).trim();
  }
  return String(stationValue).trim();
};

const getPrinterStationKeys = (printer: QueuePrinterConfig | null | undefined): string[] => {
  if (!printer) return [];
  const stations = Array.isArray(printer.queueStations)
    ? printer.queueStations
    : (printer.linkedStations || []);

  return Array.from(new Set(
    stations
      .map(stationNameFromValue)
      .map(normalizeStationKey)
      .filter(Boolean)
  ));
};

const getJobStationKeys = (job: QueueJobLike | null | undefined): string[] => {
  const metadata = (job?.metadata || {}) as Record<string, unknown>;
  const candidates = [
    metadata.stationId,
    metadata.station,
    metadata.currentStation,
    metadata.targetStation,
    metadata.targetStationId,
    metadata.machineId,
    metadata.machine,
    job?.machineId,
    job?.stationId,
    job?.currentStation,
    job?.machine,
  ];

  return Array.from(new Set(
    candidates
      .map((value) => normalizeStationKey(stationNameFromValue(value)))
      .filter(Boolean)
  ));
};

const printerMatchesAnyStation = (
  printer: QueuePrinterConfig | null | undefined,
  stationKeys: string[]
): boolean => {
  if (!printer || stationKeys.length === 0) return false;
  const printerStationKeys = getPrinterStationKeys(printer);
  return printerStationKeys.some((printerKey) => stationKeys.includes(printerKey));
};

export const getPrinterForQueueJob = (
  job: QueueJobLike | null | undefined,
  currentPrinter: QueuePrinterConfig | null | undefined,
  printers: QueuePrinterConfig[] = []
): QueuePrinterConfig | null => {
  const jobPrinterId = String(job?.printerId || '').trim();
  if (jobPrinterId) {
    const explicitMatch = printers.find(
      (printer) => String(printer?.id || '').trim() === jobPrinterId
    );
    if (explicitMatch) return explicitMatch;
  }

  const jobStationKeys = getJobStationKeys(job);
  if (jobStationKeys.length > 0) {
    if (printerMatchesAnyStation(currentPrinter, jobStationKeys)) {
      return currentPrinter;
    }

    const matchingPrinter = printers.find((printer) => printerMatchesAnyStation(printer, jobStationKeys));
    if (matchingPrinter) {
      return matchingPrinter;
    }
  }

  return currentPrinter || null;
};
