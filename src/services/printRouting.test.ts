import { describe, expect, it } from 'vitest';
import { resolvePrintTransport } from './printRouting';

describe('resolvePrintTransport', () => {
  it('prefers queue printing when a queue printer is configured', () => {
    expect(resolvePrintTransport({ activeQueuePrinterId: 'BH18-QUEUE', usbDevice: {} as USBDevice })).toBe('queue');
  });

  it('falls back to direct USB when no queue printer is configured', () => {
    expect(resolvePrintTransport({ activeQueuePrinterId: '', usbDevice: {} as USBDevice })).toBe('usb');
  });
});
