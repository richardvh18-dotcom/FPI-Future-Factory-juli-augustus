import { describe, expect, it } from 'vitest';
import { buildProtocolAwareUsbProbePayload, normalizePrinterProtocol } from './printerProtocolService';

describe('normalizePrinterProtocol', () => {
  it('infers TSPL for Lighthouse printers from the driver profile even when no explicit protocol is stored', () => {
    const printer = {
      driverModel: 'lighthouse-cjpro2',
      name: 'Lighthouse CJ-PRO II',
    };

    expect(normalizePrinterProtocol(printer as never)).toBe('tspl');
  });
});

describe('buildProtocolAwareUsbProbePayload', () => {
  it('builds a TSPL probe payload for Lighthouse printers', () => {
    const printer = {
      driverModel: 'lighthouse-cjpro2',
      name: 'Lighthouse CJ-PRO II',
    };

    const payload = buildProtocolAwareUsbProbePayload(printer as never);

    expect(payload).toContain('TEXT 20,20');
    expect(payload).toContain('TEST-USB-PROBE');
    expect(payload).not.toContain('^XA');
  });

  it('builds a ZPL probe payload for Zebra printers', () => {
    const printer = {
      driverModel: 'zebra-zm400-203',
      name: 'Zebra ZM400',
    };

    const payload = buildProtocolAwareUsbProbePayload(printer as never);

    expect(payload).toContain('^XA');
    expect(payload).toContain('TEST-USB-PROBE');
  });
});
