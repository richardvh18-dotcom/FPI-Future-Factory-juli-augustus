import { buildWm18ProgramDefinition } from './wm18ProgramCatalogService';

export type Wm18CatalogItem = {
  articleNumber: string;
  id: string;
  itemCode: string;
  productCode: string;
  articleCode: string;
  planningLookupCodes: string[];
  diameterMm: number | null;
  mofType: string;
  series: string;
  pressureClass: string | null;
  angleDeg: number | null;
  radiusMm: number | null;
  productFamily: 'elbow' | 'coupler' | 'tee' | 'other';
  description?: string;
};

export type Wm18ProgramTemplate = {
  id: string;
  name: string;
  description?: string;
  definition: ReturnType<typeof buildWm18ProgramDefinition>;
};

export type ParsedWm18Workbook = {
  catalogItems: Wm18CatalogItem[];
  programTemplates: Wm18ProgramTemplate[];
  sourceFileName: string;
};

const normalizeProductFamily = (value?: string | null): Wm18CatalogItem['productFamily'] => {
  const normalized = String(value || 'elbow').trim().toLowerCase();
  if (normalized === 'coupler') return 'coupler';
  if (normalized === 'tee') return 'tee';
  return 'elbow';
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9,.-]/g, '').replace(',', '.').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseRadius = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const match = value.match(/([0-9]+(?:[.,][0-9]+)?)/);
    if (match) {
      const parsed = Number(match[1].replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return parseNumber(value);
};

const normalizeHeaderName = (value: unknown): string => String(value ?? '').replace(/[^a-z0-9]+/gi, '').toLowerCase();

const getRowValue = (row: Array<unknown>, headers: Array<unknown>, candidateNames: string[]): unknown => {
  for (const candidateName of candidateNames) {
    const normalizedCandidate = normalizeHeaderName(candidateName);
    const index = headers.findIndex((header) => normalizeHeaderName(header) === normalizedCandidate);
    if (index >= 0) {
      return row[index];
    }
  }

  return undefined;
};

const looksLikeArticleCode = (value: string): boolean => Boolean(value) && /^[A-Za-z0-9._-]{3,}$/.test(value) && !/\s/.test(value);

const buildPlanningLookupCodes = (articleNumber: string): string[] => {
  const normalized = String(articleNumber || '').trim().toUpperCase();
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  const lookupCodes = new Set<string>();

  if (normalized) lookupCodes.add(normalized);
  if (compact) lookupCodes.add(compact);
  if (normalized.includes('-')) lookupCodes.add(normalized.replace(/-/g, ''));
  if (normalized.includes('_')) lookupCodes.add(normalized.replace(/_/g, ''));
  if (normalized.length > 6) lookupCodes.add(normalized.slice(0, 12));

  return [...lookupCodes].filter(Boolean);
};

export const parseWm18Workbook = async (buffer: ArrayBuffer | Uint8Array | Buffer, sourceFileName: string): Promise<ParsedWm18Workbook> => {
  const workbookBuffer = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

  const workbook = await import('xlsx');
  const workbookInstance = workbook.read(workbookBuffer, { type: 'array' });
  const productSheet = workbookInstance.Sheets['S2_Productgegevens'];
  const programSheet = workbookInstance.Sheets['S3_Programma'];

  const productRows = workbook.utils.sheet_to_json(productSheet, { header: 1, defval: '' }) as Array<Array<unknown>>;
  const headerRowIndex = productRows.findIndex((row) => row.some((cell) => String(cell ?? '').trim().toUpperCase() === 'ARTIKELNUMMER'));
  const headers = headerRowIndex >= 0 ? productRows[headerRowIndex] : [];
  const catalogItems: Wm18CatalogItem[] = [];

  for (const row of productRows.slice(headerRowIndex + 1)) {
    const articleNumber = String(getRowValue(row, headers, ['ARTIKELNUMMER', 'ID']) ?? '').trim();
    if (!looksLikeArticleCode(articleNumber)) {
      continue;
    }

    const diameter = parseNumber(getRowValue(row, headers, ['ID', 'Diameter', '(mm)']));
    const pressureClass = String(getRowValue(row, headers, ['PN', 'Drukklasse']) ?? '').trim() || null;
    const angle = parseNumber(getRowValue(row, headers, ['HOEK', 'Hoek']));
    const radius = parseRadius(getRowValue(row, headers, ['Radius']));
    const mofType = String(getRowValue(row, headers, ['Mof', 'MOF']) ?? 'TB').trim().toUpperCase();
    const series = String(getRowValue(row, headers, ['SERIE']) ?? 'EST').trim().toUpperCase();
    const planningLookupCodes = buildPlanningLookupCodes(articleNumber);

    catalogItems.push({
      articleNumber,
      id: articleNumber,
      itemCode: articleNumber,
      productCode: articleNumber,
      articleCode: articleNumber,
      planningLookupCodes,
      diameterMm: diameter,
      mofType,
      series,
      pressureClass,
      angleDeg: angle,
      radiusMm: radius,
      productFamily: normalizeProductFamily(String(getRowValue(row, headers, ['Productfamilie']) ?? 'elbow')),
      description: `Import uit ${sourceFileName}`,
    });

    if (catalogItems.length >= 50) {
      break;
    }
  }

  const programRows = workbook.utils.sheet_to_json(programSheet, { header: 1, defval: '' }) as Array<Array<unknown>>;
  const programTemplates: Wm18ProgramTemplate[] = [];

  for (const row of programRows) {
    const robtargetLine = row.find((cell) => typeof cell === 'string' && cell.includes('VAR robtarget'));
    if (!robtargetLine) {
      continue;
    }

    const templateName = `programma-${programTemplates.length + 1}`;
    const definition = buildWm18ProgramDefinition({
      productFamily: 'elbow',
      mofType: catalogItems[programTemplates.length]?.mofType || 'TB',
      series: catalogItems[programTemplates.length]?.series || 'EST',
      diameterMm: catalogItems[programTemplates.length]?.diameterMm ?? 300,
      pressureClass: catalogItems[programTemplates.length]?.pressureClass || 'PN16',
      angleDeg: catalogItems[programTemplates.length]?.angleDeg ?? 90,
      radiusMm: catalogItems[programTemplates.length]?.radiusMm ?? 1.5,
      description: String(robtargetLine),
      sourceFileName,
    });

    programTemplates.push({
      id: templateName,
      name: templateName,
      description: String(robtargetLine),
      definition,
    });

    if (programTemplates.length >= 20) {
      break;
    }
  }

  return {
    catalogItems,
    programTemplates,
    sourceFileName,
  };
};
