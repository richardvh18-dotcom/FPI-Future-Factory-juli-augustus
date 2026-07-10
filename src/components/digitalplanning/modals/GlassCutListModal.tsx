import React, { useEffect, useMemo, useState } from "react";
import { X, Search, Loader2, FileText, Printer } from "lucide-react";
import { useNotifications } from "../../../contexts/NotificationContext";
import {
  buildGlassCutList,
  findBestGlassRule,
  loadActiveGlassRulesByType,
  type GlassCutListRow,
  type GlassProductType,
  type GlassRuleRecord,
} from "../../../services/glassRulesService";

type GlassCutListModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const parseNumber = (value: string): number | undefined => {
  const cleaned = String(value || "").replace(/,/g, ".").trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatOptionValue = (value: number | string | null | undefined): string => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value ?? "").trim();
};

const collectUniqueValues = (
  rules: GlassRuleRecord[],
  selector: (rule: GlassRuleRecord) => number | string | null | undefined
): string[] => {
  return Array.from(
    new Set(
      rules
        .map(selector)
        .map((value) => formatOptionValue(value))
        .filter(Boolean)
    )
  ).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
};

const toPrintTitle = (productType: GlassProductType) => {
  if (productType === "tee") return "Glass snijlijst - T-stuk";
  if (productType === "endcap") return "Glass snijlijst - Endcap";
  return "Glass snijlijst - Manhole Bottom";
};

