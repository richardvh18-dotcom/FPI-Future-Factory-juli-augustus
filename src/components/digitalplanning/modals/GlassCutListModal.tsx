import React, { useEffect, useMemo, useState } from "react";
import { X, Search, Loader2, FileText, Printer } from "lucide-react";
import { useNotifications } from "../../../contexts/NotificationContext";
import {
  findBestGlassRule,
  loadActiveGlassRulesByType,
  type GlassProductType,
  type GlassRuleRecord,
} from "../../../services/glassRulesService";

type GlassCutListModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialProductType?: GlassProductType;
  initialConnectionType?: string;
  initialPressureBar?: number;
  initialInnerDiameterMm?: number;
  initialBranchDiameterMm?: number;
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

// SVG Step Drawing Generator for the 7 Lamineerstappen
const getStepSvgDataUrl = (stepNumber: number): string => {
  let svgInner = '';
  switch (stepNumber) {
    case 1: // C-glas Groot (5mm flange highlights)
      svgInner = `
        <path d="M 15 45 L 145 45 L 145 75 L 15 75 Z" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
        <path d="M 65 15 L 95 15 L 95 45 L 65 45 Z" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
        <rect x="15" y="45" width="8" height="30" fill="#eab308" stroke="#0f172a" stroke-width="1.5"/>
        <rect x="137" y="45" width="8" height="30" fill="#eab308" stroke="#0f172a" stroke-width="1.5"/>
        <text x="20" y="38" font-size="8" font-family="sans-serif" font-weight="bold" fill="#0f172a">5 mm</text>
      `;
      break;
    case 2: // C-glas Klein (5mm branch highlight)
      svgInner = `
        <path d="M 15 45 L 145 45 L 145 75 L 15 75 Z" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
        <path d="M 65 15 L 95 15 L 95 45 L 65 45 Z" fill="#eab308" stroke="#0f172a" stroke-width="2"/>
        <rect x="65" y="15" width="30" height="8" fill="#eab308" stroke="#0f172a" stroke-width="1.5"/>
        <text x="70" y="11" font-size="8" font-family="sans-serif" font-weight="bold" fill="#0f172a">5 mm</text>
      `;
      break;
    case 3: // Grote mat 360 (Full body orange)
      svgInner = `
        <path d="M 15 45 L 145 45 L 145 75 L 15 75 Z" fill="#d97706" fill-opacity="0.6" stroke="#0f172a" stroke-width="2"/>
        <path d="M 65 15 L 95 15 L 95 45 L 65 45 Z" fill="#d97706" fill-opacity="0.6" stroke="#0f172a" stroke-width="2"/>
      `;
      break;
    case 4: // Wikkelen (Diagonal winding)
      svgInner = `
        <path d="M 15 45 L 145 45 L 145 75 L 15 75 Z" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
        <path d="M 65 15 L 95 15 L 95 45 L 65 45 Z" fill="#d97706" fill-opacity="0.8" stroke="#0f172a" stroke-width="2"/>
        <line x1="65" y1="20" x2="95" y2="35" stroke="#0f172a" stroke-width="1.5"/>
        <line x1="65" y1="30" x2="95" y2="45" stroke="#0f172a" stroke-width="1.5"/>
      `;
      break;
    case 5: // Kleine mat 360 (Main body yellow)
      svgInner = `
        <path d="M 15 45 L 145 45 L 145 75 L 15 75 Z" fill="#eab308" stroke="#0f172a" stroke-width="2"/>
        <path d="M 65 15 L 95 15 L 95 45 L 65 45 Z" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
      `;
      break;
    case 6: // Grote mat 360 (Full body yellow)
      svgInner = `
        <path d="M 15 45 L 145 45 L 145 75 L 15 75 Z" fill="#eab308" stroke="#0f172a" stroke-width="2"/>
        <path d="M 65 15 L 95 15 L 95 45 L 65 45 Z" fill="#eab308" stroke="#0f172a" stroke-width="2"/>
      `;
      break;
    case 7: // Wikkelen final
      svgInner = `
        <path d="M 15 45 L 145 45 L 145 75 L 15 75 Z" fill="#eab308" stroke="#0f172a" stroke-width="2"/>
        <path d="M 65 15 L 95 15 L 95 45 L 65 45 Z" fill="#eab308" stroke="#0f172a" stroke-width="2"/>
        <line x1="25" y1="45" x2="135" y2="75" stroke="#000000" stroke-width="1.5" stroke-dasharray="3,3"/>
        <line x1="25" y1="75" x2="135" y2="45" stroke="#000000" stroke-width="1.5" stroke-dasharray="3,3"/>
      `;
      break;
  }

  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 85" width="160" height="85">
    <rect width="160" height="85" fill="#ffffff" stroke="#94a3b8" stroke-width="1" rx="4"/>
    ${svgInner}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(fullSvg)}`;
};

const GlassCutListModal = ({
  isOpen,
  onClose,
  initialProductType,
  initialConnectionType,
  initialPressureBar,
  initialInnerDiameterMm,
  initialBranchDiameterMm,
}: GlassCutListModalProps) => {
  const { showError } = useNotifications();

  const [productType, setProductType] = useState<GlassProductType>(initialProductType || "tee");
  const [family, setFamily] = useState("wavistrong");
  const [connectionType, setConnectionType] = useState(initialConnectionType || "cbcbcb");

  const [pressureBar, setPressureBar] = useState(initialPressureBar ? String(initialPressureBar) : "");
  const [innerDiameterMm, setInnerDiameterMm] = useState(initialInnerDiameterMm ? String(initialInnerDiameterMm) : "");
  const [branchDiameterMm, setBranchDiameterMm] = useState(initialBranchDiameterMm ? String(initialBranchDiameterMm) : "");
  const [wallThicknessMm, setWallThicknessMm] = useState("");

  const [loading, setLoading] = useState(false);
  const [availableRules, setAvailableRules] = useState<GlassRuleRecord[]>([]);
  const [selectedRule, setSelectedRule] = useState<GlassRuleRecord | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialProductType) setProductType(initialProductType);
      if (initialConnectionType) setConnectionType(initialConnectionType);
      if (initialPressureBar != null) setPressureBar(String(initialPressureBar));
      if (initialInnerDiameterMm != null) setInnerDiameterMm(String(initialInnerDiameterMm));
      if (initialBranchDiameterMm != null) setBranchDiameterMm(String(initialBranchDiameterMm));
    }
  }, [isOpen, initialProductType, initialConnectionType, initialPressureBar, initialInnerDiameterMm, initialBranchDiameterMm]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);

    const targetType = initialProductType || productType;

    void loadActiveGlassRulesByType(targetType)
      .then((rules) => {
        if (!active) return;
        setAvailableRules(rules);

        // Pre-select if initial parameters exist
        const best = findBestGlassRule(rules, {
          productType: targetType,
          family,
          connectionType,
          pressureBar: initialPressureBar ? Number(initialPressureBar) : parseNumber(pressureBar),
          innerDiameterMm: initialInnerDiameterMm ? Number(initialInnerDiameterMm) : parseNumber(innerDiameterMm),
          branchDiameterMm: initialBranchDiameterMm ? Number(initialBranchDiameterMm) : parseNumber(branchDiameterMm),
        });

        if (best) {
          setSelectedRule(best);
          if (best.pressureBar != null) setPressureBar(String(best.pressureBar));
          if (best.innerDiameterMm != null) setInnerDiameterMm(String(best.innerDiameterMm));
          if (best.branchDiameterMm != null) setBranchDiameterMm(String(best.branchDiameterMm));
          if (best.connectionType) setConnectionType(String(best.connectionType));
        } else {
          if (initialPressureBar != null) setPressureBar(String(initialPressureBar));
          if (initialInnerDiameterMm != null) setInnerDiameterMm(String(initialInnerDiameterMm));
          if (initialBranchDiameterMm != null) setBranchDiameterMm(String(initialBranchDiameterMm));
          if (initialConnectionType) setConnectionType(String(initialConnectionType));
          setSelectedRule(null);
        }
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

    return () => { active = false; };
  }, [isOpen, productType, initialProductType, initialPressureBar, initialInnerDiameterMm, initialBranchDiameterMm]);

  // 1. Base rules filtered by Product Type, Family, and Connection Type
  const baseRules = useMemo(() => {
    if (productType !== "tee") return availableRules;
    return availableRules.filter((rule) => {
      const matchesFamily = !family || String(rule.family || "").toLowerCase() === family.toLowerCase();
      const matchesConnection = !connectionType || String(rule.connectionType || "").toLowerCase() === connectionType.toLowerCase();
      return matchesFamily && matchesConnection;
    });
  }, [availableRules, productType, family, connectionType]);

  // 2. Pressure options available under baseRules
  const pressureOptions = useMemo(
    () => collectUniqueValues(baseRules, (rule) => rule.pressureBar),
    [baseRules]
  );

  useEffect(() => {
    if (pressureOptions.length === 1 && pressureBar !== pressureOptions[0]) {
      setPressureBar(pressureOptions[0]);
    }
  }, [pressureOptions, pressureBar]);

  // 3. Rules matching selected pressure
  const pressureRules = useMemo(() => {
    if (!pressureBar) return baseRules;
    const pNum = parseNumber(pressureBar);
    return baseRules.filter((rule) => rule.pressureBar != null && Math.abs(rule.pressureBar - (pNum ?? 0)) < 0.01);
  }, [baseRules, pressureBar]);

  // 4. Inner Diameter (ID) options available ONLY for selected pressure
  const innerDiameterOptions = useMemo(
    () => collectUniqueValues(pressureRules, (rule) => rule.innerDiameterMm),
    [pressureRules]
  );

  useEffect(() => {
    if (innerDiameterMm && !innerDiameterOptions.includes(innerDiameterMm)) {
      setInnerDiameterMm(innerDiameterOptions.length === 1 ? innerDiameterOptions[0] : "");
    } else if (!innerDiameterMm && innerDiameterOptions.length === 1) {
      setInnerDiameterMm(innerDiameterOptions[0]);
    }
  }, [innerDiameterOptions, innerDiameterMm]);

  // 5. Rules matching selected pressure AND selected inner diameter
  const idRules = useMemo(() => {
    if (!innerDiameterMm) return pressureRules;
    const idNum = parseNumber(innerDiameterMm);
    return pressureRules.filter((rule) => rule.innerDiameterMm != null && Math.abs(rule.innerDiameterMm - (idNum ?? 0)) < 0.01);
  }, [pressureRules, innerDiameterMm]);

  // 6. Branch Diameter (ID1) options available ONLY for selected pressure AND selected inner diameter
  const branchDiameterOptions = useMemo(
    () => collectUniqueValues(idRules, (rule) => rule.branchDiameterMm),
    [idRules]
  );

  useEffect(() => {
    if (branchDiameterMm && !branchDiameterOptions.includes(branchDiameterMm)) {
      setBranchDiameterMm(branchDiameterOptions.length === 1 ? branchDiameterOptions[0] : "");
    } else if (!branchDiameterMm && branchDiameterOptions.length === 1) {
      setBranchDiameterMm(branchDiameterOptions[0]);
    }
  }, [branchDiameterOptions, branchDiameterMm]);

  const runSearch = () => {
    setLoading(true);
    try {
      const best = findBestGlassRule(baseRules, {
        productType,
        family,
        connectionType,
        pressureBar: parseNumber(pressureBar),
        innerDiameterMm: parseNumber(innerDiameterMm),
        branchDiameterMm: parseNumber(branchDiameterMm),
        wallThicknessMm: parseNumber(wallThicknessMm),
      });

      if (!best) {
        setSelectedRule(null);
        showError("Geen passende glass rule gevonden voor deze combinatie.", "Glass snijlijst");
        return;
      }

      setSelectedRule(best);
    } catch (error) {
      console.error("Glass snijlijst zoekfout:", error);
      showError("Zoeken in glass rules is mislukt.", "Glass snijlijst");
    } finally {
      setLoading(false);
    }
  };

  // Build exact 7-Step Lamineerstap Matrix Data matching the official Wavistrong print sheet
  const stepsMatrix = useMemo(() => {
    if (!selectedRule) return null;
    const m = selectedRule.mats || {};
    const cycles = selectedRule.cycles ?? 1;

    return [
      {
        step: 1,
        name: "C-glas Groot",
        weefselType: 30,
        dimStr: `${m.bigCGlass?.lengthMm ?? 1200} x ${m.bigCGlass?.widthMm ?? 570}`,
        countPerCycle: m.bigCGlass?.countPerCycle ?? 2,
        cycli: 1,
        total: m.bigCGlass?.totalCount ?? 2,
        unit: "",
      },
      {
        step: 2,
        name: "C-glas Klein",
        weefselType: 30,
        dimStr: `${m.smallCGlass?.lengthMm ?? 200} x ${m.smallCGlass?.widthMm ?? 200}`,
        countPerCycle: m.smallCGlass?.countPerCycle ?? 4,
        cycli: 1,
        total: m.smallCGlass?.totalCount ?? 4,
        unit: "",
      },
      {
        step: 3,
        name: "Grote mat 360",
        weefselType: 360,
        dimStr: `${m.woven360?.lengthMm ?? 1200} x ${m.woven360?.widthMm ?? 570}`,
        countPerCycle: m.woven360?.countPerCycle ?? 1,
        cycli: 1,
        total: m.woven360?.totalCount ?? 1,
        unit: "",
      },
      {
        step: 4,
        name: "Wikkelen",
        weefselType: 360,
        dimStr: "Breedte (B) 50",
        countPerCycle: "120 m",
        cycli: 1,
        total: "120 m",
        unit: "m",
      },
      {
        step: 5,
        name: "Kleine mat 360",
        weefselType: 360,
        dimStr: `${m.smallWoven?.lengthMm ?? 280} x ${m.smallWoven?.widthMm ?? 570}`,
        countPerCycle: m.smallWoven?.countPerCycle ?? 8,
        cycli: cycles,
        total: (m.smallWoven?.countPerCycle ?? 8) * cycles + " *",
        unit: "",
      },
      {
        step: 6,
        name: "Grote mat 360",
        weefselType: 360,
        dimStr: `${m.bigWoven?.lengthMm ?? 1430} x ${m.bigWoven?.widthMm ?? 760}`,
        countPerCycle: m.bigWoven?.countPerCycle ?? 4,
        cycli: cycles,
        total: (m.bigWoven?.countPerCycle ?? 4) * cycles,
        unit: "",
      },
      {
        step: 7,
        name: "Wikkelen",
        weefselType: 360,
        dimStr: "Breedte (B) 100",
        countPerCycle: "60 m",
        cycli: cycles,
        total: "300 m",
        unit: "m",
      },
    ];
  }, [selectedRule]);

  // Export 100% exact replica of official Wavistrong T-Stuk Process Sheet to Landscape PDF
  const handleExportPdf = async () => {
    if (!selectedRule || !stepsMatrix) return;

    try {
      const [{ default: jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const autoTable = (autoTableModule as { default?: (doc: unknown, options: unknown) => void }).default;
      if (typeof autoTable !== "function") {
        throw new Error("autotable plugin niet beschikbaar");
      }

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Page: 297mm x 210mm
      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("PROCES GEGEVENS OP MAL GEWIKKELD WAVISTRONG T-STUK CB/CB-CB", 148.5, 12, { align: "center" });

      // Header Parameters Box (Left)
      doc.setFontSize(9);
      const id = selectedRule.innerDiameterMm ?? 400;
      const id1 = selectedRule.branchDiameterMm ?? 400;
      const pn = selectedRule.pressureBar ?? 16;
      const tw = selectedRule.wallThicknessMm ?? 11.1;

      doc.text(`Binnendiameter (mm)    ID  x  ID1   =   ${id}  x  ${id1}`, 20, 22);
      doc.text(`Nominale drukklasse    PN (bar)      =   ${pn}`, 20, 27);
      doc.text(`Wanddikte              Tw (mm)       =   ${tw}`, 20, 32);
      doc.text(`                       (L) (mm)      =   560`, 20, 37);
      doc.text(`                       (L1) (mm)     =   280`, 20, 42);

      // Render 7 Step Images Row
      const startX = 14;
      const stepW = 38;
      const startY = 48;

      for (let i = 0; i < 7; i++) {
        try {
          const svgStr = getStepSvgDataUrl(i + 1);
          const img = new Image();
          const svgBlob = new Blob([decodeURIComponent(svgStr.split(',')[1])], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(svgBlob);

          await new Promise<void>((resolve) => {
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = 300;
              canvas.height = 180;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0, 300, 180);
                const imgData = canvas.toDataURL("image/png");
                doc.addImage(imgData, "PNG", startX + i * stepW, startY, stepW - 1, 20);
              }
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            img.src = url;
          });
        } catch (e) {
          // ignore
        }
      }

      // Lamineerstap Matrix Table (Full 7 steps horizontal)
      autoTable(doc, {
        startY: 70,
        margin: { left: 14, right: 14 },
        head: [
          ["LAMINEERSTAP", "1", "2", "3", "4", "5", "6", "7"],
        ],
        body: [
          ["WEEFSEL TYPE (g/m2)", ...stepsMatrix.map(s => String(s.weefselType))],
          ["LENGTE (L) x BREEDTE (B) [mm] x [mm]", ...stepsMatrix.map(s => s.dimStr)],
          ["AANTAL / CYCLUS (-)", ...stepsMatrix.map(s => String(s.countPerCycle))],
          ["AANTAL CYCLI (-)", ...stepsMatrix.map(s => String(s.cycli))],
          ["TOTAAL AANTAL (-)", ...stepsMatrix.map(s => String(s.total))],
          ["", ...stepsMatrix.map(s => s.name)],
        ],
        styles: {
          fontSize: 8,
          cellPadding: 2,
          halign: "center",
          valign: "middle",
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { halign: "left", fontStyle: "bold", cellWidth: 55 },
        },
        theme: "grid",
      });

      // Bottom Legend & Instruction Box
      const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 145;
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("ONTW-W51 Hulpstukken", 20, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.text("Stap 1: C-glas Groot", 20, finalY + 15);
      doc.text("Stap 2: C-glas Klein", 20, finalY + 20);
      doc.text("Stap 3: Eerste laag Woven Roving", 20, finalY + 25);
      doc.text("Stap 4: Vastzetten d.m.v. wikkelen Woven Roving", 20, finalY + 30);
      doc.text("Stap 5: Kleine Woven Roving stukken", 20, finalY + 35);
      doc.text("Stap 6: Grote Woven Roving stukken", 20, finalY + 40);
      doc.text("Stap 7: Wikkelen Woven Roving", 20, finalY + 45);

      // Operator instruction text box
      doc.setFont("helvetica", "bold");
      doc.text("Wijzigingen melden op het formulier en inleveren bij teamleider!", 130, finalY + 15);
      doc.text("Graag volgnummer noteren.", 130, finalY + 20);

      doc.setFont("helvetica", "normal");
      doc.text("Note: Afbeelding zijn CB/CB-CB als voorbeeld.", 20, finalY + 52);
      doc.text("Note*: 2 additionele kleine weefsel matten.", 20, finalY + 56);

      // Footer
      doc.setFontSize(8);
      doc.text("Glass Calculation Fittings Version 4", 230, 200);
      doc.text(new Date().toLocaleDateString('nl-NL'), 270, 200);

      const safeKey = String(selectedRule.key || "wavistrong_t_stuk").replace(/[^a-zA-Z0-9_-]+/g, "_");
      doc.save(`Wavistrong_TStuk_Procesblad_${safeKey}.pdf`);
    } catch (error) {
      console.error("PDF export fout:", error);
      showError("Kon PDF niet genereren.", "Glass snijlijst");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-7xl max-h-[96vh] rounded-[24px] border border-slate-300 shadow-2xl overflow-hidden flex flex-col font-sans">
        
        {/* Header */}
        <div className="px-8 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-3">
              <FileText className="text-amber-400" size={20} /> Proces Gegevens Wavistrong T-Stuk
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">100% Identiek aan het officiële Wavistrong T-Stuk procesblad.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-slate-100/50">
          
          {/* Controls / Filter Bar with Cascading Availability */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Producttype</label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value as GlassProductType)}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
              >
                <option value="tee">T-stuk (Tee)</option>
                <option value="endcap">Endcap</option>
                <option value="manhole_bottom">Manhole Bottom</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">PN (Druk)</label>
              <select
                value={pressureBar}
                onChange={(e) => setPressureBar(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
              >
                <option value="">Kies PN...</option>
                {pressureOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt} bar</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">ID (Diameter mm)</label>
              <select
                value={innerDiameterMm}
                onChange={(e) => setInnerDiameterMm(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
              >
                <option value="">Kies ID...</option>
                {innerDiameterOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt} mm</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">ID1 (Aftakking mm)</label>
              <select
                value={branchDiameterMm}
                onChange={(e) => setBranchDiameterMm(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
              >
                <option value="">Kies ID1...</option>
                {branchDiameterOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt} mm</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-4 flex justify-between items-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={runSearch}
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-md shadow-blue-500/20"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Haal Procesgegevens Op
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                disabled={!selectedRule || !stepsMatrix}
                className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-700 disabled:opacity-40 flex items-center gap-2 shadow-md shadow-rose-500/20"
              >
                <Printer size={14} /> Export Officieel Procesblad (PDF)
              </button>
            </div>
          </div>

          {/* OFFICIAL WAVISTRONG T-STUK PROCESS SHEET DISPLAY */}
          {selectedRule && stepsMatrix ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-300 shadow-md space-y-6">
              
              {/* Title & Parameters Block */}
              <div className="text-center border-b border-slate-300 pb-4">
                <h2 className="text-lg font-black uppercase text-slate-900 tracking-wide">
                  PROCES GEGEVENS OP MAL GEWIKKELD WAVISTRONG T-STUK CB/CB-CB
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-800">
                <div className="space-y-1">
                  <p>Binnendiameter (mm) <span className="float-right text-blue-700">ID x ID1 = {selectedRule.innerDiameterMm ?? 400} x {selectedRule.branchDiameterMm ?? 400}</span></p>
                  <p>Nominale drukklasse <span className="float-right text-blue-700">PN (bar) = {selectedRule.pressureBar ?? 16}</span></p>
                  <p>Wanddikte <span className="float-right text-blue-700">Tw (mm) = {selectedRule.wallThicknessMm ?? 11.1}</span></p>
                </div>
                <div className="space-y-1 border-l border-slate-200 pl-4">
                  <p>(L) (mm) <span className="float-right">560</span></p>
                  <p>(L1) (mm) <span className="float-right">280</span></p>
                  <p>Lo (mm) <span className="float-right">764</span></p>
                  <p>Lo1 (mm) <span className="float-right">382</span></p>
                </div>
                <div className="border-l border-slate-200 pl-4 flex items-center justify-center text-slate-500 italic text-[11px]">
                  Schetsmatige T-stuk maatvoering (L / L1 / Lo / Lo1)
                </div>
              </div>

              {/* 7 HORIZONTAL LAMINEERSTAP MATRIX TABLE */}
              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse border border-slate-900 text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white font-black">
                      <th className="border border-slate-900 p-2 text-left w-48">LAMINEERSTAP</th>
                      {stepsMatrix.map((s) => (
                        <th key={s.step} className="border border-slate-900 p-2 w-28">{s.step}</th>
                      ))}
                    </tr>
                    <tr className="bg-white">
                      <td className="border border-slate-900 p-2 font-bold text-left text-slate-500">Afbeelding</td>
                      {stepsMatrix.map((s) => (
                        <td key={s.step} className="border border-slate-900 p-1">
                          <img src={getStepSvgDataUrl(s.step)} alt={`Step ${s.step}`} className="w-full h-16 object-contain" />
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 font-semibold text-slate-900">
                    <tr>
                      <td className="border border-slate-900 p-2 font-bold text-left bg-slate-50">WEEFSEL TYPE (g/m²)</td>
                      {stepsMatrix.map((s) => (
                        <td key={s.step} className="border border-slate-900 p-2">{s.weefselType}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-slate-900 p-2 font-bold text-left bg-slate-50">LENGTE (L) x BREEDTE (B) [mm]</td>
                      {stepsMatrix.map((s) => (
                        <td key={s.step} className="border border-slate-900 p-2">{s.dimStr}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-slate-900 p-2 font-bold text-left bg-slate-50">AANTAL / CYCLUS (-)</td>
                      {stepsMatrix.map((s) => (
                        <td key={s.step} className="border border-slate-900 p-2">{s.countPerCycle}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-slate-900 p-2 font-bold text-left bg-slate-50">AANTAL CYCLI (-)</td>
                      {stepsMatrix.map((s) => (
                        <td key={s.step} className="border border-slate-900 p-2">{s.cycli}</td>
                      ))}
                    </tr>
                    <tr className="bg-amber-50">
                      <td className="border border-slate-900 p-2 font-bold text-left text-amber-900">TOTAAL AANTAL (-)</td>
                      {stepsMatrix.map((s) => (
                        <td key={s.step} className="border border-slate-900 p-2 font-black text-amber-900">{s.total}</td>
                      ))}
                    </tr>
                    <tr className="bg-slate-100 font-bold">
                      <td className="border border-slate-900 p-2 text-left text-slate-700">Mat Omschrijving</td>
                      {stepsMatrix.map((s) => (
                        <td key={s.step} className="border border-slate-900 p-2 text-[11px] text-blue-900">{s.name}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Bottom Instructions & Notes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-300 text-xs">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <p className="font-black text-slate-900">ONTW-W51 Hulpstukken Procesvolgorde:</p>
                  <ul className="space-y-1 text-slate-700 font-medium">
                    <li>• Stap 1: C-glas Groot</li>
                    <li>• Stap 2: C-glas Klein</li>
                    <li>• Stap 3: Eerste laag Woven Roving</li>
                    <li>• Stap 4: Vastzetten d.m.v. wikkelen Woven Roving</li>
                    <li>• Stap 5: Kleine Woven Roving stukken</li>
                    <li>• Stap 6: Grote Woven Roving stukken</li>
                    <li>• Stap 7: Wikkelen Woven Roving</li>
                  </ul>
                  <div className="pt-2 text-[10px] text-slate-500">
                    <p>Note: Afbeeldingen zijn CB/CB-CB als voorbeeld.</p>
                    <p>Note*: 2 additionele kleine weefsel matten.</p>
                  </div>
                </div>

                <div className="bg-amber-50 p-4 rounded-xl border border-amber-300 flex flex-col justify-between">
                  <div className="space-y-2">
                    <p className="font-black text-amber-900 uppercase">Teamleider Instructie:</p>
                    <p className="font-bold text-amber-800">Wijzigingen melden op het formulier en inleveren bij teamleider! Graag volgnummer noteren.</p>
                  </div>
                  <div className="pt-4 text-right text-[10px] font-bold text-amber-900">
                    Glass Calculation Fittings Version 4
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 font-semibold bg-white rounded-2xl border border-slate-200">
              Selecteer de PN, ID en ID1 parameters bovenaan en klik op <span className="text-blue-600 font-bold">"Haal Procesgegevens Op"</span>.
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-8 py-3 bg-white border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 font-medium">
          <span>Future Pipe Industries - Wavistrong T-Stuk Procesblad Replica</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
          >
            Sluiten
          </button>
        </div>

      </div>
    </div>
  );
};

export default GlassCutListModal;
