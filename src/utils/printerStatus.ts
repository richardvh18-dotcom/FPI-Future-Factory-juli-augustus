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
