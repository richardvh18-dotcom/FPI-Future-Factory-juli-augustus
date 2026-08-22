import { getISOWeek } from "date-fns";

export const WORKSTATION_SCOPED_ORDERS_LIMIT = 800;

declare global {
  interface Window {
    __app_id?: string;
    MSStream?: unknown;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

export type TimestampLike = {
  toDate?: () => Date;
  seconds?: number;
};

export type DateValue = TimestampLike | string | number | Date | null | undefined;

export type PlanningOrder = {
  id?: string;
  orderId?: string;
  orderNumber?: string;
  item?: string;
  productCode?: string;
  plan?: number | string;
  quantity?: number | string;
  status?: string;
  machine?: string;
  week?: number | string;
  weekNumber?: number | string;
  weekYear?: number | string;
  year?: number | string;
  dateObj?: Date;
  plannedDate?: unknown;
  createdAt?: TimestampLike | string | number | Date | null;
  updatedAt?: TimestampLike | string | number | Date | null;
  [key: string]: unknown;
};

export type TrackedProductDoc = {
  id?: string;
  lotNumber?: string;
  orderId?: string;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  lastStation?: string;
  originMachine?: string;
  item?: string;
  itemCode?: string;
  machine?: string;
  reminderSent?: boolean;
  inspection?: { status?: string; timestamp?: unknown };
  timestamps?: {
    station_start?: TimestampLike | string | number | Date | null;
    started?: TimestampLike | string | number | Date | null;
    wikkelen_start?: TimestampLike | string | number | Date | null;
    lossen_start?: TimestampLike | string | number | Date | null;
    wikkelen_end?: TimestampLike | string | number | Date | null;
    finished?: TimestampLike | string | number | Date | null;
  };
  createdAt?: TimestampLike | string | number | Date | null;
  updatedAt?: TimestampLike | string | number | Date | null;
  [key: string]: unknown;
};

export const mergeTrackedProductDocs = (
  currentItems: TrackedProductDoc[],
  incomingItems: TrackedProductDoc[]
) => {
  const toMillis = (value: DateValue): number => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "object" && value !== null) {
      if (typeof (value as TimestampLike).toDate === "function") {
        return (value as TimestampLike).toDate!().getTime();
      }
      if (typeof (value as TimestampLike).seconds === "number") {
        return (value as TimestampLike).seconds! * 1000;
      }
    }
    const parsed = new Date(String(value)).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getFreshness = (item: TrackedProductDoc): number => {
    const updated = toMillis(item?.updatedAt);
    const created = toMillis(item?.createdAt);
    const started = toMillis(item?.timestamps?.station_start || item?.timestamps?.started);
    return Math.max(updated, created, started);
  };

  const merged = new Map<string, TrackedProductDoc>();
  currentItems.forEach((item) => {
    const key = String(item.id || item.orderId || item.lotNumber || "");
    if (key) merged.set(key, item);
  });
  incomingItems.forEach((item) => {
    const key = String(item.id || item.orderId || item.lotNumber || "");
    if (!key) return;

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      return;
    }

    // Neem altijd de meest recente snapshot-versie om statusovergangen
    // (bijv. BM01 -> Naharding) direct door te voeren in de UI.
    if (getFreshness(item) >= getFreshness(existing)) {
      merged.set(key, item);
    }
  });
  return Array.from(merged.values());
};

export type OccupancyEntry = {
  id?: string;
  machineId?: string;
  station?: string;
  date?: DateValue;
  shift?: string;
  isActive?: boolean;
  checkedOutAt?: unknown;
  operatorNumber?: string;
  operatorName?: string;
  hoursWorked?: number | string;
  shiftEffectiveStart?: DateValue;
  checkedInAt?: DateValue;
  isSecondary?: boolean;
  hoursAdjusted?: boolean;
  [key: string]: unknown;
};

export type DowntimeRecord = {
  id: string;
  [key: string]: unknown;
};

export type StartProductionOptions = {
  lotNumbers?: unknown[];
  seriesGroupId?: string;
  isFlangeSeries?: boolean;
};

export type StartProductionResult = {
  overflowLots?: string[];
  autoAssignedOverflow?: {
    linkedCount?: number;
    targetOrderId?: string;
    routeStation?: string;
  };
};

export type MoveLotOptions = {
  isRepairMove?: boolean;
  repairInstruction?: string;
};

export type PostProcessingPayload = {
  note?: string;
  reasons?: string[];
};

export type RepairCompletePayload = {
  actions?: string[];
  notes?: string;
};

export type RoutingToLossenResult = {
  switchedToLossenTab?: boolean;
};

export type DocSnapLike = {
  id: string;
  data: () => Record<string, unknown>;
  ref: {
    path: string;
  };
};

