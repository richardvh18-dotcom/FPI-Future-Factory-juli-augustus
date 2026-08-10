/**
 * Dedicated TSPL/Lighthouse print service.
 * Handles all rendering and payload building for TSPL-protocol printers (e.g. Lighthouse).
 * Completely independent from the Zebra/ZPL flow.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import LabelVisualPreview from '../components/printer/LabelVisualPreview';
import { captureElementAsCanvas } from './zplHelper';
import { pixelsToGfaBitmap, buildBoostedMaskFromImageData } from './canvasToBitmapZpl';
import { resolveLabelContent } from './labelHelpers';
import { getDriver, getPrinterRollSettings, resolvePrinterDpi } from './printerDrivers';

type AnyRecord = Record<string, unknown>;

type PrinterProfile = Record<string, unknown> & {
  protocol?: string;
  dpi?: number | string;
  darkness?: number | string;
  speed?: number | string;
  calibrationOffsetXMm?: number | string;
  calibrationOffsetYMm?: number | string;
  rollType?: string;
};

type LabelElement = {
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  isBold?: boolean;
  isItalic?: boolean;
  fontFamily?: string;
  align?: 'left' | 'center' | 'right';
  thickness?: number;
  rotation?: number;
  maxLines?: number;
  content?: string;
  vAlign?: 'top' | 'center' | 'bottom';
  color?: string;
  opacity?: number;
  zIndex?: number;
  conditionalVariable?: string;
  barcodeType?: string;
};

type LabelTemplate = {
  width?: number;
  height?: number;
  elements?: LabelElement[];
  [key: string]: unknown;
};

export type TsplRenderArgs = {
  printer?: PrinterProfile | null;
  template: LabelTemplate;
  data: AnyRecord;
  printerDpi?: number;
  darkness?: number;
  printSpeed?: number;
  widthMm?: number;
  heightMm?: number;
};

const CSS_PIXELS_PER_POINT = 96 / 72;
const PREVIEW_GLYPH_WIDTH_RATIO = 0.52;

const parseNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mmToDots = (value: unknown, dotsPerMm: number): number =>
  Math.max(0, Math.round(parseNumber(value) * dotsPerMm));

const escapeTsplText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/"/g, "'");

const normalizeRotation = (value: unknown): 0 | 90 | 180 | 270 => {
  const normalized = ((Number(value) || 0) % 360 + 360) % 360;
  if (normalized >= 45 && normalized < 135) return 90;
  if (normalized >= 135 && normalized < 225) return 180;
  if (normalized >= 225 && normalized < 315) return 270;
  return 0;
};

const getMeasureContext = (): CanvasRenderingContext2D | null => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  return canvas.getContext('2d');
};

const approximateTextWidthPx = (
  text: string,
  fontSizePx: number,
  isBold: boolean,
  fontFamily?: string
): number => {
  const ctx = getMeasureContext();
  if (!ctx) return text.length * fontSizePx * PREVIEW_GLYPH_WIDTH_RATIO;
  ctx.font = `${isBold ? '700' : '400'} ${fontSizePx}px ${fontFamily || 'Arial,sans-serif'}`;
  return ctx.measureText(text).width;
};

const splitTokenByWidth = (
  token: string,
  maxWidthPx: number,
  fontSizePx: number,
  isBold: boolean,
  fontFamily?: string
): string[] => {
  if (!token) return [''];
  const chunks: string[] = [];
  let current = '';
  for (const char of token) {
    const next = `${current}${char}`;
    if (current && approximateTextWidthPx(next, fontSizePx, isBold, fontFamily) > maxWidthPx) {
      chunks.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

const wrapTextForElement = (
  text: string,
  element: LabelElement,
  printerDpi: number,
  maxLinesOverride?: number
): string[] => {
  const widthMm = parseNumber(element.width);
  const heightMm = parseNumber(element.height);
  const fontSizePt = Math.max(6, parseNumber(element.fontSize, 10));
  const fontSizePx = fontSizePt * CSS_PIXELS_PER_POINT;
  const maxWidthPx = widthMm > 0 ? (widthMm * printerDpi) / 25.4 : Number.POSITIVE_INFINITY;
  const lineHeightPx = Math.max(1, fontSizePx * 1.05);
  const maxLines = Math.max(
    1,
    maxLinesOverride || (heightMm > 0 ? Math.floor(((heightMm * printerDpi) / 25.4) / lineHeightPx) : 1)
  );

  const sourceLines = String(text || '').split(/\r?\n/);
  const wrapped: string[] = [];

  for (const sourceLine of sourceLines) {
    if (maxWidthPx === Number.POSITIVE_INFINITY) {
      wrapped.push(sourceLine);
      continue;
    }

    const words = sourceLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      wrapped.push('');
      continue;
    }

    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (approximateTextWidthPx(candidate, fontSizePx, Boolean(element.isBold), element.fontFamily) <= maxWidthPx) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        wrapped.push(currentLine);
        currentLine = '';
      }

      const tokenChunks = splitTokenByWidth(word, maxWidthPx, fontSizePx, Boolean(element.isBold), element.fontFamily);
      if (tokenChunks.length === 1) {
        currentLine = tokenChunks[0];
      } else {
        wrapped.push(...tokenChunks.slice(0, -1));
        currentLine = tokenChunks[tokenChunks.length - 1] || '';
      }
    }

    if (currentLine) wrapped.push(currentLine);
  }

  return wrapped.slice(0, maxLines);
};

const getTextScaleDots = (fontSizePt: number, printerDpi: number) => {
  const fontHeightDots = Math.max(16, Math.round((fontSizePt * printerDpi) / 72));
  const fontWidthDots = Math.max(12, Math.round(fontHeightDots * 0.72));
  const lineHeightDots = Math.max(fontHeightDots + 2, Math.round(fontHeightDots * 1.1));
  return { fontHeightDots, fontWidthDots, lineHeightDots };
};

const buildTsplTextCommands = ({
  element,
  content,
  printer,
  printerDpi,
}: {
  element: LabelElement;
  content: string;
  printer: PrinterProfile;
  printerDpi: number;
}): string[] => {
  const dotsPerMm = printerDpi / 25.4;
  const offsetXmm = parseNumber(printer?.calibrationOffsetXMm);
  const offsetYmm = parseNumber(printer?.calibrationOffsetYMm);
  const xBase = mmToDots(parseNumber(element.x) + offsetXmm, dotsPerMm);
  const yBase = mmToDots(parseNumber(element.y) + offsetYmm, dotsPerMm);
  const widthDots = mmToDots(element.width, dotsPerMm);
  const heightDots = mmToDots(element.height, dotsPerMm);
  const rotation = normalizeRotation(element.rotation);
  const fontSizePt = Math.max(6, parseNumber(element.fontSize, 10));
  const { fontHeightDots, fontWidthDots, lineHeightDots } = getTextScaleDots(fontSizePt, printerDpi);
  const lines = wrapTextForElement(content, element, printerDpi, Number(element.maxLines) || undefined);
  const totalTextHeight = Math.max(1, lines.length) * lineHeightDots;

  let yStart = yBase;
  if (element.vAlign === 'center' && heightDots > totalTextHeight) {
    yStart += Math.round((heightDots - totalTextHeight) / 2);
  } else if (element.vAlign === 'bottom' && heightDots > totalTextHeight) {
    yStart += heightDots - totalTextHeight;
  }

  return lines.map((line, index) => {
    const safeLine = escapeTsplText(line);
    const estimatedLineWidth = Math.round(safeLine.length * fontWidthDots * PREVIEW_GLYPH_WIDTH_RATIO);
    let x = xBase;
    if (element.align === 'center' && widthDots > estimatedLineWidth) {
      x += Math.round((widthDots - estimatedLineWidth) / 2);
    } else if (element.align === 'right' && widthDots > estimatedLineWidth) {
      x += widthDots - estimatedLineWidth;
    }
    const y = yStart + index * lineHeightDots;
    return `TEXT ${x},${y},"ARIAL.TTF",${rotation},${fontWidthDots},${fontHeightDots},"${safeLine}"`;
  });
};

/**
 * Detecteert of een string al TSPL-content is (begint met SIZE of CLS).
 */
