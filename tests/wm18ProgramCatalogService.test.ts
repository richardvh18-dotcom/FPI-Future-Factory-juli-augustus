import { describe, expect, it } from 'vitest';

import { buildWm18ProgramDefinition, getWm18CatalogDefaults } from '../src/services/wm18ProgramCatalogService';

describe('wm18ProgramCatalogService', () => {
  it('builds a structured WM18 definition from workbook-style product choices', () => {
    const definition = buildWm18ProgramDefinition({
      productFamily: 'elbow',
      mofType: 'TB',
      series: 'EST',
      diameterMm: 300,
      pressureClass: 'PN16',
      angleDeg: 45,
      radiusMm: 1.5,
      description: 'Nieuw',
      sourceFileName: 'WM18_Rekenprogramma_versie_12.xlsm',
    });

    expect(definition.productFamily).toBe('elbow');
    expect(definition.mofType).toBe('TB');
    expect(definition.series).toBe('EST');
    expect(definition.diameterMm).toBe(300);
    expect(definition.pressureClass).toBe('PN16');
    expect(definition.angleDeg).toBe(45);
    expect(definition.radiusMm).toBe(1.5);
    expect(definition.status).toBe('ready-for-bh18');
  });

  it('provides workbook-style defaults for menus and product choices', () => {
    const defaults = getWm18CatalogDefaults();

    expect(defaults.productFamilies).toContain('elbow');
    expect(defaults.mofTypes).toContain('TB');
    expect(defaults.series).toContain('EST');
    expect(defaults.angles).toContain(90);
    expect(defaults.pressureClasses).toContain('PN16');
  });
});
