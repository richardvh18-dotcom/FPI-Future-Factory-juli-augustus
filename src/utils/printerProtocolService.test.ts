import { describe, expect, it } from 'vitest';
import { buildProtocolAwareUsbPayload, buildProtocolAwareUsbProbePayload, buildTsplUsbPayload, normalizePrinterProtocol } from './printerProtocolService';
import { getDriver, resolvePrinterDpi } from './printerDrivers';

describe('normalizePrinterProtocol', () => {
  it('infers ZPL/PPLZ for Lighthouse printers from the driver profile when no explicit protocol is stored', () => {
    const printer = {
      driverModel: 'lighthouse-cjpro2',
      name: 'Lighthouse CJ-PRO II',
    };

    expect(normalizePrinterProtocol(printer as never)).toBe('zpl');
  });

  it('uses the Lighthouse hardware width of 719 dots for a 90 mm label at 203 DPI', () => {
    const driver = getDriver({ driverModel: 'lighthouse-cjpro2' });

    expect(driver.nativeDpi).toBe(203);
    expect(Math.round((90 / 25.4) * driver.nativeDpi)).toBe(719);
  });

  it('keeps Lighthouse at 203 DPI when a stale 300 DPI value is stored', () => {
    expect(resolvePrinterDpi({
      driverModel: 'lighthouse-cjpro2',
      name: 'Printer Lostafel',
      dpi: 300,
    })).toBe(203);
  });

  it('recognizes legacy Lighthouse printer IDs without a Lighthouse name', () => {
    const printer = {
      id: 'lighthouseprinter',
      name: 'Printer Lostafel',
      dpi: 300,
    };

    expect(getDriver(printer).id).toBe('lighthouse-cjpro2');
    expect(resolvePrinterDpi(printer)).toBe(203);
  });
});

describe('buildProtocolAwareUsbProbePayload', () => {
  it('builds a ZPL probe payload for Lighthouse printers', () => {
    const printer = {
      driverModel: 'lighthouse-cjpro2',
      name: 'Lighthouse CJ-PRO II',
    };

    const payload = buildProtocolAwareUsbProbePayload(printer as never);

    expect(payload).toContain('^XA');
    expect(payload).toContain('TEST-USB-PROBE');
    expect(payload).not.toContain('TEXT 20,20');
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
  it('keeps ordinary labels cutting after each copy instead of cutting only after the full batch', () => {
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

    expect(payload.match(/\^XA/g) || []).toHaveLength(3);
    expect(payload.match(/\^FO20,20/g) || []).toHaveLength(3);
    expect(payload).toContain('^PQ1,0,1,Y');
    expect(payload.match(/\^PQ1,0,1,Y/g) || []).toHaveLength(3);
    expect(payload.match(/~JK/gi) || []).toHaveLength(2);
    expect(payload).not.toContain('^PQ3,0,1,Y');
  });
});
