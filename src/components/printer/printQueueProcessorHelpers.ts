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

  return currentPrinter || null;
};
