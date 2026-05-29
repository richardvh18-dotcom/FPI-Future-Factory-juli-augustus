import React, { useState, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import { formatDateTimeSafe } from "../../utils/dateUtils";
import { getISOWeek, getYear } from "date-fns";
import LabMeasurementsView, { LabMeasurement } from "./LabMeasurementsView";
import InspectionLogView, { QcInspection } from "./InspectionLogView";

type QCTab = "lab" | "inspection";

const parseMeasuredAtDate = (value: unknown): Date | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const dutchPattern = raw.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (dutchPattern) {
    const [, dd, mm, yyyy, hh = "00", min = "00"] = dutchPattern;
    const fallback = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  return null;
};

const QCHub = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<QCTab>("lab");
  const [measurements, setMeasurements] = useState<LabMeasurement[]>([]);
  const [inspections, setInspections] = useState<QcInspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qMeasurements = query(
      collection(db, "future-factory/production/qc_measurements"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const qInspections = query(
      collection(db, "future-factory/production/qc_inspections"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    let mLoaded = false;
    let iLoaded = false;
    const checkLoading = () => { if (mLoaded && iLoaded) setLoading(false); };

    const unsubM = onSnapshot(qMeasurements, (snap) => {
      setMeasurements(snap.docs.map(doc => {
        const d = doc.data();
        const createdAtDate = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
        const measuredAtDate = parseMeasuredAtDate(d.measuredAt);
        const dateObj = measuredAtDate || createdAtDate;
        return {
          id: doc.id,
          lotNumber: d.lotNumber || "-",
          resinBatch: d.resinBatch || "-",
          brix: d.brix || 0,
          tg: d.tg || 0,
          measuredAt: d.measuredAt || formatDateTimeSafe(d.createdAt) || "-",
          measuredBy: d.actorLabel || "-",
          week: !isNaN(dateObj.getTime()) ? getISOWeek(dateObj) : 0,
          year: !isNaN(dateObj.getTime()) ? getYear(dateObj) : 0,
          type: d.type || (d.brix ? 'brix' : 'tg'),
          department: d.department,
          kitchen: d.kitchen,
          tapPoint: d.tapPoint,
          shift: d.shift,
          resinWeight: d.resinWeight,
          hardenerWeight: d.hardenerWeight,
          refractiveIndex: d.refractiveIndex,
          visualCheckOk: d.visualCheckOk,
          tableRef: d.tableRef,
          mixingRatio: d.mixingRatio,
          area: d.area,
          trackedProductPath: d.trackedProductPath || null,
        } as LabMeasurement;
      }));
      mLoaded = true; checkLoading();
    }, (err) => { console.error(err); mLoaded = true; checkLoading(); });

    const unsubI = onSnapshot(qInspections, (snap) => {
      setInspections(snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          lotNumber: d.lotNumber || "-",
          checkType: d.checkType || "-",
          result: d.result || "OK",
          note: d.note || "",
          createdAt: formatDateTimeSafe(d.createdAt) || "-",
          actorLabel: d.actorLabel || "-",
        } as QcInspection;
      }));
      iLoaded = true; checkLoading();
    }, (err) => { console.error(err); iLoaded = true; checkLoading(); });

    return () => { unsubM(); unsubI(); };
  }, []);

  return (
    <div className="h-full w-full bg-slate-50 overflow-y-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <button
          onClick={() => navigate("/planning", { state: { initialView: "QC" } })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> Terug naar QC Stations
        </button>

        <header className="rounded-3xl bg-white border border-slate-200 p-6">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-slate-900">
            QC Hub
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            Aparte kwaliteitsmodule voor controles op geproduceerde producten, los van machineplanning.
          </p>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setActiveTab("lab")}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${
                activeTab === "lab"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Brekingsindex / Lab Metingen
            </button>
            <button
              onClick={() => setActiveTab("inspection")}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${
                activeTab === "inspection"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Inspectielog
            </button>
          </div>
        </header>

        <section className="rounded-3xl bg-white border border-slate-200 p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-4">
              <Loader2 className="animate-spin" size={32} />
              <p className="text-sm font-bold uppercase tracking-widest">Data inladen...</p>
            </div>
          ) : activeTab === "lab" ? (
            <LabMeasurementsView measurements={measurements} />
          ) : (
            <InspectionLogView inspections={inspections} />
          )}
        </section>
      </div>
    </div>
  );
};

export default QCHub;
