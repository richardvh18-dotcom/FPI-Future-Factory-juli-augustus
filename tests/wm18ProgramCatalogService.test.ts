import { describe, it, expect, vi } from 'vitest';
import { getWm18CatalogItemByArticleNumber } from '../src/services/wm18ProgramCatalogService';

vi.mock('../src/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  logActivity: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
}));

vi.mock('../src/utils/conversionLogic', () => ({
  lookupProductByManufacturedId: vi.fn().mockImplementation(async (_, code) => {
    if (code === 'NEW_CODE_123') {
      return {
        manufacturedId: 'OLD_CODE_456',
        targetProductId: 'NEW_CODE_123',
      };
    }
    return null;
  }),
}));

describe('wm18ProgramCatalogService', () => {
  it('returns null if item is not found anywhere', async () => {
    const item = await getWm18CatalogItemByArticleNumber('UNKNOWN_CODE');
    expect(item).toBeNull();
  });
});