export type PersonnelEntry = {
  id?: string;
  employeeNumber?: string;
  personnelNumber?: string;
  number?: string;
  name?: string;
  shiftId?: string;
  temporaryShiftOverride?: {
    enabled?: boolean;
    startDate?: string;
    endDate?: string;
    shiftId?: string;
  };
  rotationSchedule?: {
    enabled?: boolean;
    startWeek?: number;
    shifts?: string[];
  };
  [key: string]: unknown;
};

export type AppUser = {
  uid?: string;
  email?: string | null;
  role?: string;
  [key: string]: unknown;
};

export type WorkstationHubProps = {
  initialStationId?: string | { name?: string };
  onExit?: () => void;
  searchOrder?: string | null;
};

export const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

export const LOSSEN_1218_SOURCE_STATIONS = new Set(["BH12"]);
export const LOSSEN_1218_STATION_NAME = "LOSSEN 12/18";
// Stations waarbij operators ook automatisch worden ingelogd bij LOSSEN 12/18
export const AUTO_LOSSEN_1218_SOURCE_STATIONS = new Set(["BH12", "BH15", "BH17", "BH18"]);

// Bepaal lossen route op basis van product type (TB/CB) en diameter
// TB 25-300mm  → tab lossen (lokaal)
// TB >= 300mm  → station LOSSEN (centraal)
// CB 25-350mm  → tab lossen (lokaal)
// CB >= 350mm  → station LOSSEN (centraal)
export const getLossenRoute = (itemText: unknown, originStation = "") => {
  const originNorm = String(originStation || "").toUpperCase().replace(/\s/g, "");
  const text = String(itemText || "").toUpperCase();
  const hasFlange = text.includes("FL") || text.includes("FLANGE");

  if (originNorm === "BH31" || originNorm === "BH16") return { mode: "STATION", station: "LOSSEN" };
  if (originNorm === "BH17") return { mode: "STATION", station: "MAZAK" };
  
  if (originNorm === "BH15") {
    if (hasFlange) return { mode: "STATION", station: "MAZAK" };
    return { mode: "STATION", station: LOSSEN_1218_STATION_NAME };
  }
  
  if (originNorm === "BH11") {
    if (hasFlange) return { mode: "STATION", station: "MAZAK" };
    return { mode: "STATION", station: "LOSSEN" };
  }

  if (LOSSEN_1218_SOURCE_STATIONS.has(originNorm)) {
    return { mode: "STATION", station: LOSSEN_1218_STATION_NAME };
  }


  const isTB = text.includes("TB");
  const isCB = text.includes("CB");
  const isELB = text.includes("ELB");
  const isAB = /\bAB\b/.test(text) || text.includes("ABAB");
  const isSB = /\bSB\b/.test(text);
  const isElbow = isELB || isCB;

  // Alle AB en SB elbows altijd naar centraal LOSSEN
  if (isElbow && (isAB || isSB)) return { mode: "STATION", station: "LOSSEN" };

  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((m) => Number(m[0]));
  const candidates = numberMatches.filter((n) => Number.isFinite(n) && n >= 25 && n <= 2000);
  const diameter = candidates.length > 0 ? candidates[0] : 0;

  if (isTB && diameter >= 300) return { mode: "STATION", station: "LOSSEN" };
  if ((isCB || isELB) && diameter >= 350) return { mode: "STATION", station: "LOSSEN" };
  
  return { mode: "TAB", station: originNorm || "" };
};

export const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isDateWithinInclusiveRange = (dateStr: unknown, startDateStr: unknown, endDateStr: unknown) => {
  if (!dateStr || !startDateStr) return false;
  const from = String(startDateStr);
  const to = String(endDateStr || startDateStr);
  return dateStr >= from && dateStr <= to;
};

export const normalizePlanningStatus = (status: unknown) => String(status || "").trim().toLowerCase();

export const isInactivePlanningStatus = (status: unknown) => {
  const normalized = normalizePlanningStatus(status);
  return ["completed", "cancelled", "shipped", "rejected", "finished", "deleted", "gereed", "afkeur", "klaar"].includes(normalized);
};

