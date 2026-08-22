const normalizeRouteToken = (value: unknown): string =>
  {
    const compact = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/^#+/, "")
      .replace(/\s+/g, "")
      .replace(/^40(?=BH|BM|BA)/, "");

    // Legacy alias op de vloer: BM18/40BM18 is functioneel BH18.
    if (compact === "BM18") return "BH18";

    return compact;
  };

const toTokenList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeRouteToken(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[;,\n]/)
      .map((entry) => normalizeRouteToken(entry))
      .filter(Boolean);
  }

  return [];
};

export type PrinterRoutingRule = {
  id?: string;
  conditionType: string; // 'itemCode', 'station', etc.
  operator: string;      // 'startsWith', 'regex', 'equals'
  conditionValue: string;
  targetPrinter: string;
  isActive?: boolean;
};

export type PrinterRoutingContext = {
  stationId?: string;
  routeKey?: string;
  labelRoute?: string;
  labelType?: string;
  itemCode?: string;
  item?: string;
  isFlange?: boolean;
  templateTags?: string[];
};

export type PrinterRoutingTarget = {
  id?: string;
  name?: string;
  queueStations?: unknown;
  linkedStations?: unknown;
  routingKeys?: unknown;
  routingTags?: unknown;
  isDefault?: boolean;
  [key: string]: unknown;
};

export const getPrinterRoutingCandidates = (
  context: PrinterRoutingContext = {},
  dynamicRules: PrinterRoutingRule[] = []
): string[] => {
  const candidates = new Set<string>();
  const station = normalizeRouteToken(context.stationId);
  const routeKey = normalizeRouteToken(context.routeKey || context.labelRoute || context.labelType);
  const templateTags = toTokenList(context.templateTags);

  if (routeKey) candidates.add(routeKey);
  if (station) {
    candidates.add(station);
    candidates.add(`STATION:${station}`);
    candidates.add(`QUEUE:${station}`);
  }

  for (const templateTag of templateTags) {
    candidates.add(templateTag);
    candidates.add(`LABEL:${templateTag}`);
    candidates.add(`ROUTE:${templateTag}`);
  }

  const itemCode = normalizeRouteToken(context.itemCode || context.item);
  const hasFlangeTemplateTag = templateTags.includes("FLANGE") || templateTags.includes("FLENS") || templateTags.includes("FLENZEN");
  
  // Apply dynamic rules from Firestore if provided
  if (dynamicRules && dynamicRules.length > 0) {
    for (const rule of dynamicRules) {
      if (!rule.isActive) continue;
      
      let matched = false;
      const targetVal = rule.conditionType === 'station' ? station : 
                        rule.conditionType === 'itemCode' ? itemCode : '';
      
      if (rule.operator === 'startsWith') {
        matched = targetVal.startsWith(rule.conditionValue);
      } else if (rule.operator === 'regex') {
        try {
          const re = new RegExp(rule.conditionValue, 'i');
          matched = re.test(targetVal);
        } catch(e) {
          console.warn("Invalid regex in printer rule:", rule.conditionValue);
        }
      } else if (rule.operator === 'equals') {
        matched = targetVal === rule.conditionValue;
      }

      if (matched && rule.targetPrinter) {
        candidates.add(rule.targetPrinter);
        candidates.add(`ROUTE:${rule.targetPrinter}`);
        candidates.add(`LABEL:${rule.targetPrinter}`);
      }
    }
  }

  // Fallback / legacy hardcoded rules (in case dynamic rules are not passed/loaded yet)
  if (context.isFlange || itemCode.startsWith("FL") || hasFlangeTemplateTag) {
    candidates.add("MAZAK");
    candidates.add("FLANGE");
    candidates.add("LABEL:MAZAK");
    candidates.add("ROUTE:MAZAK");
    candidates.add("ROUTE:FLANGE");
  }

  if (station && /^BH\d+$/i.test(station)) {
    candidates.add("GENERAL");
    candidates.add("LARGE");
    candidates.add("BIGLABEL");
    candidates.add("ROUTE:GENERAL");
    candidates.add(`GENERAL:${station}`);
    candidates.add(`BH:${station}`);
  }

  if (station && /^BM\d+$/i.test(station)) {
    candidates.add("BM");
  }

  return Array.from(candidates).filter(Boolean);
};

