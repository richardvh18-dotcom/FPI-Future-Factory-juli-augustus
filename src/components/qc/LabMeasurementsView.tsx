import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Beaker, Thermometer } from "lucide-react";
import AddLabMeasurementModal from "./AddLabMeasurementModal";

export type LabMeasurement = {
  id: string;
  lotNumber: string;
  resinBatch: string;
  brix: number;
  tg: number;
  measuredAt: string;
  measuredBy: string;
  week?: number;
  year?: number;
};

const sampleMeasurements: LabMeasurement[] = [
  {
    id: "m-001",
    lotNumber: "LOT-240501",
    resinBatch: "RES-2026-041",
    brix: 14.2,
    tg: 128.5,
    measuredAt: "2026-05-22 09:10",
    measuredBy: "QC LAB",
  },
  {
    id: "m-002",
    lotNumber: "LOT-240502",
    resinBatch: "RES-2026-041",
    brix: 13.9,
    tg: 126.8,
    measuredAt: "2026-05-22 10:05",
    measuredBy: "Testing Inspector",
  },
];

type LabMeasurementsViewProps = {
  measurements?: LabMeasurement[];
};

const LabMeasurementsView = ({ measurements = sampleMeasurements }: LabMeasurementsViewProps) => {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTile, setActiveTile] = useState<"brix" | "tg">("brix");

  const filteredMeasurements = measurements.filter(m => activeTile === "brix" ? m.brix > 0 : m.tg > 0);

  // Groepeer de metingen per jaar en week
  const groupedMeasurements = filteredMeasurements.reduce((acc, curr) => {
    const key = curr.year && curr.week ? `Week ${curr.week} (${curr.year})` : t("common.unknown", "Onbekend");
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {} as Record<string, LabMeasurement[]>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">
            {t("qc.lab_measurements_title", "Brix & Lab Metingen")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t("qc.lab_measurements_subtitle", "Ploegmetingen voor Brix- en kwaliteitscontroles per week.")}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className={`px-4 py-2 text-white rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg flex items-center gap-2 ${activeTile === 'brix' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-200'}`}
        >
          <Plus size={16} />
          {activeTile === "brix" ? t("qc.add_brix", "Nieuwe Brix Meting") : t("qc.add_tg", "Nieuwe Tg Meting")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveTile("brix")}
          className={`p-6 rounded-3xl border-2 flex items-center gap-4 transition-all text-left ${activeTile === "brix" ? "bg-blue-50 border-blue-500 shadow-lg shadow-blue-100" : "bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50"}`}
        >
          <div className={`p-4 rounded-2xl ${activeTile === "brix" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"}`}>
            <Beaker size={24} />
          </div>
          <div>
            <h3 className={`text-lg font-black uppercase tracking-tight ${activeTile === "brix" ? "text-blue-900" : "text-slate-700"}`}>Brix Metingen</h3>
          </div>
        </button>

        <button
          onClick={() => setActiveTile("tg")}
          className={`p-6 rounded-3xl border-2 flex items-center gap-4 transition-all text-left ${activeTile === "tg" ? "bg-purple-50 border-purple-500 shadow-lg shadow-purple-100" : "bg-white border-slate-100 hover:border-purple-200 hover:bg-slate-50"}`}
        >
          <div className={`p-4 rounded-2xl ${activeTile === "tg" ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400"}`}>
            <Thermometer size={24} />
          </div>
          <div>
            <h3 className={`text-lg font-black uppercase tracking-tight ${activeTile === "tg" ? "text-purple-900" : "text-slate-700"}`}>Tg Metingen</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Laboratorium analyse</p>
          </div>
        </button>
      </div>

      {Object.keys(groupedMeasurements).length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold uppercase tracking-widest text-xs">
          Geen metingen gevonden
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedMeasurements).map(([weekLabel, rows]) => (
            <div key={weekLabel} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                <h3 className="font-black text-slate-700 uppercase tracking-widest text-xs">{weekLabel}</h3>
                <span className="px-2 py-0.5 bg-white text-slate-500 rounded-md text-[10px] font-bold shadow-sm">{rows.length} meting(en)</span>
              </div>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-widest">
                  <tr>
                    <th className="px-4 py-3 text-left">{t("qc.lot", "Lot")}</th>
                    <th className="px-4 py-3 text-left">{t("qc.resin_batch", "Harsbatch")}</th>
                    <th className="px-4 py-3 text-left">{activeTile === "brix" ? t("qc.brix", "Brix") : t("qc.tg", "Tg")}</th>
                    <th className="px-4 py-3 text-left">{t("qc.measured_at", "Gemeten op")}</th>
                    <th className="px-4 py-3 text-left">{t("qc.measured_by", "Door")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-800">{row.lotNumber}</td>
                      <td className="px-4 py-3 text-slate-700">{row.resinBatch}</td>
                      <td className={`px-4 py-3 font-mono font-bold ${activeTile === "brix" ? "text-blue-600" : "text-purple-600"}`}>
                        {activeTile === "brix" ? (row.brix ? row.brix.toFixed(1) : "-") : (row.tg ? row.tg.toFixed(1) : "-")}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{row.measuredAt}</td>
                      <td className="px-4 py-3 text-slate-700">{row.measuredBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {showAddModal && <AddLabMeasurementModal onClose={() => setShowAddModal(false)} defaultType={activeTile} />}
    </div>
  );
};

export default LabMeasurementsView;
