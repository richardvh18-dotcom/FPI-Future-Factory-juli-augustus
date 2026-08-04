import { describe, expect, it } from 'vitest';
import { normalizePrinterProtocol } from './printerProtocolService';

describe('normalizePrinterProtocol', () => {
  it('infers TSPL for Lighthouse printers from the driver profile even when no explicit protocol is stored', () => {
    const printer = {
      driverModel: 'lighthouse-cjpro2',
      name: 'Lighthouse CJ-PRO II',
    };

    expect(normalizePrinterProtocol(printer as never)).toBe('tspl');
  });
});
