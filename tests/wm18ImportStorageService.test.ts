import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildLocalWm18ImportRecord,
  buildWm18ImportDocumentId,
  isWm18StorageFallbackError,
  loadLocalWm18Imports,
  removeLocalWm18Import,
  saveLocalWm18Import,
} from '../src/services/wm18ImportStorageService';

describe('wm18ImportStorageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('treats generic storage upload failures as fallback-worthy', () => {
    const error = {
      code: 'storage/quota-exceeded',
      message: 'Quota exceeded for bucket',
    };

    expect(isWm18StorageFallbackError(error)).toBe(true);
  });

  it('does not persist the full Excel file content in fallback storage', async () => {
    const record = buildLocalWm18ImportRecord({
      fileName: 'WM18_Rekenprogramma_versie_12.xlsm',
      notes: 'Fallback import',
      category: 'WM18',
      sourceFileName: 'WM18_Rekenprogramma_versie_12.xlsm',
      fileDataUri: 'data:application/vnd.ms-excel;base64,abc123',
    });

    await saveLocalWm18Import(record);
    const loaded = await loadLocalWm18Imports();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].fileDataUri).toBeUndefined();
  });

  it('stores and loads imports locally without Firebase dependencies', async () => {
    const record = buildLocalWm18ImportRecord({
      fileName: 'WM18_Rekenprogramma_versie_12.xlsm',
      notes: 'Fallback import',
      category: 'WM18',
      sourceFileName: 'WM18_Rekenprogramma_versie_12.xlsm',
      fileDataUri: 'data:application/vnd.ms-excel;base64,abc123',
    });

    await saveLocalWm18Import(record);
    const loaded = await loadLocalWm18Imports();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].fileName).toBe('WM18_Rekenprogramma_versie_12.xlsm');
    expect(loaded[0].source).toBe('wm18-robot-import-local');
    expect(loaded[0].fileDataUri).toBeUndefined();

    await removeLocalWm18Import(record.id);
    expect(await loadLocalWm18Imports()).toHaveLength(0);
  });

  it('generates a stable internal document id instead of using the raw file name', () => {
    const documentId = buildWm18ImportDocumentId('WM18_Rekenprogramma_versie_12.xlsm');

    expect(documentId).toContain('wm18-import');
    expect(documentId).not.toBe('WM18_Rekenprogramma_versie_12.xlsm');
  });
});
