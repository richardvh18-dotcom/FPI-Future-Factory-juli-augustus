import { describe, expect, it } from 'vitest';
import { LABELS_PRINTING_QUEUE_STATION } from '../../services/printRouting';
import { getPreferredQueuePrinterForContext, getPrinterForQueueJob, isQueueJobAllowedForPrinter } from './printQueueProcessorHelpers';

describe('getPrinterForQueueJob', () => {
  it('prefers the printer explicitly attached to the queue job', () => {
    const printers = [
      { id: 'printer-a', name: 'Printer A' },
      { id: 'printer-b', name: 'Printer B' },
    ];

    const result = getPrinterForQueueJob(
      { printerId: 'printer-b' },
      printers[0],
      printers
    );

    expect(result?.id).toBe('printer-b');
  });

  it('falls back to the current printer when no explicit printer is attached', () => {
    const printers = [{ id: 'printer-a', name: 'Printer A' }];

    const result = getPrinterForQueueJob({ printerId: '' }, printers[0], printers);

    expect(result?.id).toBe('printer-a');
  });

  it('prefers a printer configured for Labels Printing when the job targets that station', () => {
    const currentPrinter = { id: 'printer-a', name: 'Printer A', queueStations: ['BH18'] };
    const labelsPrinter = {
      id: 'printer-b',
      name: 'Printer B',
      queueStations: [LABELS_PRINTING_QUEUE_STATION],
    };

    const result = getPrinterForQueueJob(
      { metadata: { stationId: LABELS_PRINTING_QUEUE_STATION } },
      currentPrinter,
      [currentPrinter, labelsPrinter]
    );

    expect(result?.id).toBe('printer-b');
  });

  it('allows an explicitly targeted printer even when the station keys do not match', () => {
    const targetPrinter = { id: 'printer-b', name: 'Lighthouse Lossen', queueStations: ['BH31', 'BM01', 'LOSSEN'] };
    const job = {
      printerId: 'printer-b',
      metadata: { stationId: 'LABELSPRINTING' },
    };

    expect(isQueueJobAllowedForPrinter(job, targetPrinter)).toBe(true);
  });

  it('prefers the labels-printing queue printer for label actions even when a station binding points elsewhere', () => {
    const bm01Printer = { id: 'printer-a', name: 'Lighthouse Lossen', queueStations: ['BM01'] };
    const labelsPrinter = {
      id: 'printer-b',
      name: 'Zebra ZM400 Pilot',
      queueStations: [LABELS_PRINTING_QUEUE_STATION],
    };

    const result = getPreferredQueuePrinterForContext([bm01Printer, labelsPrinter], {
      stationId: 'BM01',
      preferLabelsQueue: true,
    });

    expect(result?.id).toBe('printer-b');
  });
});
