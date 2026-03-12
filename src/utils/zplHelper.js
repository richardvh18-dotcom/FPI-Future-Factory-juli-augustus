/**
 * ZPL Helper voor Future Factory Labels
 * Geavanceerde ZPL Rendering Engine (NiceLabel-style).
 * 
 * Features:
 * - Dynamische Lengte (^LL) voor papierbesparing
 * - Smart Cutter (^GS) voor snijden per batch
 * - 2-koloms ondersteuning
 * - Variabele injectie ({placeholder})
 * - Support voor Tekst, Barcode, QR, Box, Lijn, Image
 */

// Conversie helpers (203 DPI standaard)
const DEFAULT_DPI = 8; // 203 DPI = 8 dots/mm
const mmToDots = (mm) => Math.round(mm * DPI);
let DPI = DEFAULT_DPI;

/**
 * Vervangt placeholders zoals {itemCode} met echte data
 */
const parseContent = (text, data) => {
    if (!text) return "";
    return text.replace(/\{(\w+)\}/g, (_, key) => data[key] || "");
};

/**
 * Genereert ZPL code voor een productielabel
 * @param {Object} template - Het label ontwerp object (met elements array)
 * @param {Object} data - De variabele data
 * @param {number} printerDpi - DPI van de printer (default 203)
 * @returns {string} ZPL string
 */
export const generateZPL = (template, data, printerDpi = 203, resolveFn = null, t = null) => {
    // Update globale DPI setting
    DPI = printerDpi === 300 ? 12 : 8;

    // Fallback voor oude aanroepen (backward compatibility)
    // Als eerste argument geen template object is met elements, behandelen we het als 'data'
    if (!template.elements && !template.width) {
        return generateLegacyZPL(template, data); // data zit in 2e arg in oude call, maar hier in 1e
    }

    const {
        width = 90,
        height = 40,
        elements = [],
        darkness = 15,
        printSpeed = 3
    } = template;

    const {
        isLastOfBatch = true,
        columnIndex = 0,
        useDynamicLength = false // Kan true zijn als template dat toestaat
    } = data; // Data bevat nu ook de print-context opties

    // 1. Setup & Encoding
    let zpl = "^XA";            // Start Format
    zpl += "^CI28";             // UTF-8 Encoding
    zpl += `^PW${mmToDots(width)}`; // Print Width
    zpl += `^MD${darkness}`;    // Media Darkness (0-30)
    zpl += `^PR${printSpeed}`;  // Print Rate

    // 2. Dynamische Lengte (^LL)
    let labelHeightDots = mmToDots(height);
    if (useDynamicLength) {
        // Hier zou logica kunnen komen om hoogte te schalen o.b.v. content
        zpl += `^LL${labelHeightDots}`;
    } else {
        zpl += `^LL${labelHeightDots}`;
    }

    // 3. Kolom Berekening (X-Offset)
    // Als we 2 kolommen printen op 1 label (bijv. kleine stickers naast elkaar)
    const colOffsetMm = columnIndex === 1 ? (width / 2) : 0;
    const globalXOffset = mmToDots(colOffsetMm);

    // 4. Render Elements (De "NiceLabel" Engine)
    elements.forEach(el => {
        // Variabelen vervangen
        let content = el.content;
        if (resolveFn) {
             const resolved = resolveFn(el, data);
             content = resolved.content || "";
             if (t) content = t(content);
        } else {
             content = parseContent(el.content, data);
        }
        
        // Positie berekenen
        const x = globalXOffset + mmToDots(el.x);
        const y = mmToDots(el.y);
        
        // Rotatie
        const rotationMap = { 0: 'N', 90: 'R', 180: 'I', 270: 'B' };
        const rot = rotationMap[el.rotation || 0] || 'N';

        // Start Field
        zpl += `^FO${x},${y}`;

        // TYPE: TEXT
        if (el.type === 'text') {
            const fontHeight = mmToDots((el.fontSize || 12) / 2.8); // Ruwe conversie pt naar mm naar dots
            const fontWidth = fontHeight; // Monospace ratio
            
            // Font selectie (0 is scalable standard)
            zpl += `^A0${rot},${fontHeight},${fontWidth}`;
            
            // Field Block voor wrapping en alignment
            if (el.width) {
                const widthDots = mmToDots(el.width);
                const alignMap = { 'left': 'L', 'center': 'C', 'right': 'R', 'justify': 'J' };
                const align = alignMap[el.align] || 'L';
                zpl += `^FB${widthDots},${el.maxLines || 1},0,${align},0`;
            }

            // Inverted text (wit op zwart)
            if (el.inverted) {
                zpl += `^FR`;
            }

            zpl += `^FD${content}^FS`;
        }

        // TYPE: BARCODE (Code 128)
        else if (el.type === 'barcode') {
            const h = mmToDots(el.height || 10);
            const w = el.moduleWidth || 2; // Module width (dikte streepjes)
            const showText = el.showText ? 'Y' : 'N';
            zpl += `^BY${w},3,${h}`; // Module width, ratio, height
            zpl += `^BC${rot},${h},${showText},N,N`;
            zpl += `^FD${content}^FS`;
        }

        // TYPE: QR CODE
        else if (el.type === 'qr') {
            // ^BQ orientation, model, magnification, error correction, mask
            const mag = el.magnification || 4; // Grootte (1-10)
            zpl += `^BQN,2,${mag},Q,7`;
            zpl += `^FDQA,${content}^FS`;
        }

        // TYPE: BOX / LINE
        else if (el.type === 'box' || el.type === 'line') {
            const w = mmToDots(el.width || 1);
            const h = mmToDots(el.height || 1);
            const t = mmToDots(el.thickness || 0.5);
            const color = el.color === 'white' ? 'W' : 'B'; // Black or White lines
            zpl += `^GB${w},${h},${t},${color},0^FS`;
        }

        // TYPE: IMAGE (Placeholder voor logo's)
        else if (el.type === 'image' && el.hexData) {
            // ^GFA = Graphic Field ASCII
            // Dit vereist dat de image data al geconverteerd is naar ZPL Hex formaat
            zpl += `^GFA,${el.byteCount},${el.totalBytes},${el.rowBytes},${el.hexData}^FS`;
        }
    });

    // 5. Smart Cutter Logica (^GS)
    if (isLastOfBatch) {
        zpl += "^MMC"; // Cut Mode
        zpl += "^GS";  // Group Separator (Batch Cut)
        zpl += "^PQ1,0,1,Y"; // Print Quantity & Override Pause
    } else {
        zpl += "^MMT"; // Tear-off Mode
        zpl += "^PQ1,0,1,N";
    }

    zpl += "^XZ"; // Einde Format
    return zpl;
};