export const isTsplContent = (content: unknown): boolean => {
  const str = String(content || '').trimStart();
  return str.startsWith('SIZE ') || str.startsWith('CLS') || str.startsWith('DENSITY');
};

/**
 * Rendert een labeltemplate naar TSPL-commandostring voor Lighthouse printers.
 */
export const renderLabelToTspl = async ({
  printer,
  template,
  data,
  printerDpi,
  darkness,
  printSpeed,
  widthMm,
  heightMm,
}: TsplRenderArgs): Promise<string> => {
  const effectivePrinter = printer || {};
  const driver = getDriver(effectivePrinter);
  const finalPrinterDpi = Number(printerDpi || resolvePrinterDpi(effectivePrinter, driver.nativeDpi || 203));
  const finalWidthMm = Number(widthMm || template?.width || 90);
  const finalHeightMm = Number(heightMm || template?.height || 40);
  const effectiveDarkness = Number.isFinite(Number(darkness)) ? Number(darkness) : driver.defaultDarkness;
  const effectiveSpeed = Number.isFinite(Number(printSpeed)) ? Number(printSpeed) : driver.defaultSpeed;
  const dotsPerMm = finalPrinterDpi / 25.4;
  const rollSettings = getPrinterRollSettings(effectivePrinter);
  const offsetXmm = parseNumber(effectivePrinter?.calibrationOffsetXMm);
  const offsetYmm = parseNumber(effectivePrinter?.calibrationOffsetYMm);

  const commands: string[] = [
    `SIZE ${finalWidthMm} mm,${finalHeightMm} mm`,
    rollSettings.rollType === 'continuous' ? 'GAP 0 mm,0 mm' : 'GAP 2 mm,0 mm',
    `DENSITY ${Math.max(1, Math.min(15, Math.round(effectiveDarkness)))}`,
    `SPEED ${Math.max(1, Math.min(6, Math.round(effectiveSpeed)))}`,
    'DIRECTION 0,0',
    'REFERENCE 0,0',
    'CLS',
  ];

  for (const element of template?.elements || []) {
    // Conditionele zichtbaarheid: sla over als variabele leeg is
    if (element.conditionalVariable) {
      const condVal = String((data as AnyRecord)?.[element.conditionalVariable] ?? '').trim();
      if (!condVal || condVal === 'undefined' || condVal === 'null') continue;
    }

    const resolved = resolveLabelContent(element as AnyRecord, data) as { content?: unknown };
    const content = String(resolved?.content ?? '');
    const x = mmToDots(parseNumber(element.x) + offsetXmm, dotsPerMm);
    const y = mmToDots(parseNumber(element.y) + offsetYmm, dotsPerMm);
    const widthDots = mmToDots(element.width, dotsPerMm);
    const heightDots = mmToDots(element.height, dotsPerMm);
    const rotation = normalizeRotation(element.rotation);

    switch (String(element.type || '').toLowerCase()) {
      case 'text': {
        commands.push(...buildTsplTextCommands({
          element,
          content,
          printer: effectivePrinter as PrinterProfile,
          printerDpi: finalPrinterDpi,
        }));
        break;
      }
      case 'line': {
        commands.push(`BAR ${x},${y},${Math.max(1, widthDots)},${Math.max(1, heightDots)}`);
        break;
      }
      case 'box': {
        const thickness = Math.max(1, mmToDots(parseNumber(element.thickness, 0.3), dotsPerMm));
        commands.push(`BOX ${x},${y},${x + Math.max(1, widthDots)},${y + Math.max(1, heightDots)},${thickness}`);
        break;
      }
      case 'ellipse': {
        const thickness = Math.max(1, mmToDots(parseNumber(element.thickness, 0.3), dotsPerMm));
        commands.push(`ELLIPSE ${x},${y},${Math.max(1, widthDots)},${Math.max(1, heightDots)},${thickness}`);
        break;
      }
      case 'qr': {
        // Niveau H (30% foutherstel) + grotere minimale celgrootte voor leesbaarheid door hars/coating
        const qrSize = Math.max(3, Math.min(8, Math.round(Math.min(widthDots || 120, heightDots || 120) / 24) || 4));
        commands.push(`QRCODE ${x},${y},H,${qrSize},A,${rotation},M2,S7,"${escapeTsplText(content)}"`);
        break;
      }
      case 'barcode': {
        const barcodeHeight = Math.max(24, heightDots || mmToDots(12, dotsPerMm));
        // Barcode type mapping naar TSPL symbologies
        const barcodeType = element.barcodeType || 'code128';
        const tsplBcType = barcodeType === 'code39' ? '39' : barcodeType === 'ean13' ? 'EAN13' : barcodeType === 'ean8' ? 'EAN8' : barcodeType === 'datamatrix' ? 'DATAMATRIX' : barcodeType === 'pdf417' ? 'PDF417' : '128';
        commands.push(`BARCODE ${x},${y},"${tsplBcType}",${barcodeHeight},0,${rotation},2,2,"${escapeTsplText(content)}"`);
        break;
      }
      default:
        break;
    }
  }

  commands.push('PRINT 1,1');
  return commands.join('\r\n') + '\r\n';
};

