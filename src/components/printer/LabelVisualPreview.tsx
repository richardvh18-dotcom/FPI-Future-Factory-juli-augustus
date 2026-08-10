import React from 'react';
import i18n from 'i18next';
import { resolveLabelContent, getBarcodeUrl } from '../../utils/labelHelpers';
import InternalQrImage from '../../utils/InternalQrImage';
import { getWavistrongLayoutNudge } from '../../utils/labelLayoutAdjustments';

/**
 * CRITICAL: PIXELS_PER_MM moet passen bij printer DPI voor print/preview parity.
 * 
 * Standaard scherm DPI = 96, dus PIXELS_PER_MM = 96 / 25.4 ≈ 3.78
 * Printer DPI = 203 (standaard), dus dots/mm = 203 / 25.4 ≈ 8.0
 * 
 * Elke DPI mismatch zorgt voor overlapping/spacing mismatch in fysieke print.
 */
const SCREEN_DPI = 96;
const CSS_PIXELS_PER_POINT = 96 / 72;
const PRINTER_PREVIEW_FONT_STACK = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
const PREVIEW_GLYPH_WIDTH_RATIO = 0.52;

type LabelElement = {
  type?: 'text' | 'line' | 'box' | 'qr' | 'barcode' | string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  isBold?: boolean;
  isItalic?: boolean;
  color?: string;
  backgroundColor?: string;
  opacity?: number;
  zIndex?: number;
  conditionalVariable?: string;
  barcodeType?: string;
  fontFamily?: string;
  align?: 'left' | 'center' | 'right';
  thickness?: number;
  rotation?: number;
  maxLines?: number;
};

type LabelTemplate = {
  width: number;
  height: number;
  elements?: LabelElement[];
};

type LabelVisualPreviewProps = {
  label?: LabelTemplate | null;
  data?: Record<string, unknown>;
  zoom?: number;
  className?: string;
  printerDpi?: number;
  strictFontSizing?: boolean;
  textScaleFactor?: number;
};

/**
 * Berekent PIXELS_PER_MM voor gegeven printer-DPI
 * Hiermee wordt preview gesynchroniseerd met actuele print-output
 */
const getPixelsPerMm = (printerDpi = 203) => {
  // We schalen zelf naar printer-dots zodat preview parity heeft
  // 203 DPI printer = 8.0 dots/mm
  // Preview pixels moeten dezelfde schaal gebruiken voor 1:1 preview/print matching
  return (printerDpi || 203) / 25.4;
};

const snapPx = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (typeof window === 'undefined') return value;
  const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
  return Math.round(value * dpr) / dpr;
};

const getLongestPreviewLineLength = (value: unknown): number => {
  const lines = String(value || "").split(/\r?\n/);
  return lines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
};

const getResolvedPreviewMaxLines = (
  element: LabelElement,
  baseFontPx: number,
  rotation = 0,
  zoom = 1,
  pixelsPerMm = 3.78
): number => {
  const explicitMaxLines = Number(element.maxLines);
  if (Number.isFinite(explicitMaxLines) && explicitMaxLines > 0) {
    return Math.max(1, Math.floor(explicitMaxLines));
  }

  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
  const blockHeightMm = isVerticalRotation
    ? (element.width || element.height || 0)
    : (element.height || 0);

  if (!blockHeightMm || !baseFontPx) return 1;

  const blockHeightPx = blockHeightMm * pixelsPerMm * zoom;
  const estimatedLineHeightPx = Math.max(1, baseFontPx * 1.05);
  return Math.max(1, Math.floor((blockHeightPx * 0.92) / estimatedLineHeightPx));
};

/**
 * Berekent tekststijl exact gelijk aan AdminLabelDesigner.getPreviewTextStyle
 * zodat preview en designer identiek renderen.
 */
