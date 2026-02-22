import { resolveLabelContent } from "./labelHelpers";
import i18n from "../i18n";

/**
 * Genereert ZPL code voor Zebra printers op basis van een label template.
 * @param {Object} label - Het label template object
 * @param {Object} data - De data om in te vullen (order, lot, etc.)
 * @param {number} printerDpi - DPI van de printer (203, 300, 600). Default 203.
 */
export const generateZPL = (label, data, printerDpi = 203) => {
  if (!label || !label.elements) return "";

  // Converteer DPI naar Dots Per MM (dpmm)
  const dpmm = printerDpi / 25.4;

  let zpl = "^XA\n"; // Start Formaat
  zpl += `^PW${Math.round(label.width * dpmm)}\n`; // Printbreedte
  zpl += `^LL${Math.round(label.height * dpmm)}\n`; // Labellengte
  zpl += "^CI28\n"; // UTF-8 Codering

  label.elements.forEach(el => {
    const resolved = resolveLabelContent(el, data);
    // Vertaal de content via i18n indien mogelijk, anders gebruik originele waarde
    const content = i18n.t(resolved.content || "");
    const x = Math.round(el.x * dpmm);
    const y = Math.round(el.y * dpmm);
    
    // Veld Oorsprong
    zpl += `^FO${x},${y}`;

    if (el.type === "text") {
      // Font schaling (1pt = 1/72 inch)
      const fontScale = printerDpi / 72;
      const h = Math.round(el.fontSize * fontScale); 
      const w = Math.round(el.fontSize * fontScale);
      zpl += `^A0N,${h},${w}`;
      zpl += `^FD${content}^FS\n`;
    } else if (el.type === "barcode") {
      // Code 128
      const h = Math.round((el.height || 10) * dpmm);
      // Module breedte schaling (standaard 2 dots bij 203dpi)
      const modWidth = Math.max(2, Math.round(2 * (printerDpi / 203)));
      zpl += `^BY${modWidth},3,${h}`;
      zpl += `^BCN,${h},N,N,N`;
      zpl += `^FD${content}^FS\n`;
    } else if (el.type === "qr") {
      // QR Code
      const baseMag = (el.width || 20) / 5;
      const mag = Math.max(2, Math.round(baseMag * (printerDpi / 203))); 
      zpl += `^BQN,2,${mag}`;
      zpl += `^FDQA,${content}^FS\n`;
    } else if (el.type === "box") {
        // Grafisch Kader
        const w = Math.round(el.width * dpmm);
        const h = Math.round(el.height * dpmm);
        const t = Math.round((el.thickness || 1) * dpmm);
        zpl += `^GB${w},${h},${t}^FS\n`;
    } else if (el.type === "line") {
        // Lijn
        const w = Math.round(el.width * dpmm);
        const h = Math.round(el.height * dpmm); 
        const t = Math.min(w, h) || 1;
        zpl += `^GB${w},${h},${t}^FS\n`; 
    }
  });

  zpl += "^XZ"; // Einde Formaat
  return zpl;
};

export const downloadZPL = (zpl, filename = "label.zpl") => {
    const blob = new Blob([zpl], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
