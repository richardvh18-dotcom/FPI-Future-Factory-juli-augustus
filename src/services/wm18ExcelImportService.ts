import * as XLSX from 'xlsx';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Wm18CatalogItem, Wm18OperatorAdjustment, Wm186DTarget } from '../types/wm18Types';
import { calculateWm18Item } from './wm18CalculationEngine';

export interface Wm18ImportResult {
  catalogCount: number;
  adjustmentsCount: number;
  fileName: string;
  importedAt: string;
  isFallback?: boolean;
}

const CATALOG_COLLECTION = 'future-factory/data/wm18_catalog';
const ADJUSTMENTS_COLLECTION = 'future-factory/data/wm18_adjustments';

const parseRawTarget = (rawVal: unknown, defaultTarget: Wm186DTarget): Wm186DTarget => {
  if (!rawVal) return defaultTarget;
  const str = String(rawVal).trim();
  const coordsMatch = str.match(/\[\[([\d.-]+),([\d.-]+),([\d.-]+)\]/);
  const asconfMatch = str.match(/(\[-?\d+,-?\d+,-?\d+,\d+\])/);

  if (coordsMatch) {
    return {
      x: parseFloat(coordsMatch[1]) || defaultTarget.x,
      y: parseFloat(coordsMatch[2]) || defaultTarget.y,
      z: parseFloat(coordsMatch[3]) || defaultTarget.z,
      rx: defaultTarget.rx,
      ry: defaultTarget.ry,
      rz: defaultTarget.rz,
      asconf: asconfMatch ? asconfMatch[1] : defaultTarget.asconf,
    };
  }
  return defaultTarget;
};

export const parseAndImportWm18Workbook = async (
  fileBuffer: ArrayBuffer,
  fileName: string,
  onProgress?: (progressPercent: number, statusText: string) => void
): Promise<Wm18ImportResult> => {
  onProgress?.(5, 'Excel-bestand inlezen...');
  await new Promise((r) => setTimeout(r, 10));

  // Optimized XLSX read: parse ONLY target sheets, skip styles & formulas for ultra speed
  const workbook = XLSX.read(fileBuffer, {
    type: 'array',
    cellFormulas: false,
    cellStyles: false,
    cellDates: false,
    sheets: ['S2_Productgegevens', 'S8_Aanpassingsformulier'],
  });

  onProgress?.(25, 'Productcatalogus verwerken...');
  await new Promise((r) => setTimeout(r, 10));

  const catalogItems: Wm18CatalogItem[] = [];
  const operatorAdjustments: Wm18OperatorAdjustment[] = [];

  // 1. Parse Sheet S2_Productgegevens
  const sheetS2 = workbook.Sheets['S2_Productgegevens'];
  if (sheetS2) {
    const rows = XLSX.utils.sheet_to_json<string[]>(sheetS2, { header: 1, raw: false, defval: '' });

    for (let r = 6; r < rows.length; r++) {
      const row = rows[r];
      const articleNumber = row[1]?.trim();
      const diameter = parseFloat(row[2]);
      const mofType = row[3]?.trim();
      const series = row[4]?.trim();
      const pressureClass = row[5]?.trim();
      const angle = parseFloat(row[6]);

      if (diameter && mofType && series) {
        const radius = parseFloat(row[7]) || diameter * 1.5;
        const tw = parseFloat(row[8]) || 4.5;
        const lNom = parseFloat(row[9]) || 40;
        const weight = parseFloat(row[12]) || 5.0;
        const bd = parseFloat(row[14]) || diameter + tw * 2;

        const baseItem = calculateWm18Item({
          articleNumber: articleNumber || undefined,
          diameterMm: diameter,
          mofType,
          series,
          pressureClass: pressureClass || 'PN16',
          angleDeg: angle || 90,
          radiusMm: radius,
          twMm: tw,
          moflengteLnomMm: lNom,
          weightKg: weight,
          bdMm: bd,
        });

        const p1Stn1Raw = row[60];
        const p2Stn1Raw = row[61];
        const p3Stn1Raw = row[62];
        const p4Stn1Raw = row[63];
        const p5Stn1Raw = row[64];
        const p6Stn1Raw = row[65];

        const item: Wm18CatalogItem = {
          ...baseItem,
          id: articleNumber || baseItem.id,
          articleNumber: articleNumber || baseItem.articleNumber,
          sourceFileName: fileName,
          sourceSheet: 'S2_Productgegevens',
          stn1Targets: {
            pos1: parseRawTarget(p1Stn1Raw, baseItem.stn1Targets.pos1),
            pos2: parseRawTarget(p2Stn1Raw, baseItem.stn1Targets.pos2),
            pos3: parseRawTarget(p3Stn1Raw, baseItem.stn1Targets.pos3),
            pos4: parseRawTarget(p4Stn1Raw, baseItem.stn1Targets.pos4),
            pos5: parseRawTarget(p5Stn1Raw, baseItem.stn1Targets.pos5),
            toPipe: parseRawTarget(p6Stn1Raw, baseItem.stn1Targets.toPipe),
          },
        };

        catalogItems.push(item);
      }

      // Yield event loop every 100 rows to keep UI responsive
      if (r % 100 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  onProgress?.(50, 'Operator logs (S8) verwerken...');
  await new Promise((r) => setTimeout(r, 10));

  // 2. Parse Sheet S8_Aanpassingsformulier
  const sheetS8 = workbook.Sheets['S8_Aanpassingsformulier'];
  if (sheetS8) {
    const rows = XLSX.utils.sheet_to_json<string[]>(sheetS8, { header: 1, raw: false, defval: '' });

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const datum = row[1]?.trim();
      const operatorName = row[2]?.trim();
      const diameter = parseFloat(row[3]);
      const mofType = row[4]?.trim();
      const series = row[5]?.trim();
      const pressureClass = row[6]?.trim();
      const angle = parseFloat(row[7]);
      const opmerking = row[9]?.trim();

      if (datum && diameter && opmerking) {
        const id = `adj_${r}_${diameter}_${mofType || 'TB'}_${angle || 90}`;
        operatorAdjustments.push({
          id,
          datum,
          operatorName: operatorName || 'Onbekend',
          diameterMm: diameter,
          mofType: mofType || 'TB',
          series: series || 'EST',
          pressureClass: pressureClass || 'PN16',
          angleDeg: angle || 90,
          radiusMm: parseFloat(row[8]) || 1.5,
          opmerking,
          status: opmerking.toUpperCase().includes('NIEUW') ? 'NIEUW' : 'EXTRA GANG',
        });
      }
    }
  }

  onProgress?.(70, 'Data opslaan...');
  let isFallback = false;

  try {
    const batchPromises: Promise<void>[] = [];
    const batchSize = 100;

    for (let i = 0; i < catalogItems.length; i += batchSize) {
      const chunk = catalogItems.slice(i, i + batchSize);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        const ref = doc(collection(db, CATALOG_COLLECTION), item.id);
        batch.set(ref, item, { merge: true });
      });
      batchPromises.push(batch.commit());
    }

    for (let i = 0; i < operatorAdjustments.length; i += batchSize) {
      const chunk = operatorAdjustments.slice(i, i + batchSize);
      const batch = writeBatch(db);
      chunk.forEach((adj) => {
        const ref = doc(collection(db, ADJUSTMENTS_COLLECTION), adj.id);
        batch.set(ref, adj, { merge: true });
      });
      batchPromises.push(batch.commit());
    }

    // Execute batch writes in parallel
    await Promise.all(batchPromises);
    onProgress?.(100, 'Import voltooid!');
  } catch (err) {
    console.warn('Firestore write failed, saving to local fallback storage:', err);
    isFallback = true;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('fpi_wm18_catalog_local', JSON.stringify(catalogItems));
        window.localStorage.setItem('fpi_wm18_adjustments_local', JSON.stringify(operatorAdjustments));
      } catch (e) {
        console.error('Failed to write to local storage', e);
      }
    }
    onProgress?.(100, 'Import lokaal voltooid!');
  }

  return {
    catalogCount: catalogItems.length,
    adjustmentsCount: operatorAdjustments.length,
    fileName,
    importedAt: new Date().toISOString(),
    isFallback,
  };
};
