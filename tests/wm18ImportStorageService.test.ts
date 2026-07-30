import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildLocalWm18ImportRecord,
  loadLocalWm18Imports,
  removeLocalWm18Import,
  saveLocalWm18Import,
} from '../src/services/wm18ImportStorageService';

describe('wm18ImportStorageService', () => {
  beforeEach(() => {
    localStorage.clear();
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
    expect(loaded[0].fileDataUri).toContain('data:application');

    await removeLocalWm18Import(record.id);
    expect(await loadLocalWm18Imports()).toHaveLength(0);
  });
});
