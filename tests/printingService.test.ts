import { beforeEach, describe, expect, it, vi } from 'vitest';

const scopedSetMock = vi.fn();
const rootSetMock = vi.fn();
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockServerTimestamp = vi.fn(() => 'server-ts');

vi.mock('../functions/src/config/dbPaths', () => ({
  DB_PATHS: {
    PRINT_QUEUE: 'future-factory/production/print_queue',
  },
}));

describe('queuePrintJobService', () => {
  beforeEach(() => {
    scopedSetMock.mockReset();
    rootSetMock.mockReset();
    mockCollection.mockReset();
    mockDoc.mockReset();
    mockServerTimestamp.mockReset();
    mockServerTimestamp.mockReturnValue('server-ts');

    const collectionRef = {
      doc: vi.fn(() => ({
        id: 'root-job-id',
        set: rootSetMock,
        path: 'future-factory/production/print_queue/root-job-id',
      })),
    };

    mockCollection.mockImplementation(() => collectionRef);
    mockDoc.mockImplementation((path: string) => {
      if (path.includes('/items/')) {
        return {
          id: 'scoped-job-id',
          set: scopedSetMock.mockRejectedValueOnce(new Error('scoped write failed')),
          path,
        };
      }

      return {
        id: 'root-job-id',
        set: rootSetMock,
        path,
      };
    });
  });

  it('falls back to a root-level queue document when the scoped write fails', async () => {
    const { queuePrintJobService } = await import('../functions/src/services/printingService.ts');

    const jobId = await queuePrintJobService('PRINTER-1', 'ZPL', {
      orderId: 'ORD-1',
      quantity: 2,
    }, {
      auth: { uid: 'user-1', token: { email: 'user@example.com' } },
    }, {
      db: {
        collection: mockCollection,
        doc: mockDoc,
      },
      admin: {
        firestore: {
          FieldValue: {
            serverTimestamp: mockServerTimestamp,
          },
        },
      },
      dbPaths: {
        PRINT_QUEUE: 'future-factory/production/print_queue',
      },
    });

    expect(jobId).toBe('root-job-id');
    expect(scopedSetMock).toHaveBeenCalledTimes(1);
    expect(rootSetMock).toHaveBeenCalledTimes(1);
  });
});
