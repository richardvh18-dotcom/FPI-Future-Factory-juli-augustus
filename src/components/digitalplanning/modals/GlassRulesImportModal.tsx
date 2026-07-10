import React, { useMemo, useRef, useState } from "react";
import { X, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { collection, doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS, getPathString } from "../../../config/dbPaths";
import { useNotifications } from "../../../contexts/NotificationContext";

type ValidationIssue = {
  severity: "error" | "warning";
  sheet: string;
  row: number;
  message: string;
};

type MatRule = {
  lengthMm?: number | null;
  widthMm?: number | null;
  countPerCycle?: number | null;
  totalCount?: number | null;
};

type GlassRuleRecord = {
  id: string;
  importId?: string;
  productType: "tee" | "endcap" | "manhole_bottom";
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
  productName?: string;
  articleNumber?: string;
  weightKg?: number | null;
  cycles?: number | null;
  countBig?: number | null;
  countSmall?: number | null;
  twPerCycle?: number | null;
  oldCycles?: number | null;
  notes?: string[];
  mats: {
    bigWoven?: MatRule;
    smallWoven?: MatRule;
    smallCGlass?: MatRule;
    bigCGlass?: MatRule;
    woven360?: MatRule;
  };
  geometry?: Record<string, number | string | null | undefined>;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type ParseResult = {
  rules: GlassRuleRecord[];
  issues: ValidationIssue[];
  sourceRevision: string;
  sourceVersionLabel: string;
};

type GlassRulesImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const REQUIRED_SHEETS = [
  "Wavistrong CBCBCB",
  "Wavistrong TBTBTB",
  "Fibermar CBCBCB",
  "Special",
  "Endcap PL",
  "Manhole Bottom",
  "Revision",
  "Design Endcap >1500mm",
] as const;

const toNumber = (value: unknown): number | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, ".").replace(/[^0-9.-]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toText = (value: unknown): string => String(value ?? "").trim();

const toDocId = (value: string): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180) || "rule";

const addIssue = (
  issues: ValidationIssue[],
  severity: "error" | "warning",
  sheet: string,
  row: number,
  message: string
) => {
  issues.push({ severity, sheet, row, message });
};

const parseTeeSheet = (
  wb: XLSX.WorkBook,
  sheetName: string,
  family: string,
  connectionType: string,
  issues: ValidationIssue[]
): GlassRuleRecord[] => {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as unknown[][];
  const records: GlassRuleRecord[] = [];

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const itemCode = toText(row[0]);
    if (!itemCode) continue;
    if (!/[0-9]/.test(itemCode)) continue;

    const pressureBar = toNumber(row[1]);
    const innerDiameterMm = toNumber(row[2]);
    const branchDiameterMm = toNumber(row[3]);
    const wallThicknessMm = toNumber(row[4]);

    if (pressureBar == null || innerDiameterMm == null || branchDiameterMm == null) {
      addIssue(issues, "warning", sheetName, r + 1, "Rij overgeslagen: ontbrekende PN/ID/ID1.");
      continue;
    }

    const cycles = toNumber(row[24]);
    const countBig = toNumber(row[25]);
    const countSmall = toNumber(row[26]);

    const key = ["tee", family, connectionType, pressureBar, innerDiameterMm, branchDiameterMm].join("|");

    records.push({
      id: toDocId(key),
      productType: "tee",
      family,
      connectionType,
      sourceSheet: sheetName,
      sourceRow: r + 1,
      key,
      itemCode,
      pressureBar,
      innerDiameterMm,
      branchDiameterMm,
      wallThicknessMm,
      productName: toText(row[11]),
      articleNumber: toText(row[10]),
      weightKg: toNumber(row[9]),
      cycles,
      countBig,
      countSmall,
      twPerCycle: toNumber(row[28]),
      oldCycles: toNumber(row[30]),
      mats: {
        bigWoven: {
          lengthMm: toNumber(row[12]),
          widthMm: toNumber(row[13]),
          countPerCycle: toNumber(row[14]),
          totalCount: cycles != null && countBig != null ? Math.round(cycles * countBig) : null,
        },
        smallWoven: {
          lengthMm: toNumber(row[15]),
          widthMm: toNumber(row[16]),
          countPerCycle: toNumber(row[17]),
          totalCount: cycles != null && countSmall != null ? Math.round(cycles * countSmall) : null,
        },
        smallCGlass: {
          lengthMm: toNumber(row[18]),
          widthMm: toNumber(row[19]),
        },
        bigCGlass: {
          lengthMm: toNumber(row[20]),
          widthMm: toNumber(row[21]),
        },
        woven360: {
          lengthMm: toNumber(row[22]),
          widthMm: toNumber(row[23]),
        },
      },
    });
  }

  return records;
};

