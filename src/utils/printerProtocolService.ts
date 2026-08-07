import { getDriver, resolvePrinterDpi } from './printerDrivers';
import { renderLabelToBitmapZpl } from './unifiedLabelRenderEngine';
import { renderLabelToTspl, buildTsplUsbPayload } from './tsplPrintService';
export { renderLabelToTspl, buildTsplUsbPayload } from './tsplPrintService';

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

export const normalizePrinterProtocol = (printer: PrinterProfile | null | undefined): PrinterProtocol => {
  const raw = String(printer?.protocol || '').trim().toLowerCase();
  if (raw === 'tspl' || raw === 'epl' || raw === 'escpos' || raw === 'custom') {
    return raw;
  }

  const driver = getDriver(printer || null);
  const driverProtocol = String(driver?.labelLanguage || '').trim().toLowerCase();
  if (driverProtocol === 'tspl' || driverProtocol === 'epl' || driverProtocol === 'escpos' || driverProtocol === 'custom') {
    return driverProtocol as PrinterProtocol;
  }

  return 'zpl';
};

export const isTsplPrinter = (printer: PrinterProfile | null | undefined): boolean =>
  normalizePrinterProtocol(printer) === 'tspl';

export const renderLabelForPrinter = async (args: RenderLabelForPrinterArgs): Promise<string> => {
  const protocol = normalizePrinterProtocol(args.printer || null);
  if (protocol === 'tspl') {
    return renderLabelToTspl(args); // delegeer naar dedicated TSPL service
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

  const protocol = normalizePrinterProtocol(printer || null);

  if (protocol === 'tspl') {
    // delegeer volledig naar de Lighthouse/TSPL service
    return buildTsplUsbPayload({ content: base, quantity, isPreBatchedJob });
  }

  if (isPreBatchedJob) return base;

  const qty = Number.isFinite(Number(quantity)) && Number(quantity) > 0
    ? Math.max(1, Math.floor(Number(quantity)))
    : 1;

  if (protocol === 'epl' || protocol === 'escpos' || protocol === 'custom') {
    return qty === 1 ? base : Array.from({ length: qty }, () => base).join('\r\n');
  }

  // ZPL/Zebra flow
  const applyCutMode = (zpl: string): string => String(zpl || '')
    .replace(/\^MM[CT]/g, '^MMC')
    .replace(/\^PQ1,0,1,[YN]/g, '^PQ1,0,1,Y');

  return qty === 1
    ? applyCutMode(base)
    : Array.from({ length: qty }, () => applyCutMode(base)).join('\n');
};

export const buildProtocolAwareUsbProbePayload = (printer?: PrinterProfile | null): string => {
  const protocol = normalizePrinterProtocol(printer || null);

  if (protocol === 'tspl') {
    return [
      'SIZE 90 mm,40 mm',
      'GAP 2 mm,0 mm',
      'DENSITY 8',
      'SPEED 4',
      'DIRECTION 0,0',
      'REFERENCE 0,0',
      'CLS',
      'TEXT 20,20,"ARIAL.TTF",0,20,20,"TEST-USB-PROBE"',
      'PRINT 1,1',
      '',
    ].join('\n');
  }

  return '^XA\n^FO20,20^A0N,30,30^FDTEST-USB-PROBE^FS\n^XZ';
};