const GlassCutListModal = ({ isOpen, onClose }: GlassCutListModalProps) => {
  const { showError } = useNotifications();

  const [productType, setProductType] = useState<GlassProductType>("tee");
  const [family, setFamily] = useState("wavistrong");
  const [connectionType, setConnectionType] = useState("cbcbcb");

  const [pressureBar, setPressureBar] = useState("");
  const [innerDiameterMm, setInnerDiameterMm] = useState("");
  const [branchDiameterMm, setBranchDiameterMm] = useState("");
  const [wallThicknessMm, setWallThicknessMm] = useState("");

  const [domeWallThicknessMm, setDomeWallThicknessMm] = useState("");
  const [knuckleWallThicknessMm, setKnuckleWallThicknessMm] = useState("");
  const [socketLengthMm, setSocketLengthMm] = useState("");

  const [loading, setLoading] = useState(false);
  const [availableRules, setAvailableRules] = useState<GlassRuleRecord[]>([]);
  const [selectedRule, setSelectedRule] = useState<GlassRuleRecord | null>(null);
  const [rows, setRows] = useState<GlassCutListRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);

    void loadActiveGlassRulesByType(productType)
      .then((rules) => {
        if (!active) return;
        setAvailableRules(rules);
        setSelectedRule(null);
        setRows([]);
      })
      .catch((error) => {
        console.error("Glass rules laden mislukt:", error);
        if (!active) return;
        setAvailableRules([]);
        showError("Kon actieve glass rules niet laden.", "Glass snijlijst");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, productType, showError]);

  useEffect(() => {
    setPressureBar("");
    setInnerDiameterMm("");
    setBranchDiameterMm("");
    setWallThicknessMm("");
    setDomeWallThicknessMm("");
    setKnuckleWallThicknessMm("");
    setSocketLengthMm("");
  }, [productType, family, connectionType]);

  const scopedRules = useMemo(() => {
    if (productType !== "tee") return availableRules;
    return availableRules.filter((rule) => {
      const matchesFamily = !family || String(rule.family || "") === family;
      const matchesConnection = !connectionType || String(rule.connectionType || "") === connectionType;
      return matchesFamily && matchesConnection;
    });
  }, [availableRules, productType, family, connectionType]);

  const pressureOptions = useMemo(
    () => collectUniqueValues(scopedRules, (rule) => rule.pressureBar),
    [scopedRules]
  );

  const diameterOptions = useMemo(() => {
    const rules = pressureBar
      ? scopedRules.filter((rule) => formatOptionValue(rule.pressureBar) === pressureBar)
      : scopedRules;
    return collectUniqueValues(rules, (rule) => rule.innerDiameterMm);
  }, [scopedRules, pressureBar]);

  const branchDiameterOptions = useMemo(() => {
    const rules = scopedRules.filter((rule) => {
      if (pressureBar && formatOptionValue(rule.pressureBar) !== pressureBar) return false;
      if (innerDiameterMm && formatOptionValue(rule.innerDiameterMm) !== innerDiameterMm) return false;
      return true;
    });
    return collectUniqueValues(rules, (rule) => rule.branchDiameterMm);
  }, [scopedRules, pressureBar, innerDiameterMm]);

  const wallThicknessOptions = useMemo(() => {
    const rules = scopedRules.filter((rule) => {
      if (pressureBar && formatOptionValue(rule.pressureBar) !== pressureBar) return false;
      if (innerDiameterMm && formatOptionValue(rule.innerDiameterMm) !== innerDiameterMm) return false;
      if (branchDiameterMm && formatOptionValue(rule.branchDiameterMm) !== branchDiameterMm) return false;
      return true;
    });
    return collectUniqueValues(rules, (rule) => rule.wallThicknessMm);
  }, [scopedRules, pressureBar, innerDiameterMm, branchDiameterMm]);

  const domeWallThicknessOptions = useMemo(() => {
    const rules = scopedRules.filter((rule) => {
      if (pressureBar && formatOptionValue(rule.pressureBar) !== pressureBar) return false;
      if (innerDiameterMm && formatOptionValue(rule.innerDiameterMm) !== innerDiameterMm) return false;
      return true;
    });
    return collectUniqueValues(rules, (rule) => rule.geometry?.domeWallThicknessMm);
  }, [scopedRules, pressureBar, innerDiameterMm]);

  const knuckleWallThicknessOptions = useMemo(() => {
    const rules = scopedRules.filter((rule) => {
      if (pressureBar && formatOptionValue(rule.pressureBar) !== pressureBar) return false;
      if (innerDiameterMm && formatOptionValue(rule.innerDiameterMm) !== innerDiameterMm) return false;
      return true;
    });
    return collectUniqueValues(rules, (rule) => rule.geometry?.knuckleWallThicknessMm);
  }, [scopedRules, pressureBar, innerDiameterMm]);

  const socketLengthOptions = useMemo(() => {
    const rules = scopedRules.filter((rule) => {
      if (pressureBar && formatOptionValue(rule.pressureBar) !== pressureBar) return false;
      if (innerDiameterMm && formatOptionValue(rule.innerDiameterMm) !== innerDiameterMm) return false;
      return true;
    });
    return collectUniqueValues(rules, (rule) => rule.geometry?.socketLengthMm);
  }, [scopedRules, pressureBar, innerDiameterMm]);

  const canSearch = useMemo(() => {
    return Boolean(parseNumber(pressureBar) != null && parseNumber(innerDiameterMm) != null);
  }, [pressureBar, innerDiameterMm]);

  if (!isOpen) return null;

  const runSearch = async () => {
    if (!canSearch) {
      showError("Vul minimaal PN en ID in.", "Glass snijlijst");
      return;
    }

    setLoading(true);
    try {
      const best = findBestGlassRule(scopedRules, {
        productType,
        family,
        connectionType,
        pressureBar: parseNumber(pressureBar),
        innerDiameterMm: parseNumber(innerDiameterMm),
        branchDiameterMm: parseNumber(branchDiameterMm),
        wallThicknessMm: parseNumber(wallThicknessMm),
        domeWallThicknessMm: parseNumber(domeWallThicknessMm),
        knuckleWallThicknessMm: parseNumber(knuckleWallThicknessMm),
        socketLengthMm: parseNumber(socketLengthMm),
      });

      if (!best) {
        setSelectedRule(null);
        setRows([]);
        showError("Geen passende glass rule gevonden voor deze combinatie.", "Glass snijlijst");
        return;
      }

      setSelectedRule(best);
      setRows(buildGlassCutList(best));
    } catch (error) {
      console.error("Glass snijlijst zoekfout:", error);
      showError("Zoeken in glass rules is mislukt.", "Glass snijlijst");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!selectedRule || !rows.length) return;

    try {
      const [{ default: jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const autoTable = (autoTableModule as { default?: (doc: unknown, options: unknown) => void }).default;
      if (typeof autoTable !== "function") {
        throw new Error("autotable plugin niet beschikbaar");
      }

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(toPrintTitle(productType), 14, 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Rule key: ${selectedRule.key}`, 14, 23);
      doc.text(`Bron: ${selectedRule.sourceSheet} (rij ${selectedRule.sourceRow})`, 14, 28);

      autoTable(doc, {
        startY: 34,
        head: [["Materiaal", "Lengte (mm)", "Breedte (mm)", "Aantal", "Per cyclus"]],
        body: rows.map((row) => [
          row.material,
          String(row.lengthMm),
          String(row.widthMm),
          String(row.count),
          row.countPerCycle != null ? String(row.countPerCycle) : "-",
        ]),
        styles: {
          fontSize: 9,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [15, 23, 42],
        },
      });

      const noteLines = (selectedRule.notes || []).filter(Boolean);
      if (noteLines.length) {
        const startY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 40;
        doc.setFont("helvetica", "bold");
        doc.text("Notities", 14, startY + 8);
        doc.setFont("helvetica", "normal");
        noteLines.forEach((note, index) => {
          doc.text(`- ${note}`, 14, startY + 14 + index * 5);
        });
      }

      const safeKey = String(selectedRule.key || "glass_cutlist").replace(/[^a-zA-Z0-9_-]+/g, "_");
      doc.save(`${safeKey}.pdf`);
    } catch (error) {
      console.error("PDF export fout:", error);
      showError("Kon PDF niet genereren.", "Glass snijlijst");
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-[28px] border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Glass Snijlijst</h3>
            <p className="text-xs text-slate-500 font-semibold mt-1">Zoek en print snijregels uit geïmporteerde glass rules.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Producttype</label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value as GlassProductType)}
                className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
              >
                <option value="tee">T-stuk</option>
                <option value="endcap">Endcap</option>
                <option value="manhole_bottom">Manhole Bottom</option>
              </select>
            </div>

            {productType === "tee" && (
              <>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Familie</label>
                  <select
                    value={family}
                    onChange={(e) => setFamily(e.target.value)}
                    className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="wavistrong">Wavistrong</option>
                    <option value="fibermar">Fibermar</option>
                    <option value="special">Special</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Connectie</label>
                  <select
                    value={connectionType}
                    onChange={(e) => setConnectionType(e.target.value)}
                    className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="cbcbcb">CBCBCB</option>
                    <option value="tbtbtb">TBTBTB</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">PN</label>
              <select
                value={pressureBar}
                onChange={(e) => setPressureBar(e.target.value)}
                className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
              >
                <option value="">Kies PN</option>
                {pressureOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">ID</label>
              <select
                value={innerDiameterMm}
                onChange={(e) => setInnerDiameterMm(e.target.value)}
                className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
              >
                <option value="">Kies ID</option>
                {diameterOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            {productType === "tee" && (
              <>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">ID1</label>
                  <select
                    value={branchDiameterMm}
                    onChange={(e) => setBranchDiameterMm(e.target.value)}
                    className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="">Kies ID1</option>
                    {branchDiameterOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">TW (optioneel)</label>
                  <select
                    value={wallThicknessMm}
                    onChange={(e) => setWallThicknessMm(e.target.value)}
                    className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="">Kies TW</option>
                    {wallThicknessOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {productType === "endcap" && (
              <>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">TWc (optioneel)</label>
                  <select
                    value={domeWallThicknessMm}
                    onChange={(e) => setDomeWallThicknessMm(e.target.value)}
                    className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="">Kies TWc</option>
                    {domeWallThicknessOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">TWk (optioneel)</label>
                  <select
                    value={knuckleWallThicknessMm}
                    onChange={(e) => setKnuckleWallThicknessMm(e.target.value)}
                    className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="">Kies TWk</option>
                    {knuckleWallThicknessOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {productType === "manhole_bottom" && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">SB (optioneel)</label>
                <select
                  value={socketLengthMm}
                  onChange={(e) => setSocketLengthMm(e.target.value)}
                  className="mt-1 w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                >
                  <option value="">Kies SB</option>
                  {socketLengthOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={runSearch}
              disabled={loading}
              className="px-5 py-3 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Zoek snijlijst
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!selectedRule || rows.length === 0}
              className="px-5 py-3 bg-rose-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-700 disabled:opacity-40 flex items-center gap-2"
            >
              <Printer size={14} /> Print PDF
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Snijregels</p>
              {selectedRule ? (
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {selectedRule.sourceSheet} rij {selectedRule.sourceRow}
                </p>
              ) : null}
            </div>

            <div className="max-h-[20rem] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
              {!selectedRule ? (
                <div className="px-4 py-10 text-center text-xs font-semibold text-slate-500">Nog geen rule geselecteerd.</div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs font-semibold text-slate-500">Rule gevonden, maar geen printbare matregels.</div>
              ) : (
                rows.map((row, index) => (
                  <div key={`${row.material}_${index}`} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_6rem_7rem] gap-3 px-4 py-3 text-xs items-center">
                    <span className="font-bold text-slate-700">{row.material}</span>
                    <span className="text-slate-700">{row.lengthMm}</span>
                    <span className="text-slate-700">{row.widthMm}</span>
                    <span className="font-black text-slate-900">{row.count}</span>
                    <span className="text-slate-500">{row.countPerCycle ?? "-"}</span>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 grid grid-cols-[minmax(0,1fr)_7rem_7rem_6rem_7rem] gap-3">
              <span>Materiaal</span>
              <span>Lengte</span>
              <span>Breedte</span>
              <span>Aantal</span>
              <span>Per cyclus</span>
            </div>
          </div>

          {selectedRule?.notes?.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Notities</p>
              <div className="mt-2 space-y-1 text-xs text-amber-900">
                {selectedRule.notes.map((note, idx) => (
                  <p key={`${idx}_${note}`}>- {note}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 flex items-center gap-2"
          >
            <FileText size={14} /> Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlassCutListModal;
