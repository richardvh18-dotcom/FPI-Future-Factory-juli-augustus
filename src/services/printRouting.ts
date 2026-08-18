export type PrintTransport = 'queue' | 'usb';

export const LABELS_PRINTING_QUEUE_STATION = 'Labels Printing';

const normalizeQueueStationKey = (value: unknown): string =>
  {
    const compact = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/^40(?=BH|BM|BA)/, '');

    // Legacy alias op de vloer: BM18/40BM18 is functioneel BH18.
    if (compact === 'BM18') return 'BH18';

    return compact;
  };

export const resolvePrintTransport = ({
  activeQueuePrinterId,
  usbDevice,
}: {
  activeQueuePrinterId?: string | null;
  usbDevice?: USBDevice | null;
}): PrintTransport => {
  if (activeQueuePrinterId) {
    return 'queue';
  }

  return usbDevice ? 'usb' : 'usb';
};

export { normalizeQueueStationKey };

export const isLabelsPrintingStation = (value: unknown): boolean => {
  const key = normalizeQueueStationKey(value);
  return key === 'LABELSPRINTING' || key === 'LABELSPRINTING' || key === 'LABELSPRINTINGQUEUESTATION';
};
