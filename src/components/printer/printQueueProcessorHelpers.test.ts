import { describe, expect, it } from 'vitest';
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
});
