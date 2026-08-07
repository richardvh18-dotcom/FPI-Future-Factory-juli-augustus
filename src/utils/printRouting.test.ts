import { beforeEach, describe, expect, it } from 'vitest';
import { resolvePrinterForRouting } from './printRouting';

describe('resolvePrinterForRouting', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('prefers the persisted station binding over a generic routing match', () => {
    const boundPrinter = { id: 'bound-printer', name: 'Bound Printer', queueStations: ['BH18'] };
    const fallbackPrinter = { id: 'fallback-printer', name: 'Lighthouse Lossen', queueStations: ['BH18'] };

    localStorage.setItem('print_station_printer_bindings_v1', JSON.stringify({ BH18: 'bound-printer' }));

    const result = resolvePrinterForRouting([fallbackPrinter, boundPrinter], {
      stationId: 'BH18',
      routeKey: 'BH18',
    });

    expect(result?.id).toBe('bound-printer');
  });
});
