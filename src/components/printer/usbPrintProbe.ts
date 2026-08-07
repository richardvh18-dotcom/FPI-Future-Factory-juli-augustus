import { printRawUsbToDevice } from '../utils/usbPrintService';
import { buildProtocolAwareUsbProbePayload } from '../utils/printerProtocolService';

export const probeUsbPrint = async (device: USBDevice | null | undefined, printer?: Record<string, unknown> | null) => {
  if (!device) throw new Error('Geen USB-device beschikbaar.');
  const payload = buildProtocolAwareUsbProbePayload(printer || null);
  return printRawUsbToDevice({ device, content: payload, logMessage: 'USB probe' });
};
