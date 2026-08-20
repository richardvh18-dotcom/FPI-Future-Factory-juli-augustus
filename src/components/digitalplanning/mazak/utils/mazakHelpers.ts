import { format } from "date-fns";
import { ProductItem, LabelTemplate, DisplayRow, SeriesHeaderRow } from '../mazak.types';

export const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";

export const DEFAULT_MAZAK_DPI = 300;

export const FREE_TEXT_LABEL_TEMPLATE: LabelTemplate = {
  id: "MAZAK-FREE-TEXT-90x35",
  name: "Vrij tekst 100x25",
  width: 100,
  height: 25,
  elements: [
    { type: "text", x: 3, y: 2, width: 94, height: 21, fontSize: 10, isBold: true, content: "{freeText}", maxLines: 4 },
  ],
};

export const clampFreeLabelFontSize = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(6, Math.min(75, parsed));
};

export const isSeriesHeaderRow = (row: DisplayRow): row is SeriesHeaderRow =>
  (row as SeriesHeaderRow).isSeriesHeader === true;

export const toMillisFromMixed = (value: unknown): number => {
  if (!value) return 0;
  if (typeof (value as TimestampLike).toDate === "function") {
    const date = (value as TimestampLike).toDate?.();
    return date ? date.getTime() : 0;
  }
  if (typeof (value as TimestampLike).seconds === "number") {
    return Number((value as TimestampLike).seconds) * 1000;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const getUrgencyColorClass = (value: unknown): string => {
  const dateMillis = toMillisFromMixed(value);
  if (!dateMillis) return "text-slate-400";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deliveryDate = new Date(dateMillis);
  deliveryDate.setHours(0, 0, 0, 0);

  const diffInDays = Math.floor((deliveryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (diffInDays <= 7) return "text-red-600 font-black";
  if (diffInDays <= 14) return "text-blue-600 font-black";
  return "text-slate-600 font-bold";
};

export const isSeriesEligibleItem = (item: ProductItem) => {
  const statusUpper = String(item?.status || "").toUpperCase();
  const stepUpper = String(item?.currentStep || "").toUpperCase();
  return statusUpper !== "REJECTED" && stepUpper !== "REJECTED";
};

export const getLotSeriesPrefix = (lotNumber: unknown) => {
  const raw = String(lotNumber || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(.*?)(\d{3})$/);
  if (!match) return "";
  return match[1];
};

export const getLotSeriesSequence = (lotNumber: unknown): number | null => {
  const raw = String(lotNumber || "").trim();
  if (!raw) return null;
  const match = raw.match(/(\d{3})$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getOrderIdFamily = (orderId: unknown): string => {
  const raw = String(orderId || "").trim().toUpperCase();
  if (!raw) return "";
  const match = raw.match(/\d{3}/);
  return match ? match[0] : "";
};

export const getFlangeSizeToken = (value: unknown): string => {
  const raw = String(value || "").toUpperCase();
  if (!raw) return "";

  const normalizeCandidate = (token: string): string => {
    const cleaned = String(token || "").replace(/^0+/, "");
    const parsed = Number.parseInt(cleaned || "0", 10);
    if (!Number.isFinite(parsed) || parsed < 40 || parsed > 1200) return "";
    return String(parsed);
  };

  // Voorbeelden die we willen kunnen lezen:
  // "FL 350", "FL-350", "FLENS 350", "FLANGE350", "DN350", "350MM"
  const patterns = [
    /\bFL(?:ENS|ANGE)?\s*[-_/]*\s*(\d{2,4})\b/,
    /\bDN\s*[-_/]*\s*(\d{2,4})\b/,
    /\b(\d{2,4})\s*MM\b/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const normalized = normalizeCandidate(match?.[1] || "");
    if (normalized) return normalized;
  }

  // Fallback voor samengestelde itemcodes waar FL-maat niet als los woord staat,
  // bijvoorbeeld "FLST...0350...". Alleen toepassen als er FL-hints aanwezig zijn.
  const hasFlangeHint = /FL|FLS|FLST|FLENS|FLANGE/.test(raw);
  if (!hasFlangeHint) return "";

  const knownDiameters = new Set([
    40, 50, 60, 65, 75, 80, 90, 100, 110, 125, 140, 150, 160, 180, 200,
    225, 250, 280, 300, 315, 320, 350, 355, 400, 450, 500, 560, 600, 630,
    700, 710, 750, 800, 900, 1000, 1100, 1200,
  ]);

  const numberMatches = raw.match(/\d{2,4}/g) || [];
  const normalizedNumbers = numberMatches
    .map((token) => normalizeCandidate(token))
    .filter(Boolean);

  if (normalizedNumbers.length === 0) return "";

  const knownMatch = normalizedNumbers.find((token) => knownDiameters.has(Number(token)));
  if (knownMatch) return knownMatch;

  return normalizedNumbers[0] || "";
};

export const stationNameFromValue = (stationValue: unknown): string => {
  if (!stationValue) return "";
  if (typeof stationValue === "string") return stationValue.trim();
  if (typeof stationValue === "object") {
    const stationObj = stationValue as Record<string, unknown>;
    return String(
      stationObj.name || stationObj.station || stationObj.id || stationObj.code || ""
    ).trim();
  }
  return String(stationValue).trim();
};

export const hasFlangeTag = (template: LabelTemplate): boolean => {
  const tags = Array.isArray(template?.tags)
    ? template.tags.map((tag) => String(tag || "").toUpperCase().trim())
    : [];
  return tags.includes("FLANGE");
};

export const getMaterialIntentTags = (product: ProductItem): Set<string> => {
  const combined = [
    product?.item,
    product?.itemCode,
    product?.productId,
    product?.extraCode,
    (product as Record<string, unknown>)?.itemDescription,
    (product as Record<string, unknown>)?.description,
    (product as Record<string, unknown>)?.articleDescription,
  ]
    .map((value) => String(value || "").toUpperCase())
    .join(" ");

  const tags = new Set<string>();

  if (/\bEST\d*\b/.test(combined)) {
    tags.add("EST");
    tags.add("WAVISTRONG");
  }
  if (/\bCST\d*\b/.test(combined)) {
    tags.add("CST");
    tags.add("WAVISTRONG");
    tags.add("CONDUCTIVE");
  }
  if (/\bEWT\d*\b/.test(combined)) {
    tags.add("EWT");
    tags.add("WAVISTRONG");
  }
  if (/\bEMT\d*\b/.test(combined)) {
    tags.add("EMT");
    tags.add("FIBERMAR");
  }
  if (/\bCMT\d*\b/.test(combined)) {
    tags.add("CMT");
    tags.add("FIBERMAR");
    tags.add("CONDUCTIVE");
  }

  if (combined.includes("WAVISTRONG")) tags.add("WAVISTRONG");
  if (combined.includes("FIBERMAR")) tags.add("FIBERMAR");

  return tags;
};

export const scoreTemplateForProductIntent = (template: LabelTemplate, intentTags: Set<string>): number => {
  const tags = Array.isArray(template?.tags)
    ? template.tags.map((tag) => String(tag || "").toUpperCase().trim()).filter(Boolean)
    : [];
  const tagSet = new Set(tags);
  const nameUpper = String(template?.name || "").toUpperCase();

  let score = 0;

  if (tagSet.has("FLANGE") || tagSet.has("FLENS") || tagSet.has("FLENZEN")) score += 30;

  if (intentTags.has("EST") && tagSet.has("EST")) score += 140;
  if (intentTags.has("CST") && tagSet.has("CST")) score += 140;
  if (intentTags.has("EWT") && tagSet.has("EWT")) score += 140;
  if (intentTags.has("EMT") && tagSet.has("EMT")) score += 140;
  if (intentTags.has("CMT") && tagSet.has("CMT")) score += 140;

  if (intentTags.has("WAVISTRONG") && tagSet.has("WAVISTRONG")) score += 90;
  if (intentTags.has("FIBERMAR") && tagSet.has("FIBERMAR")) score += 90;
  if (intentTags.has("CONDUCTIVE") && tagSet.has("CONDUCTIVE")) score += 50;

  if (intentTags.has("WAVISTRONG") && !intentTags.has("FIBERMAR") && tagSet.has("FIBERMAR")) score -= 120;
  if (intentTags.has("FIBERMAR") && !intentTags.has("WAVISTRONG") && tagSet.has("WAVISTRONG")) score -= 120;

  if (intentTags.has("WAVISTRONG") && nameUpper.includes("WAVISTRONG")) score += 25;
  if (intentTags.has("FIBERMAR") && nameUpper.includes("FIBERMAR")) score += 25;

  return score;
};

export const selectQueuePrinterForStation = (
  printers: PrinterConfig[],
  stationId: string,
  templateTags: string[] = []
): PrinterConfig | null => {
  if (!Array.isArray(printers) || printers.length === 0) return null;
  return resolvePrinterForRouting(printers, {
    stationId,
    routeKey: 'MAZAK',
    labelRoute: 'mazak',
    templateTags,
  });
};

export const templateExtraCodeTokens = (template: LabelTemplate): string[] => {
  const candidates: unknown[] = [
    template?.extraCodes,
    template?.requiredExtraCodes,
    template?.applicableExtraCodes,
    template?.extraCode,
  ];

  const flattened: string[] = candidates.flatMap((value) => {
    if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim());
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
  });

  return Array.from(new Set(flattened.map((entry) => entry.toUpperCase()).filter(Boolean)));
};

export const getItemNominalDiameter = (item: Record<string, unknown>): number => {
  const itemIdentifier = [item?.item, item?.itemCode, item?.itemDescription].join(" ").toUpperCase();
  const match = itemIdentifier.match(/\b(\d{2,4})\s*(?:MM|-|R|X|\b)/);
  const parsed = match ? parseInt(match[1], 10) : parseInt(String(item?.diameter || item?.dn || "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const extractQueuedJobId = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const row = value as Record<string, unknown>;
  const direct = String(row.jobId || row.id || "").trim();
  if (direct) return direct;

  const nested = row.data as Record<string, unknown> | undefined;
  return String(nested?.jobId || nested?.id || "").trim();
};

export const applyBatchCutMode = (zpl: string, shouldCut: boolean, quantity: number = 1): string => {
  // Gebruik ALTIJD ^MMT (Tear-off mode) om te voorkomen dat de printer automatisch knipt na elk label (^XZ).
  // We sturen de knip-opdracht handmatig aan het einde van de batch met ~JK (Delayed Cut).
  const cutMedia = "^MMT";
  // Gebruik ^PQ altijd met N (no pause), omdat we geen pauzes willen tussen labels.
  const cutPq = `^PQ${quantity},0,0,N`;
  let modified = String(zpl || "");
  
  if (/\^MM[^^\n]*/.test(modified)) {
    modified = modified.replace(/\^MM[^^\n]*/g, cutMedia);
  } else {
    modified = modified.replace(/\^XA/i, `^XA\n${cutMedia}`);
  }

  if (/\^PQ[^^\n]*/.test(modified)) {
    modified = modified.replace(/\^PQ[^^\n]*/g, cutPq);
  } else {
    modified = modified.replace(/\^XZ/i, `\n${cutPq}\n^XZ`);
  }

  // Als dit het allerlaatste label in de batch is, trigger de knipschaar met ~JK
  if (shouldCut) {
    modified += "\n~JK";
  }

  return modified;
};