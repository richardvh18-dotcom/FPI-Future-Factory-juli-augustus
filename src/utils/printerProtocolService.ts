import { resolveLabelContent } from './labelHelpers';
import { getDriver, getPrinterRollSettings, resolvePrinterDpi } from './printerDrivers';
import { renderLabelToBitmapZpl } from './unifiedLabelRenderEngine';

type AnyRecord = Record<string, unknown>;

type PrinterProtocol = 'zpl' | 'epl' | 'tspl' | 'escpos' | 'custom';

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
  fontFamily?: string;
  align?: 'left' | 'center' | 'right';
  thickness?: number;
  rotation?: number;
  maxLines?: number;
  content?: string;
  vAlign?: 'top' | 'center' | 'bottom';
};

type LabelTemplate = {
  width?: number;
  height?: number;
  elements?: LabelElement[];
  [key: string]: unknown;
};

type RenderLabelForPrinterArgs = {
  printer?: PrinterProfile | null;
  template: LabelTemplate;
  data: AnyRecord;
  printerDpi?: number;
  darkness?: number;
  printSpeed?: number;
  widthMm?: number;
  heightMm?: number;
  strictFontSizing?: boolean;
  textScaleFactor?: number;
};

type RenderLabelSequenceArgs = {
  printer?: PrinterProfile | null;
  templates: LabelTemplate[];
  data: AnyRecord;
  printerDpi?: number;
  darkness?: number;
  printSpeed?: number;
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

const toTsplRotation = (value: unknown): 0 | 90 | 180 | 270 => normalizeRotation(value);

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
  ctx.font = `${isBold ? '700' : '400'} ${fontSizePx}px ${fontFamily || 'Arial, sans-serif'}`;
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
  const rotation = toTsplRotation(element.rotation);
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

export const normalizePrinterProtocol = (printer: PrinterProfile | null | undefined): PrinterProtocol => {
  const raw = String(printer?.protocol || '').trim().toLowerCase();
  if (raw === 'tspl' || raw === 'epl' || raw === 'escpos' || raw === 'custom') {
    return raw;
  }
  return 'zpl';
};

export const isTsplPrinter = (printer: PrinterProfile | null | undefined): boolean =>
  normalizePrinterProtocol(printer) === 'tspl';

export const renderLabelToTspl = async ({
  printer,
  template,
  data,
  printerDpi,
  darkness,
  printSpeed,
  widthMm,
  heightMm,
}: RenderLabelForPrinterArgs): Promise<string> => {
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
    const resolved = resolveLabelContent(element as AnyRecord, data) as { content?: unknown };
    const content = String(resolved?.content ?? '');
    const x = mmToDots(parseNumber(element.x) + offsetXmm, dotsPerMm);
    const y = mmToDots(parseNumber(element.y) + offsetYmm, dotsPerMm);
    const widthDots = mmToDots(element.width, dotsPerMm);
    const heightDots = mmToDots(element.height, dotsPerMm);
    const rotation = toTsplRotation(element.rotation);

    switch (String(element.type || '').toLowerCase()) {
      case 'text': {
        commands.push(...buildTsplTextCommands({
          element,
          content,
          printer: effectivePrinter,
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
      case 'qr': {
        const qrSize = Math.max(2, Math.min(8, Math.round(Math.min(widthDots || 120, heightDots || 120) / 28) || 4));
        commands.push(`QRCODE ${x},${y},M,${qrSize},A,${rotation},M2,S3,"${escapeTsplText(content)}"`);
        break;
      }
      case 'barcode': {
        const barcodeHeight = Math.max(24, heightDots || mmToDots(12, dotsPerMm));
        commands.push(`BARCODE ${x},${y},"128",${barcodeHeight},0,${rotation},2,2,"${escapeTsplText(content)}"`);
        break;
      }
      default:
        break;
    }
  }

  commands.push('PRINT 1,1');
  return commands.join('\r\n') + '\r\n';
};

export const renderLabelForPrinter = async (args: RenderLabelForPrinterArgs): Promise<string> => {
  const protocol = normalizePrinterProtocol(args.printer || null);
  if (protocol === 'tspl') {
    return renderLabelToTspl(args);
  }

  return renderLabelToBitmapZpl({
    template: args.template,
    data: args.data,
    printerDpi: Number(args.printerDpi || resolvePrinterDpi(args.printer || null, 203)),
    darkness: args.darkness,
    printSpeed: args.printSpeed,
    strictFontSizing: args.strictFontSizing,
    textScaleFactor: args.textScaleFactor,
    widthMm: args.widthMm,
    heightMm: args.heightMm,
  });
};

export const renderLabelSequenceForPrinter = async ({
  printer,
  templates,
  data,
  printerDpi,
  darkness,
  printSpeed,
}: RenderLabelSequenceArgs): Promise<string> => {
  const rendered = await Promise.all(
    (templates || []).map((template) =>
      renderLabelForPrinter({
        printer,
        template,
        data,
        printerDpi,
        darkness,
        printSpeed,
        widthMm: Number(template?.width || 90),
        heightMm: Number(template?.height || 40),
      })
    )
  );

  return rendered.filter(Boolean).join('\n');
};

export const buildProtocolAwareUsbPayload = ({
  printer,
  content,
  quantity,
  isPreBatchedJob = false,
}: {
  printer?: PrinterProfile | null;
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
  const protocol = normalizePrinterProtocol(printer || null);

  if (protocol === 'tspl' || protocol === 'epl' || protocol === 'escpos' || protocol === 'custom') {
    return qty === 1 ? base : Array.from({ length: qty }, () => base).join('\r\n');
  }

  const applyCutMode = (zpl: string): string => String(zpl || '')
    .replace(/\^MM[CT]/g, '^MMC')
    .replace(/\^PQ1,0,1,[YN]/g, '^PQ1,0,1,Y');

  return qty === 1
    ? applyCutMode(base)
    : Array.from({ length: qty }, () => applyCutMode(base)).join('\n');
};