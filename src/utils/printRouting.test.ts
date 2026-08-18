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

  it('uses a BH18 persisted binding when the context station is 40BM18', () => {
    const boundPrinter = { id: 'bound-printer', name: 'Bound Printer', queueStations: ['BH18'] };
    const fallbackPrinter = { id: 'fallback-printer', name: 'Lighthouse Lossen', queueStations: ['BH18'] };

    localStorage.setItem('print_station_printer_bindings_v1', JSON.stringify({ BH18: 'bound-printer' }));

    const result = resolvePrinterForRouting([fallbackPrinter, boundPrinter], {
      stationId: '40BM18',
      routeKey: 'STATION:40BM18',
    });

    expect(result?.id).toBe('bound-printer');
  });

  it('prefers an active station rule over a stale local binding', () => {
    const lighthousePrinter = {
      id: 'lighthouse-lossen',
      name: 'Lighthouse Lossen',
      queueStations: ['BH18'],
    };
    const zebraPrinter = {
      id: 'zebra-zm400-pilot',
      name: 'Zebra ZM400 Pilot',
      queueStations: ['GENERAL'],
    };

    localStorage.setItem(
      'print_station_printer_bindings_v1',
      JSON.stringify({ BH18: 'lighthouse-lossen' })
    );

    const result = resolvePrinterForRouting([lighthousePrinter, zebraPrinter], {
      stationId: 'BH18',
    }, [
      {
        id: 'bh18-rule',
        conditionType: 'station',
        operator: 'equals',
        conditionValue: 'BH18',
        targetPrinter: 'zebra-zm400-pilot',
        isActive: true,
      },
    ]);

    expect(result?.id).toBe('zebra-zm400-pilot');
  });
});