const getPreviewTextStyle = (
  element: LabelElement,
  content: unknown,
  zoom: number,
  rotation = 0,
  pixelsPerMm = 3.78,
  strictFontSizing = false,
  textScaleFactor = 1
): { fontSize: number; lineHeight: string } => {
  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
  const baseFontPx = (element.fontSize || 10) * CSS_PIXELS_PER_POINT * zoom;

  if (strictFontSizing) {
    return { fontSize: baseFontPx * textScaleFactor, lineHeight: '1.05' };
  }

  const maxLines = getResolvedPreviewMaxLines(element, baseFontPx, normalizedRotation, zoom, pixelsPerMm);

  if (isVerticalRotation) {
    // Bij verticale rotatie is el.height het loopvlak voor tekst (de "breedte" na rotatie)
    const runLengthMm = element.height || element.width || 0;
    const runLengthPx = runLengthMm * pixelsPerMm * zoom;
    // el.width wordt na rotatie de "hoogte" — het budget voor meerdere regels
    const lineBudgetMm = element.width || element.height || 0;
    const lineBudgetPx = lineBudgetMm * pixelsPerMm * zoom;

    if (runLengthPx > 0) {
      const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
      const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
      const widthLimitedFontPx = (runLengthPx * 0.92) / (estimatedLongestWrappedLine * PREVIEW_GLYPH_WIDTH_RATIO);
      const heightLimitedFontPx = lineBudgetPx ? (lineBudgetPx * 0.9) / maxLines : baseFontPx;
      const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));
      return { fontSize: fittedFontPx * textScaleFactor, lineHeight: "1.05" };
    }
    return { fontSize: baseFontPx, lineHeight: "1.05" };
  }

  const effectiveWidthMm = element.width || 0;
  const blockWidthPx = effectiveWidthMm * pixelsPerMm * zoom;
  const blockHeightPx = element.height ? element.height * pixelsPerMm * zoom : null;

  if (!blockWidthPx) {
    return { fontSize: baseFontPx, lineHeight: "1.05" };
  }

  const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
  const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
  const widthLimitedFontPx = (blockWidthPx * 0.92) / (estimatedLongestWrappedLine * PREVIEW_GLYPH_WIDTH_RATIO);
  const heightLimitedFontPx = blockHeightPx ? (blockHeightPx * 0.9) / maxLines : baseFontPx;
  const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));

  return { fontSize: fittedFontPx * textScaleFactor, lineHeight: "1.05" };
};

