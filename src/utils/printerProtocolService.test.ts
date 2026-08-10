import { describe, expect, it } from 'vitest';
import { buildProtocolAwareUsbPayload, buildProtocolAwareUsbProbePayload, buildTsplUsbPayload, normalizePrinterProtocol } from './printerProtocolService';

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

describe('buildTsplUsbPayload', () => {
  it('does not duplicate a TSPL label block when quantity is greater than one', () => {
    const base = [
      'SIZE 90 mm,40 mm',
      'GAP 2 mm,0 mm',
      'CLS',
      'TEXT 20,20,"ARIAL.TTF",0,1,1,"TEST"',
      'PRINT 1,1',
      '',
    ].join('\r\n');

    const payload = buildTsplUsbPayload({
      content: base,
      quantity: 2,
    });

    expect(payload.match(/SIZE 90 mm,40 mm/g) || []).toHaveLength(1);
    expect(payload.match(/CLS/g) || []).toHaveLength(1);
    expect(payload.match(/TEXT 20,20/g) || []).toHaveLength(1);
    expect(payload).toContain('PRINT 2,1');
    expect(payload).not.toContain('PRINT 1,1\r\nSIZE 90 mm,40 mm');
  });
});

describe('buildProtocolAwareUsbPayload', () => {
  it('applies ZPL quantity via a single ^PQ command instead of repeating the full label block', () => {
    const base = [
      '^XA',
      '^CI28',
      '^PW1200',
      '^MMT',
      '^LL600',
      '^FO20,20^FDTEST^FS',
      '^PQ1,0,1,Y',
      '^XZ',
      '',
    ].join('\r\n');

    const payload = buildProtocolAwareUsbPayload({
      printer: {
        driverModel: 'zebra-zm400-203',
        name: 'Zebra ZM400',
      },
      content: base,
      quantity: 3,
    });

    expect(payload.match(/\^XA/g) || []).toHaveLength(1);
    expect(payload.match(/\^FO20,20/g) || []).toHaveLength(1);
    expect(payload).toContain('^PQ3,0,1,Y');
    expect(payload).not.toContain('^PQ1,0,1,Y');
  });
});
