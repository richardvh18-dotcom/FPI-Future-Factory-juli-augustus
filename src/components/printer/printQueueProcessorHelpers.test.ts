import { describe, expect, it } from 'vitest';
import { LABELS_PRINTING_QUEUE_STATION } from '../../services/printRouting';
import { getPrinterForQueueJob } from './printQueueProcessorHelpers';

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
});
