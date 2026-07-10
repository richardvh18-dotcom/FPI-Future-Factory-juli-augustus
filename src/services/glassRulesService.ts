import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";

export type GlassProductType = "tee" | "endcap" | "manhole_bottom";

export type GlassRuleRecord = {
  id: string;
  productType: GlassProductType;
  family: string;
  connectionType: string;
  sourceSheet: string;
  sourceRow: number;
  key: string;
  itemCode: string;
  pressureBar?: number | null;
  innerDiameterMm?: number | null;
  branchDiameterMm?: number | null;
  wallThicknessMm?: number | null;
  cycles?: number | null;
  countBig?: number | null;
  countSmall?: number | null;
  mats?: {
    bigWoven?: { lengthMm?: number | null; widthMm?: number | null; countPerCycle?: number | null; totalCount?: number | null };
    smallWoven?: { lengthMm?: number | null; widthMm?: number | null; countPerCycle?: number | null; totalCount?: number | null };
    smallCGlass?: { lengthMm?: number | null; widthMm?: number | null; countPerCycle?: number | null; totalCount?: number | null };
    bigCGlass?: { lengthMm?: number | null; widthMm?: number | null; countPerCycle?: number | null; totalCount?: number | null };
    woven360?: { lengthMm?: number | null; widthMm?: number | null; countPerCycle?: number | null; totalCount?: number | null };
  };
  notes?: string[];
  geometry?: Record<string, number | string | null | undefined>;
  isActive?: boolean;
};

export type GlassRuleSearchInput = {
  productType: GlassProductType;
  family?: string;
  connectionType?: string;
  pressureBar?: number;
  innerDiameterMm?: number;
  branchDiameterMm?: number;
  wallThicknessMm?: number;
  domeWallThicknessMm?: number;
  knuckleWallThicknessMm?: number;
  socketLengthMm?: number;
};

export type GlassCutListRow = {
  material: string;
  lengthMm: number;
  widthMm: number;
  count: number;
  countPerCycle?: number;
};

const toNum = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, ".").replace(/[^0-9.-]/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isSameNumber = (a: number | null | undefined, b: number | null | undefined, tolerance = 0.001) => {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
};

const distance = (a: number | null | undefined, b: number | null | undefined) => {
  if (b == null) return 0;
  if (a == null) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b);
};

export const loadActiveGlassRulesByType = async (productType: GlassProductType): Promise<GlassRuleRecord[]> => {
  const rulesPath = getPathString(PATHS.GLASS_RULES);
  const q = query(
    collection(db, rulesPath),
    where("isActive", "==", true),
    where("productType", "==", productType)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GlassRuleRecord, "id">) }));
};

const scoreTee = (rule: GlassRuleRecord, input: GlassRuleSearchInput): number => {
  let score = 0;

  if (input.family) {
    if (String(rule.family || "").toLowerCase() !== String(input.family || "").toLowerCase()) return Number.POSITIVE_INFINITY;
    score += 0;
  }

  if (input.connectionType) {
    if (String(rule.connectionType || "").toLowerCase() !== String(input.connectionType || "").toLowerCase()) return Number.POSITIVE_INFINITY;
    score += 0;
  }

  if (!isSameNumber(toNum(rule.pressureBar), input.pressureBar)) return Number.POSITIVE_INFINITY;
  if (!isSameNumber(toNum(rule.innerDiameterMm), input.innerDiameterMm)) return Number.POSITIVE_INFINITY;
  if (!isSameNumber(toNum(rule.branchDiameterMm), input.branchDiameterMm)) return Number.POSITIVE_INFINITY;

  score += distance(toNum(rule.wallThicknessMm), input.wallThicknessMm);
  return score;
};

const scoreEndcap = (rule: GlassRuleRecord, input: GlassRuleSearchInput): number => {
  if (!isSameNumber(toNum(rule.pressureBar), input.pressureBar)) return Number.POSITIVE_INFINITY;
  if (!isSameNumber(toNum(rule.innerDiameterMm), input.innerDiameterMm)) return Number.POSITIVE_INFINITY;

  const twc = toNum(rule.geometry?.domeWallThicknessMm);
  const twk = toNum(rule.geometry?.knuckleWallThicknessMm);

  let score = 0;
  score += distance(twc, input.domeWallThicknessMm);
  score += distance(twk, input.knuckleWallThicknessMm);
  return score;
};

const scoreManhole = (rule: GlassRuleRecord, input: GlassRuleSearchInput): number => {
  if (!isSameNumber(toNum(rule.pressureBar), input.pressureBar)) return Number.POSITIVE_INFINITY;
  if (!isSameNumber(toNum(rule.innerDiameterMm), input.innerDiameterMm)) return Number.POSITIVE_INFINITY;

  const socketLength = toNum(rule.geometry?.socketLengthMm);
  return distance(socketLength, input.socketLengthMm);
};

export const findBestGlassRule = (rules: GlassRuleRecord[], input: GlassRuleSearchInput): GlassRuleRecord | null => {
  if (!rules.length) return null;

  const scored = rules.map((rule) => {
    let score = Number.POSITIVE_INFINITY;
    if (input.productType === "tee") score = scoreTee(rule, input);
    if (input.productType === "endcap") score = scoreEndcap(rule, input);
    if (input.productType === "manhole_bottom") score = scoreManhole(rule, input);
    return { rule, score };
  });

  scored.sort((a, b) => a.score - b.score);
  if (!Number.isFinite(scored[0]?.score)) return null;
  return scored[0].rule;
};

export const buildGlassCutList = (rule: GlassRuleRecord): GlassCutListRow[] => {
  const mats = rule.mats || {};
  const rows: GlassCutListRow[] = [];

  const pushMat = (
    material: string,
    mat: { lengthMm?: number | null; widthMm?: number | null; countPerCycle?: number | null; totalCount?: number | null } | undefined
  ) => {
    if (!mat) return;
    const lengthMm = toNum(mat.lengthMm);
    const widthMm = toNum(mat.widthMm);
    const countPerCycle = toNum(mat.countPerCycle);
    const totalCount = toNum(mat.totalCount);
    const cycles = toNum(rule.cycles);

    if (lengthMm == null || widthMm == null) return;

    let count = totalCount;
    if (count == null && countPerCycle != null && cycles != null) {
      count = Math.max(0, Math.round(countPerCycle * cycles));
    }
    if (count == null) {
      count = countPerCycle != null ? countPerCycle : 0;
    }

    rows.push({
      material,
      lengthMm,
      widthMm,
      count,
      countPerCycle: countPerCycle == null ? undefined : countPerCycle,
    });
  };

  pushMat("Groot Weefsel", mats.bigWoven);
  pushMat("Klein Weefsel", mats.smallWoven);
  pushMat("Klein C-glass", mats.smallCGlass);
  pushMat("Groot C-glass", mats.bigCGlass);
  pushMat("Weefsel 360", mats.woven360);

  return rows.filter((row) => row.count > 0);
};