const parseEndcapSheet = (wb: XLSX.WorkBook, issues: ValidationIssue[]): GlassRuleRecord[] => {
  const sheetName = "Endcap PL";
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as unknown[][];
  const records: GlassRuleRecord[] = [];

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const itemCode = toText(row[0]);
    if (!itemCode) continue;
    if (!/[0-9]/.test(itemCode)) continue;

    const pressureBar = toNumber(row[1]);
    const innerDiameterMm = toNumber(row[2]);
    const twc = toNumber(row[4]);
    const twk = toNumber(row[5]);

    if (pressureBar == null || innerDiameterMm == null || twc == null || twk == null) {
      addIssue(issues, "warning", sheetName, r + 1, "Rij overgeslagen: ontbrekende PN/ID/TWc/TWk.");
      continue;
    }

    const key = ["endcap", pressureBar, innerDiameterMm, twc, twk].join("|");

    records.push({
      id: toDocId(key),
      productType: "endcap",
      family: "endcap",
      connectionType: "pl",
      sourceSheet: sheetName,
      sourceRow: r + 1,
      key,
      itemCode,
      pressureBar,
      innerDiameterMm,
      productName: toText(row[15]),
      articleNumber: toText(row[14]),
      weightKg: toNumber(row[13]),
      mats: {
        bigWoven: {
          lengthMm: toNumber(row[17]),
          widthMm: toNumber(row[18]),
          totalCount: toNumber(row[19]),
        },
        smallWoven: {
          lengthMm: toNumber(row[25]),
          widthMm: toNumber(row[26]),
          totalCount: toNumber(row[27]),
        },
      },
      notes: [
        "Design Endcap >1500mm: >1500 rechthoekig, <=1500 vierkant groot weefsel.",
      ],
      geometry: {
        strengthClassNmm2: toNumber(row[3]),
        domeWallThicknessMm: twc,
        knuckleWallThicknessMm: twk,
        laminationLengthMm: toNumber(row[6]),
        domeRadiusMm: toNumber(row[7]),
        knuckleRadiusMm: toNumber(row[8]),
        angleRcRkDeg: toNumber(row[9]),
        yHeightMm: toNumber(row[10]),
        builtInLengthMm: toNumber(row[11]),
        chamferLengthMm: toNumber(row[12]),
        extraTeKnuckle: toNumber(row[20]),
        layers: toNumber(row[21]),
        knuckleLength: toNumber(row[22]),
        knuckleFactor2_5: toNumber(row[23]),
        cycleBig: toNumber(row[28]),
        cycleSmall: toNumber(row[29]),
        cycleFirstPart: toNumber(row[30]),
      },
    });
  }

  return records;
};

const parseManholeSheet = (wb: XLSX.WorkBook, issues: ValidationIssue[]): GlassRuleRecord[] => {
  const sheetName = "Manhole Bottom";
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as unknown[][];
  const records: GlassRuleRecord[] = [];

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const itemCode = toText(row[0]);
    if (!itemCode) continue;
    if (!/[0-9]/.test(itemCode)) continue;

    const pressureBar = toNumber(row[1]);
    const innerDiameterMm = toNumber(row[2]);
    const socketLengthMm = toNumber(row[6]);

    if (pressureBar == null || innerDiameterMm == null || socketLengthMm == null) {
      addIssue(issues, "warning", sheetName, r + 1, "Rij overgeslagen: ontbrekende PN/ID/SB.");
      continue;
    }

    const key = ["manhole_bottom", pressureBar, innerDiameterMm, socketLengthMm].join("|");

    const rowNotes = row
      .slice(16)
      .map((entry) => toText(entry))
      .filter(Boolean);

    const joinedNotes = rowNotes.join(" ").toLowerCase();
    if (joinedNotes.includes("geen mal") || joinedNotes.includes("geen ger")) {
      addIssue(issues, "warning", sheetName, r + 1, "Record met ontbrekende mal/tekening aangetroffen.");
    }

    records.push({
      id: toDocId(key),
      productType: "manhole_bottom",
      family: "manhole",
      connectionType: "sb",
      sourceSheet: sheetName,
      sourceRow: r + 1,
      key,
      itemCode,
      pressureBar,
      innerDiameterMm,
      productName: "Manhole Bottom",
      weightKg: toNumber(row[9]),
      mats: {
        bigWoven: {
          lengthMm: toNumber(row[13]),
          widthMm: toNumber(row[14]),
          totalCount: toNumber(row[15]),
        },
      },
      notes: rowNotes,
      geometry: {
        strengthClassNmm2: toNumber(row[3]),
        tecMm: toNumber(row[4]),
        tekMm: toNumber(row[5]),
        socketLengthMm,
        moldCircumferenceMm: toNumber(row[7]),
        heightHbMm: toNumber(row[8]),
        b2Mm: toNumber(row[10]),
        outerDiameterMm: toNumber(row[11]),
      },
    });
  }

  return records;
};

