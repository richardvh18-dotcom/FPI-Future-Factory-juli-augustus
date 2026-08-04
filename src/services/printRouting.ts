export type PrintTransport = 'queue' | 'usb';

export const LABELS_PRINTING_QUEUE_STATION = 'Labels Printing';

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