/**
 * Bouwt de uiteindelijke USB payload voor TSPL/Lighthouse printers.
 * Handelt herhalingen (quantity) af zonder ZPL-specifieke cut-mode logica.
 */
export const buildTsplUsbPayload = ({
  content,
  quantity,
  isPreBatchedJob = false,
}: {
  content: unknown;
  quantity: unknown;
  isPreBatchedJob?: boolean;
}): string => {
  const base = String(content || '').trim();
  if (!base) return '';
  if (isPreBatchedJob) return base;

  const qty = Number.isFinite(Number(quantity)) && Number(quantity) > 0
    ? Math.max(1, Math.floor(Number(quantity)))
    : 1;

  if (qty === 1) return base;

  // Hergebruik één labelblok en pas alleen het aantal afdrukken aan.
  const withoutPrint = base.replace(/\r?\nPRINT\s+\d+,\d+\s*$/, '');
  return `${withoutPrint}\r\nPRINT ${qty},1\r\n`;
};

export type TsplBitmapRenderArgs = {
  printer?: PrinterProfile | null;
  template: LabelTemplate;
  data: AnyRecord;
  printerDpi?: number;
  darkness?: number;
  printSpeed?: number;
  widthMm?: number;
  heightMm?: number;
  quantity?: number;
};