const parseRevisionInfo = (wb: XLSX.WorkBook): { sourceRevision: string; sourceVersionLabel: string } => {
  const ws = wb.Sheets["Revision"];
  if (!ws) return { sourceRevision: "unknown", sourceVersionLabel: "unknown" };

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as unknown[][];
  const versionLabel = toText(rows[0]?.[0]) || "unknown";

  let sourceRevision = "unknown";
  for (let i = rows.length - 1; i >= 0; i--) {
    const first = toText(rows[i]?.[0]);
    if (first.toLowerCase().startsWith("revision")) {
      sourceRevision = first;
      break;
    }
  }

  return {
    sourceRevision,
    sourceVersionLabel: versionLabel,
  };
};

const parseWorkbook = (buffer: ArrayBuffer): ParseResult => {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const issues: ValidationIssue[] = [];

  REQUIRED_SHEETS.forEach((sheetName) => {
    if (!wb.Sheets[sheetName]) {
      addIssue(issues, "error", sheetName, 0, "Verplicht tabblad ontbreekt.");
    }
  });

  const teeRules = [
    ...parseTeeSheet(wb, "Wavistrong CBCBCB", "wavistrong", "cbc bcb".replace(/\s+/g, ""), issues),
    ...parseTeeSheet(wb, "Wavistrong TBTBTB", "wavistrong", "tbtbtb", issues),
    ...parseTeeSheet(wb, "Fibermar CBCBCB", "fibermar", "cbc bcb".replace(/\s+/g, ""), issues),
    ...parseTeeSheet(wb, "Special", "special", "mixed", issues),
  ];

  const endcapRules = parseEndcapSheet(wb, issues);
  const manholeRules = parseManholeSheet(wb, issues);

  const allRulesMap = new Map<string, GlassRuleRecord>();
  [...teeRules, ...endcapRules, ...manholeRules].forEach((rule) => {
    if (allRulesMap.has(rule.id)) {
      const previous = allRulesMap.get(rule.id);
      addIssue(
        issues,
        "warning",
        rule.sourceSheet,
        rule.sourceRow,
        `Dubbele sleutel gevonden; laatste rij overschrijft eerdere bron (${previous?.sourceSheet}:${previous?.sourceRow}).`
      );
    }
    allRulesMap.set(rule.id, rule);
  });

  const revision = parseRevisionInfo(wb);

  return {
    rules: Array.from(allRulesMap.values()),
    issues,
    sourceRevision: revision.sourceRevision,
    sourceVersionLabel: revision.sourceVersionLabel,
  };
};

const chunk = <T,>(input: T[], size: number): T[][] => {
  if (size <= 0) return [input];
  const out: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    out.push(input.slice(i, i + size));
  }
  return out;
};

