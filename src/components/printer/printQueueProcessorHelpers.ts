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
      .filter(Boolean)
      .flatMap((value) => String(value).split(','))
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

const normalizeQueueJobStationContext = (job: QueueJobLike | null | undefined): string[] => {
  const stationKeys = getJobStationKeys(job);
  if (stationKeys.length > 0) return stationKeys;

  const metadata = (job?.metadata || {}) as Record<string, unknown>;
  const explicitStation = String(metadata?.stationId || metadata?.station || '').trim();
  if (explicitStation) {
    return [normalizeStationKey(explicitStation)];
  }

  return [];
};

export const isQueueJobAllowedForPrinter = (
  job: QueueJobLike | null | undefined,
  printer: QueuePrinterConfig | null | undefined
): boolean => {
  if (!printer) return false;

  const jobPrinterId = String(job?.printerId || '').trim();
  if (jobPrinterId) {
    const printerId = String(printer.id || '').trim();
    if (printerId && printerId === jobPrinterId) {
      return true;
    }
  }

  const jobStationKeys = normalizeQueueJobStationContext(job);
  if (jobStationKeys.length === 0) {
    return false;
  }

  const printerStationKeys = getPrinterStationKeys(printer);
  return printerStationKeys.some((printerKey) => jobStationKeys.includes(printerKey));
};

export const getPreferredQueuePrinterForContext = (
  printers: QueuePrinterConfig[] = [],
  context: { stationId?: unknown; preferLabelsQueue?: boolean } = {}
): QueuePrinterConfig | null => {
  if (!Array.isArray(printers) || printers.length === 0) return null;

  const stationKey = normalizeStationKey(String(context.stationId || ''));
  const preferLabelsQueue = Boolean(context.preferLabelsQueue);

  const labelsQueuePrinter = printers.find((printer) => {
    const printerStationKeys = getPrinterStationKeys(printer);
    return printerStationKeys.includes('LABELSPRINTING');
  });

  if (preferLabelsQueue && labelsQueuePrinter) {
    return labelsQueuePrinter;
  }

  if (stationKey && labelsQueuePrinter) {
    const stationMatchesLabelsQueue = stationKey === 'LABELSPRINTING';
    if (stationMatchesLabelsQueue) {
      return labelsQueuePrinter;
    }
  }

  return null;
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

  const preferredLabelsPrinter = getPreferredQueuePrinterForContext(printers, {
    stationId: job?.metadata?.stationId || job?.stationId || job?.currentStation || job?.machineId,
    preferLabelsQueue: true,
  });
  if (preferredLabelsPrinter) {
    const jobStationKeys = getJobStationKeys(job);
    if (jobStationKeys.length === 0 || jobStationKeys.includes('LABELSPRINTING')) {
      return preferredLabelsPrinter;
    }
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

  // Als er geen expliciete printer of station-metadata aanwezig is, blijf veilig bij de huidige printer.
  return currentPrinter || null;
};