/**
 * Rendert een labeltemplate als bitmap en bouwt een binaire TSPL BITMAP payload (Uint8Array).
 * Pixel-perfecte output — identieke kwaliteit als Zebra ZPL bitmap.
 * Gebruik printBinaryUsbToDevice() om het resultaat te versturen.
 */
export const renderLabelToBitmapTspl = async ({
  printer,
  template,
  data,
  printerDpi,
  darkness = 8,
  printSpeed = 4,
  widthMm,
  heightMm,
  quantity = 1,
}: TsplBitmapRenderArgs): Promise<Uint8Array> => {
  const effectivePrinter = printer || {};
  const driver = getDriver(effectivePrinter);
  const finalPrinterDpi = Number(printerDpi || resolvePrinterDpi(effectivePrinter, driver.nativeDpi || 203));
  const finalWidthMm = Number(widthMm || template?.width || 90);
  const finalHeightMm = Number(heightMm || template?.height || 40);
  const effectiveDarkness = Number.isFinite(Number(darkness)) ? Number(darkness) : (driver.defaultDarkness ?? 8);
  const effectiveSpeed = Number.isFinite(Number(printSpeed)) ? Number(printSpeed) : (driver.defaultSpeed ?? 4);
  const rollSettings = getPrinterRollSettings(effectivePrinter);
  const dotsPerMm = finalPrinterDpi / 25.4;
  const widthDots = Math.round(finalWidthMm * dotsPerMm);
  const heightDots = Math.round(finalHeightMm * dotsPerMm);
  const qty = Math.max(1, Math.round(quantity));

  let host: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  try {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;background:#ffffff;z-index:-1;';
    host.style.width = `${widthDots * 4}px`;
    host.style.height = `${heightDots * 4}px`;
    document.body.appendChild(host);

    root = createRoot(host);
    await new Promise<void>((resolve) => {
      root!.render(
        React.createElement(LabelVisualPreview, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: template as any,
          data,
          zoom: 4,
          printerDpi: finalPrinterDpi,
          className: '',
        })
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const canvas = await captureElementAsCanvas(host, finalWidthMm, finalHeightMm, finalPrinterDpi);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = widthDots;
    tempCanvas.height = heightDots;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
    tempCtx.drawImage(canvas, 0, 0, widthDots, heightDots);
    const imageData = tempCtx.getImageData(0, 0, widthDots, heightDots);

    // Hergebruik dezelfde 1-bit bitmap conversie als Zebra
    const boosted = buildBoostedMaskFromImageData(imageData.data, widthDots, heightDots, 168, 0);
    const rgba = new Uint8ClampedArray(widthDots * heightDots * 4);
    for (let i = 0; i < boosted.length; i++) {
      const o = i * 4;
      const v = boosted[i] === 1 ? 0 : 255;
      rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v; rgba[o + 3] = 255;
    }
    const gfa = pixelsToGfaBitmap(rgba, widthDots, heightDots, false, 128);
    const rowBytes = gfa.rowBytes;

    // TSPL header: SIZE, GAP, DENSITY, SPEED, CLS, dan BITMAP commando
    const header = [
      `SIZE ${finalWidthMm} mm,${finalHeightMm} mm`,
      rollSettings.rollType === 'continuous' ? 'GAP 0 mm,0 mm' : 'GAP 2 mm,0 mm',
      `DENSITY ${Math.max(1, Math.min(15, Math.round(effectiveDarkness)))}`,
      `SPEED ${Math.max(1, Math.min(6, Math.round(effectiveSpeed)))}`,
      'DIRECTION 0,0',
      'REFERENCE 0,0',
      'CLS',
      `BITMAP 0,0,${rowBytes},${heightDots},0,`,
    ].join('\r\n');

    const footer = `\r\nPRINT ${qty},1\r\n`;

    // Zet hex string om naar raw bitmap bytes
    const hexStr = gfa.hexString;
    const bitmapBytes = new Uint8Array(hexStr.length / 2);
    for (let i = 0; i < bitmapBytes.length; i++) {
      bitmapBytes[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
    }

    // Combineer tekst-header + binaire bitmap + tekst-footer
    const enc = new TextEncoder();
    const headerBytes = enc.encode(header);
    const footerBytes = enc.encode(footer);
    const combined = new Uint8Array(headerBytes.length + bitmapBytes.length + footerBytes.length);
    combined.set(headerBytes, 0);
    combined.set(bitmapBytes, headerBytes.length);
    combined.set(footerBytes, headerBytes.length + bitmapBytes.length);

    return combined;
  } finally {
    try { root?.unmount(); } catch { /* no-op */ }
    if (host?.parentNode) host.parentNode.removeChild(host);
  }
};