const GlassRulesImportModal = ({ isOpen, onClose, onSuccess }: GlassRulesImportModalProps) => {
  const { showError, showSuccess } = useNotifications();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);

  const errorCount = useMemo(
    () => (parsed?.issues || []).filter((issue) => issue.severity === "error").length,
    [parsed]
  );
  const warningCount = useMemo(
    () => (parsed?.issues || []).filter((issue) => issue.severity === "warning").length,
    [parsed]
  );

  const groupedCounts = useMemo(() => {
    const result = {
      tee: 0,
      endcap: 0,
      manhole_bottom: 0,
    };

    (parsed?.rules || []).forEach((rule) => {
      if (rule.productType === "tee") result.tee += 1;
      if (rule.productType === "endcap") result.endcap += 1;
      if (rule.productType === "manhole_bottom") result.manhole_bottom += 1;
    });

    return result;
  }, [parsed]);

  if (!isOpen) return null;

  const resetState = () => {
    setLoading(false);
    setSaving(false);
    setParsed(null);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = parseWorkbook(buffer);
      setParsed(result);
      setFileName(file.name);

      if (!result.rules.length) {
        showError("Geen geldige glass rules gevonden in het bestand.", "Glass Rules Import");
      }
    } catch (error) {
      console.error("Glass rules parse fout:", error);
      showError("Kon het bestand niet ontleden. Controleer of het een geldig xlsm-bestand is.", "Glass Rules Import");
      setParsed(null);
      setFileName("");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!parsed?.rules?.length) return;
    if (errorCount > 0) {
      showError("Import geblokkeerd: los eerst alle errors op.", "Glass Rules Import");
      return;
    }

    setSaving(true);
    try {
      const importsPath = getPathString(PATHS.GLASS_RULE_IMPORTS);
      const rulesPath = getPathString(PATHS.GLASS_RULES);

      const importRef = doc(collection(db, importsPath));
      const importId = importRef.id;

      await setDoc(importRef, {
        importId,
        status: "processing",
        sourceFileName: fileName,
        sourceRevision: parsed.sourceRevision,
        sourceVersionLabel: parsed.sourceVersionLabel,
        ruleCount: parsed.rules.length,
        issueCount: parsed.issues.length,
        errorCount,
        warningCount,
        productTypeCounts: groupedCounts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const batches = chunk(parsed.rules, 400);
      for (const part of batches) {
        const batch = writeBatch(db);
        part.forEach((rule) => {
          const ruleRef = doc(db, rulesPath, rule.id);
          batch.set(
            ruleRef,
            {
              ...rule,
              importId,
              isActive: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        await batch.commit();
      }

      await setDoc(
        importRef,
        {
          status: "active",
          activatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, getPathString(PATHS.GENERAL_SETTINGS)),
        {
          glassRules: {
            activeImportId: importId,
            sourceRevision: parsed.sourceRevision,
            sourceVersionLabel: parsed.sourceVersionLabel,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );

      showSuccess(
        `Import voltooid: ${parsed.rules.length} regels opgeslagen (${groupedCounts.tee} tee, ${groupedCounts.endcap} endcap, ${groupedCounts.manhole_bottom} manhole).`,
        "Glass Rules Import"
      );
      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error("Glass rules save fout:", error);
      showError("Opslaan mislukt. Controleer Firestore rechten of probeer opnieuw.", "Glass Rules Import");
    } finally {
      setSaving(false);
    }
  };

  const issuePreview = (parsed?.issues || []).slice(0, 12);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[28px] shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Glass Rules Import (.xlsm)</h3>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Eenmalige baseline import + revisie-imports voor Tee, Endcap en Manhole.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          <div
            onClick={() => !loading && !saving && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
              loading || saving
                ? "cursor-wait border-slate-200 bg-slate-50"
                : "cursor-pointer border-emerald-200 bg-emerald-50/50 hover:border-emerald-400"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsm,.xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading || saving}
            />
            {loading ? (
              <Loader2 className="mx-auto animate-spin text-emerald-600 mb-3" size={30} />
            ) : (
              <Upload className="mx-auto text-emerald-600 mb-3" size={30} />
            )}
            <p className="text-sm font-black uppercase tracking-wider text-slate-700">
              {loading ? "Bestand ontleden..." : "Selecteer Glass Calculation bestand"}
            </p>
            <p className="text-xs text-slate-500 mt-2">Ondersteund: .xlsm, .xlsx, .xls</p>
            {fileName ? <p className="mt-2 text-xs font-bold text-emerald-700">{fileName}</p> : null}
          </div>

          {parsed && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 p-4 bg-white">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tee regels</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{groupedCounts.tee}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 bg-white">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Endcap regels</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{groupedCounts.endcap}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 bg-white">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Manhole regels</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{groupedCounts.manhole_bottom}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 bg-white">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Totaal regels</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{parsed.rules.length}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-700">
                    <FileSpreadsheet size={14} /> Import validatie
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-black uppercase tracking-widest">
                    <span className="text-rose-600">Errors: {errorCount}</span>
                    <span className="text-amber-600">Warnings: {warningCount}</span>
                    <span className="text-emerald-700">Revision: {parsed.sourceRevision}</span>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                  {issuePreview.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm font-semibold text-emerald-700 flex items-center justify-center gap-2">
                      <CheckCircle2 size={16} /> Geen validatie-issues gevonden.
                    </div>
                  ) : (
                    issuePreview.map((issue, index) => (
                      <div key={`${issue.sheet}_${issue.row}_${index}`} className="px-4 py-3 flex items-start gap-3">
                        <AlertTriangle
                          size={14}
                          className={issue.severity === "error" ? "text-rose-600 mt-0.5" : "text-amber-600 mt-0.5"}
                        />
                        <div>
                          <p className="text-xs font-black text-slate-700 uppercase tracking-wider">
                            {issue.severity} - {issue.sheet} {issue.row > 0 ? `(rij ${issue.row})` : ""}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">{issue.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-white">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50"
            disabled={saving}
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !parsed || !parsed.rules.length || errorCount > 0}
            className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Publiceer Import
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlassRulesImportModal;