export const toFiniteNumber = (value: unknown) => {
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;

  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Dienst configuratie.
 * checkoutMinute = minuut van de dag waarop de dienst eindigt (voor auto-uitlog).
 * breakMinutes   = te verrekenen pauzetijd voor efficiency/uren (alleen voor DAGDIENST).
 */
export const SHIFT_CONFIG = {
  VROEG: { label: "VROEGE DIENST", checkinMinute: 6 * 60,       checkoutMinute: 14 * 60, breakMinutes: 0 },
  DAG:   { label: "DAGDIENST",     checkinMinute: 7 * 60 + 15,  checkoutMinute: 16 * 60, breakMinutes: 45 },
  LAAT:  { label: "LATE DIENST",   checkinMinute: 14 * 60,      checkoutMinute: 22 * 60, breakMinutes: 0 },
  NACHT: { label: "NACHTDIENST",   checkinMinute: 22 * 60,      checkoutMinute: 6 * 60,  breakMinutes: 0 },
};

export type ShiftKey = keyof typeof SHIFT_CONFIG;

/**
 * Bereken de effectieve starttijd voor een ploeg.
 * De timer begint altijd op het officiële starttijdstip van de ploeg,
 * ongeacht of de operator eerder of later inlogt.
 */
export const getShiftEffectiveStart = (shiftKey: ShiftKey, referenceDate = new Date()) => {
  const config = SHIFT_CONFIG[shiftKey];
  if (!config) return referenceDate;
  const startMinute = config.checkinMinute;
  const result = new Date(referenceDate);
  result.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
  // NACHT-dienst start om 22:00 vorige dag als het nu na middernacht is (bijv. 01:00)
  if (shiftKey === "NACHT") {
    const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
    if (nowMinutes < 12 * 60) {
      result.setDate(result.getDate() - 1);
    }
  }
  return result;
};

/**
 * Bepaal de dienstsleutel op basis van het huidige tijdstip.
 * Grenzen zijn gekozen op het midden tussen twee dienststartijden:
 *   VROEG  06:00 → check-in venster 05:00–07:14
 *   DAG    07:15 → check-in venster 07:15–13:44
 *   LAAT   13:50 → check-in venster 13:45–21:30
 *   NACHT  22:00 → rest
 */
export const getCurrentShiftKey = (date = new Date()): ShiftKey => {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= 5 * 60      && m < 7 * 60 + 15)  return "VROEG";
  if (m >= 7 * 60 + 15 && m < 13 * 60 + 45) return "DAG";
  if (m >= 13 * 60 + 45 && m < 21 * 60 + 30) return "LAAT";
  return "NACHT";
};

export const getCurrentShiftLabel = (date = new Date()) => {
  const key = getCurrentShiftKey(date);
  return SHIFT_CONFIG[key]?.label ?? "NACHTDIENST";
};

export const shiftMatchesBucket = (shiftLabel: unknown, bucket: ShiftKey) => {
  const label = String(shiftLabel || "").toUpperCase();
  if (bucket === "VROEG") return label.includes("VROEGE") || label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY");
  if (bucket === "DAG")   return label.includes("DAGDIENST") || label === "DAG" || label.includes("DAGPLOEG") || label.includes("DAY SHIFT");
  if (bucket === "LAAT")  return label.includes("LATE") || label.includes("AVOND") || label.includes("EVENING");
  if (bucket === "NACHT") return label.includes("NACHT") || label.includes("NIGHT");
  return false;
};

/**
 * Bepaal de dienstsleutel voor een persoon.
 * Leest eerst person.shiftId uit het personeelsbestand (bijv. "DAGDIENST", "VROEGE DIENST"),
 * en valt terug op kloktijd-detectie als het veld ontbreekt of niet herkend wordt.
 */
export const resolveShiftKeyFromPerson = (person: PersonnelEntry | null | undefined): ShiftKey => {
  const todayStr = getTodayString();
  const override = person?.temporaryShiftOverride;
  const overrideShiftId =
    override?.enabled && isDateWithinInclusiveRange(todayStr, override?.startDate, override?.endDate)
      ? String(override?.shiftId || "")
      : "";

  // Ploegenrotatie: bepaal welke ploeg actief is op basis van het weeknummer
  let shiftIdFromRotation = "";
  if (!overrideShiftId && person?.rotationSchedule?.enabled && (person.rotationSchedule.shifts || []).length > 0) {
    const today = new Date();
    const currentWeekNum = getISOWeek(today);
    const startWeekNum = person.rotationSchedule.startWeek || 1;
    const rotationShifts = person.rotationSchedule.shifts || [];
    const weeksSinceStart = currentWeekNum - startWeekNum;
    const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
    shiftIdFromRotation = String(rotationShifts[shiftIndex] || "");
  }

  const raw = String(overrideShiftId || shiftIdFromRotation || person?.shiftId || "").toUpperCase().trim();
  if (!raw) return getCurrentShiftKey();
  // Directe match op sleutel (bijv. "DAG", "VROEG", "LAAT", "NACHT")
  if (raw in SHIFT_CONFIG) return raw as ShiftKey;
  // Match via label-logica
  for (const key of Object.keys(SHIFT_CONFIG) as ShiftKey[]) {
    if (shiftMatchesBucket(raw, key)) return key;
  }
  // Fallback: kloktijd
  return getCurrentShiftKey();
};
