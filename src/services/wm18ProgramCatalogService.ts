export type Wm18ProgramDefinition = {
  productFamily: 'elbow' | 'coupler' | 'tee' | 'other';
  mofType: 'TB' | 'CB' | string;
  series: string;
  diameterMm: number | null;
  pressureClass: string;
  angleDeg: number | null;
  radiusMm: number | null;
  description?: string;
  sourceFileName?: string;
  sourceSheet?: string;
  status: 'draft' | 'ready-for-bh18' | 'ready-for-gateway';
  generatedAt: string;
};

export type Wm18CatalogDefaults = {
  productFamilies: string[];
  mofTypes: string[];
  series: string[];
  pressureClasses: string[];
  angles: number[];
  diameters: number[];
  radiusOptions: number[];
};

export const getWm18CatalogDefaults = (): Wm18CatalogDefaults => ({
  productFamilies: ['elbow', 'coupler', 'tee', 'other'],
  mofTypes: ['TB', 'CB'],
  series: ['EST', 'FIBERMAR', 'OTHER'],
  pressureClasses: ['PN08', 'PN10', 'PN12.5', 'PN16', 'PN20', 'PN25', 'PN32', 'PN40', 'PN50'],
  angles: [3, 6, 9, 11.25, 15, 22.5, 30, 45, 60, 90],
  diameters: [25, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600],
  radiusOptions: [1, 1.5, 2],
});

export const buildWm18ProgramDefinition = ({
  productFamily,
  mofType,
  series,
  diameterMm,
  pressureClass,
  angleDeg,
  radiusMm,
  description,
  sourceFileName,
  sourceSheet = 'S8_Aanpassingsformulier',
  generatedAt = new Date().toISOString(),
}: {
  productFamily?: string | null;
  mofType?: string | null;
  series?: string | null;
  diameterMm?: string | number | null;
  pressureClass?: string | null;
  angleDeg?: string | number | null;
  radiusMm?: string | number | null;
  description?: string | null;
  sourceFileName?: string | null;
  sourceSheet?: string;
  generatedAt?: string;
}): Wm18ProgramDefinition => {
  const normalizedFamily = String(productFamily || 'elbow').trim().toLowerCase();
  const normalizedMofType = String(mofType || 'TB').trim().toUpperCase();
  const normalizedSeries = String(series || 'EST').trim().toUpperCase();
  const normalizedPressureClass = String(pressureClass || 'PN16').trim().toUpperCase();

  const diameter = Number(diameterMm);
  const angle = Number(angleDeg);
  const radius = Number(radiusMm);

  return {
    productFamily: ['elbow', 'coupler', 'tee', 'other'].includes(normalizedFamily) ? normalizedFamily as Wm18ProgramDefinition['productFamily'] : 'other',
    mofType: normalizedMofType || 'TB',
    series: normalizedSeries || 'EST',
    diameterMm: Number.isFinite(diameter) ? diameter : null,
    pressureClass: normalizedPressureClass || 'PN16',
    angleDeg: Number.isFinite(angle) ? angle : null,
    radiusMm: Number.isFinite(radius) ? radius : null,
    description: description?.trim() || 'Nieuw uit WM18 rekenprogramma',
    sourceFileName: sourceFileName?.trim() || 'WM18_Rekenprogramma_versie_12.xlsm',
    sourceSheet,
    status: 'ready-for-bh18',
    generatedAt,
  };
};