// --- LEGACY SUPPORT (Voor hardcoded tests) ---
const generateLegacyZPL = (data, options) => {
    // Converteer oude data naar nieuwe template structuur
    const template = {
        width: options.paperWidthMm || 90,
        height: options.baseHeightMm || 40,
        elements: [
            { type: 'text', x: 2, y: 4, fontSize: 14, content: data.itemCode || 'UNKNOWN' },
            { type: 'text', x: 2, y: 12, fontSize: 8, content: data.description || '', width: 40, maxLines: 2 },
            { type: 'text', x: 2, y: 20, fontSize: 6, content: data.lotNumber },
            { type: 'text', x: 2, y: 23, fontSize: 6, content: new Date().toLocaleDateString('nl-NL') },
            { type: 'barcode', x: 2, y: 27, height: 8, content: data.lotNumber, showText: true }
        ]
    };
    return generateZPL(template, { ...data, ...options });
};

/**
 * Helper om een test-label te genereren
 */
export const getTestZPL = () => {
    const testTemplate = {
        width: 90,
        height: 40,
        darkness: 20,
        elements: [
            { type: 'box', x: 1, y: 1, width: 88, height: 38, thickness: 0.5 }, // Kader
            { type: 'text', x: 5, y: 5, fontSize: 12, content: "ZPL ENGINE TEST", isBold: true },
            { type: 'line', x: 5, y: 10, width: 80, height: 0.5 }, // Lijn
            { type: 'text', x: 5, y: 15, fontSize: 8, content: "Variabele: {var1}" },
            { type: 'qr', x: 60, y: 12, content: "https://fpi-future-factory.web.app", magnification: 3 }
        ]
    };
    
    return generateZPL(testTemplate, { 
        var1: "Werkt!", 
        isLastOfBatch: true 
    });
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

export const logPrintAction = async (user, labelName, printerIp, data) => {
    try {
        const { db } = await import("../config/firebase");
        const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
        await addDoc(collection(db, "future-factory", "public", "data", "system_logs"), {
            action: "PRINT_LABEL",
            user: user?.email || "unknown",
            userId: user?.uid || "unknown",
            label: labelName || "Unknown Label",
            printer: printerIp || "Local/PDF",
            lotNumber: data?.lotNumber || "N/A",
            timestamp: serverTimestamp(),
            details: `Printed ${labelName} for lot ${data?.lotNumber}`
        });
    } catch (e) {
        console.error("Failed to log print action", e);
    }
};

export const checkPrinterStatus = async (ip) => {
    if (!ip) return { online: false, message: "No IP" };
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000);
        await fetch(`http://${ip}/`, { signal: controller.signal, mode: 'no-cors' });
        clearTimeout(id);
        return { online: true, message: "Ready" };
    } catch (e) {
        return { online: false, message: "Printer Unreachable" };
    }
};