export const getPrinterRoutingTokens = (printer: PrinterRoutingTarget | null | undefined): string[] => {
  if (!printer) return [];

  const tokens = new Set<string>();
  if (printer.id) tokens.add(normalizeRouteToken(printer.id));
  toTokenList(printer.routingKeys).forEach((entry) => tokens.add(entry));
  toTokenList(printer.routingTags).forEach((entry) => tokens.add(entry));
  toTokenList(printer.queueStations).forEach((entry) => tokens.add(entry));
  toTokenList(printer.linkedStations).forEach((entry) => tokens.add(entry));

  if (printer.name) {
    tokens.add(normalizeRouteToken(printer.name));
  }

  return Array.from(tokens).filter(Boolean);
};

const getActiveDynamicTargets = (
  context: PrinterRoutingContext,
  dynamicRules: PrinterRoutingRule[]
): string[] => {
  const station = normalizeRouteToken(context.stationId);
  const itemCode = normalizeRouteToken(context.itemCode || context.item);

  return dynamicRules
    .filter((rule) => rule.isActive && rule.targetPrinter)
    .filter((rule) => {
      const targetValue = rule.conditionType === 'station'
        ? station
        : rule.conditionType === 'itemCode'
          ? itemCode
          : '';
      const conditionValue = normalizeRouteToken(rule.conditionValue);

      if (rule.operator === 'startsWith') return targetValue.startsWith(conditionValue);
      if (rule.operator === 'equals') return targetValue === conditionValue;
      if (rule.operator === 'regex') {
        try {
          return new RegExp(rule.conditionValue, 'i').test(targetValue);
        } catch {
          return false;
        }
      }
      return false;
    })
    .map((rule) => normalizeRouteToken(rule.targetPrinter))
    .filter(Boolean);
};

const getPersistedStationBinding = (context: PrinterRoutingContext = {}): string => {
  const stationKey = normalizeRouteToken(context.stationId || context.routeKey || context.labelRoute || context.labelType);
  if (!stationKey) return '';

  try {
    const raw = String(globalThis.localStorage?.getItem?.('print_station_printer_bindings_v1') || '').trim();
    if (!raw) return '';

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const matchedKey = Object.keys(parsed || {}).find((key) => normalizeRouteToken(key) === stationKey);
    if (!matchedKey) return '';
    return String(parsed[matchedKey] || '').trim();
  } catch {
    return '';
  }
};

export const resolvePrinterForRouting = <T extends PrinterRoutingTarget>(
  printers: T[],
  context: PrinterRoutingContext = {},
  dynamicRules: PrinterRoutingRule[] = []
): T | null => {
  if (!Array.isArray(printers) || printers.length === 0) return null;

  const dynamicTargets = getActiveDynamicTargets(context, dynamicRules);
  if (dynamicTargets.length > 0) {
    const dynamicPrinter = printers.find((printer) => {
      const printerTokens = getPrinterRoutingTokens(printer);
      return dynamicTargets.some((target) => printerTokens.includes(target));
    });
    if (dynamicPrinter) return dynamicPrinter;
  }

  const persistedBindingId = getPersistedStationBinding(context);
  let persistedPrinter: T | null = null;
  if (persistedBindingId) {
    persistedPrinter = printers.find((printer) => String(printer.id || '').trim() === persistedBindingId) || null;
  }

  const candidates = getPrinterRoutingCandidates(context, dynamicRules);
  if (candidates.length === 0) return persistedPrinter;

  let bestPrinter: T | null = null;
  let bestScore = 0;

  for (const printer of printers) {
    const tokens = getPrinterRoutingTokens(printer);
    if (tokens.length === 0) continue;

    let score = 0;
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (tokens.includes(candidate)) {
        if (candidate.startsWith("ROUTE:") || candidate.startsWith("LABEL:")) {
          score += 6;
        } else if (candidate.startsWith("STATION:") || candidate.startsWith("QUEUE:")) {
          score += 5;
        } else if (candidate.startsWith("GENERAL:")) {
          score += 4;
        } else if (candidate === "GENERAL" || candidate === "LARGE" || candidate === "BIGLABEL") {
          score += 2;
        } else {
          score += 3;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPrinter = printer;
    }
  }

  // Database matches take priority over the legacy browser binding fallback.
  return bestPrinter || persistedPrinter || null;
};

export const serializeRoutingKeys = (value: unknown): string[] => {
  return Array.from(new Set(toTokenList(value)));
};
