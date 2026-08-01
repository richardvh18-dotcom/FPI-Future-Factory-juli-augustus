import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { parseWm18Workbook } from '../src/services/wm18CatalogImportService';

describe('wm18CatalogImportService', () => {
  it('parses the WM18 workbook into a structured catalog and program templates', async () => {
    const workbookPath = resolve(process.cwd(), 'Tijdelijke Bestanden/Excel/WM18_Rekenprogramma_versie_12.xlsm');
    const workbookBuffer = readFileSync(workbookPath);

    const result = await parseWm18Workbook(workbookBuffer, 'WM18_Rekenprogramma_versie_12.xlsm');

    expect(result.catalogItems.length).toBeGreaterThan(0);
    expect(result.programTemplates.length).toBeGreaterThan(0);
    expect(result.catalogItems[0]).toMatchObject({
      articleNumber: expect.any(String),
      itemCode: expect.any(String),
      productCode: expect.any(String),
      articleCode: expect.any(String),
      planningLookupCodes: expect.any(Array),
      mofType: expect.any(String),
      series: expect.any(String),
    });
    expect(result.catalogItems[0].planningLookupCodes?.length).toBeGreaterThan(0);
  });
});