const LabelVisualPreview = ({ label, data = {}, zoom = 1, className = "", printerDpi = 203, strictFontSizing = false, textScaleFactor = 1 }: LabelVisualPreviewProps) => {
  const pixelsPerMm = getPixelsPerMm(printerDpi);
  
  if (!label) return <div className={`w-48 h-32 bg-slate-200 flex items-center justify-center text-xs text-slate-400 italic ${className}`}>{i18n.t('labelPreview.noTemplate', 'Geen template')}</div>;

  return (
    <div
      className={`bg-white relative overflow-hidden ${className}`}
      style={{
        width: `${label.width * pixelsPerMm * zoom}px`,
        height: `${label.height * pixelsPerMm * zoom}px`,
      }}
    >
      {[...(label.elements || [])].sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0)).map((el, index) => {
        const resolved = resolveLabelContent(el, data) as { content?: unknown };
        const displayContent = String(resolved?.content ?? '');
        const rotation = ((Number(el.rotation) || 0) % 360 + 360) % 360;
        const isVerticalRotation = rotation === 90 || rotation === 270;
        const x = Number(el.x) || 0;
        const y = Number(el.y) || 0;
        const widthMm = Number(el.width) || 0;
        const heightMm = Number(el.height) || 0;
        const layoutNudge = getWavistrongLayoutNudge(label, el, displayContent);

        // Conditionele zichtbaarheid: verberg als variabele leeg is
        if (el.conditionalVariable) {
          const condVal = String(data?.[el.conditionalVariable] ?? '').trim();
          if (!condVal || condVal === 'undefined' || condVal === 'null') return null;
        }

        const elementOpacity = el.opacity != null ? Number(el.opacity) / 100 : 1;
        const elementColor = el.color || 'black';

        const baseStyle: React.CSSProperties = {
          position: "absolute",
          left: `${snapPx((x + layoutNudge.xMm) * pixelsPerMm * zoom)}px`,
          top: `${snapPx((y + layoutNudge.yMm) * pixelsPerMm * zoom)}px`,
          width: widthMm ? `${snapPx(widthMm * pixelsPerMm * zoom)}px` : "auto",
          height: heightMm ? `${snapPx(heightMm * pixelsPerMm * zoom)}px` : "auto",
          color: elementColor,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: "top left",
          overflow: "hidden",
          textAlign: "left",
          opacity: elementOpacity,
          zIndex: el.zIndex || index,
        };

        if (el.type === "text") {
          const textStyle = getPreviewTextStyle(el, displayContent, zoom, rotation, pixelsPerMm, strictFontSizing, textScaleFactor);

          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: isVerticalRotation
                  ? `${snapPx((heightMm || widthMm || 1) * pixelsPerMm * zoom)}px`
                  : `${snapPx(widthMm * pixelsPerMm * zoom)}px`,
                height: isVerticalRotation
                  ? `${snapPx((widthMm || heightMm || 1) * pixelsPerMm * zoom)}px`
                  : (heightMm
                    ? `${snapPx(heightMm * pixelsPerMm * zoom)}px`
                    : "auto"),
                fontSize: `${snapPx(textStyle.fontSize)}px`,
                lineHeight: textStyle.lineHeight,
                fontWeight: el.isBold ? "800" : "700",
                fontStyle: el.isItalic ? "italic" : "normal",
                letterSpacing: "0.25px",
                fontFamily: !el.fontFamily || el.fontFamily === "Arial" || String(el.fontFamily) === "0"
                  ? PRINTER_PREVIEW_FONT_STACK
                  : el.fontFamily,
                textAlign: el.align || "left",
                backgroundColor: el.backgroundColor || undefined,
                display: (el as any).vAlign ? "flex" : "block",
                flexDirection: (el as any).vAlign ? "column" : undefined,
                justifyContent: (el as any).vAlign === "center" ? "center" : (el as any).vAlign === "bottom" ? "flex-end" : "flex-start",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                wordBreak: "normal",
                boxSizing: "border-box",
                WebkitFontSmoothing: "antialiased",
                textRendering: "geometricPrecision",
              }}
            >
              {displayContent}
            </div>
          );
        }

        if (el.type === "line")
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${snapPx(widthMm * pixelsPerMm * zoom)}px`,
                height: `${snapPx(heightMm * pixelsPerMm * zoom)}px`,
                backgroundColor: elementColor,
              }}
            />
          );

        if (el.type === "box")
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${snapPx(widthMm * pixelsPerMm * zoom)}px`,
                height: `${snapPx(heightMm * pixelsPerMm * zoom)}px`,
                border: `${Math.max(1, snapPx((el.thickness || 1) * pixelsPerMm * zoom))}px solid ${elementColor}`,
                backgroundColor: el.backgroundColor || undefined,
                boxSizing: "border-box",
              }}
            />
          );

        if (el.type === "ellipse")
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${snapPx(widthMm * pixelsPerMm * zoom)}px`,
                height: `${snapPx(heightMm * pixelsPerMm * zoom)}px`,
                border: `${Math.max(1, snapPx((el.thickness || 1) * pixelsPerMm * zoom))}px solid ${elementColor}`,
                backgroundColor: el.backgroundColor || undefined,
                borderRadius: "50%",
                boxSizing: "border-box",
              }}
            />
          );
        
        if (el.type === "qr" || el.type === "barcode")
          return (
             <div key={index} style={{
                 ...baseStyle, 
               width: `${snapPx((el.width || 30) * pixelsPerMm * zoom)}px`, 
               height: `${snapPx((el.height || 30) * pixelsPerMm * zoom)}px`,
                 background: "#f8fafc",
                 border: "1px solid #cbd5e1",
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
             }}>
                {el.type === 'barcode' ? (
                    <img 
                        src={getBarcodeUrl(displayContent, el.barcodeType)} 
                        alt="code" 
                        style={{ width: "100%", height: "100%", objectFit: "contain" }} 
                    />
                ) : (
                  <InternalQrImage value={displayContent} size={160} alt="code" className="w-full h-full object-contain" />
                )}
             </div>
          );

        return null;
      })}
    </div>
  );
};

export default LabelVisualPreview;
