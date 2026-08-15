import React, { useState, useEffect, useMemo } from "react";
import { X, Hash, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import { db } from "../../../config/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { getPathString, PATHS } from "../../../config/dbPaths";
import { getStationMachineCode } from "../../../utils/lotLogic";
import InternalQrImage from "../../../utils/InternalQrImage";

type LargeSequencePrintModalProps = {
  onClose: () => void;
  onPrint: (station: string, week: string, startLot: string, quantity: number, incremental: boolean) => Promise<void>;
  printing: boolean;
};

const currentWeek = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d.getTime() - w.getTime()) / 86400000 - 3 + ((w.getDay() + 6) % 7)) / 7) + 1;
})();
const weeks = Array.from({ length: 10 }, (_, i) => String(currentWeek + i).padStart(2, "0"));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 3 }, (_, i) => String(currentYear + i).slice(-2));

export const LargeSequencePrintModal = ({
  onClose,
  onPrint,
  printing
}: LargeSequencePrintModalProps) => {
  const { t } = useTranslation();
  
  const [station, setStation] = useState("");
  const [year, setYear] = useState(years[0]);
  const [week, setWeek] = useState(weeks[0]);
  const [startNum, setStartNum] = useState("1");
  const [quantity, setQuantity] = useState<number>(1);
  const [incremental, setIncremental] = useState<boolean>(true);

  const parsedStartNum = Math.max(1, parseInt(startNum, 10) || 1);
  
  // Zorg dat we alleen de cijfers pakken en het maximaal 3 lang is
  const machineCode = station.replace(/\D/g, "").slice(0, 3).padEnd(3, "0");
  const isStationValid = station.replace(/\D/g, "").length === 3;

  const previewLotStr = `40${year}${week}${machineCode}40${String(parsedStartNum).padStart(4, "0")}`;
  
  const maxPreview = Math.min(quantity, 5);
  const previewLots = Array.from({ length: maxPreview }).map((_, i) => {
    const num = incremental ? parsedStartNum + i : parsedStartNum;
    return `40${year}${week}${machineCode}40${String(num).padStart(4, "0")}`;
  });

  const handlePrint = async () => {
    await onPrint(station, week, previewLotStr, quantity, incremental);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Hash className="text-blue-600" /> {t("mazak.large_sequence_header", "Grote Volgnummers")}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="space-y-4 text-left">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Station (3 cijfers)</label>
              <input 
                type="text"
                placeholder="bijv. 400"
                maxLength={3}
                className={`w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:border-blue-500 ${isStationValid ? 'border-slate-200' : 'border-red-400'}`}
                value={station}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val.length <= 3) setStation(val);
                }}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Jaar</label>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500"
                value={year}
                onChange={e => setYear(e.target.value)}
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("mazak.week", "Week")}</label>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500"
                value={week}
                onChange={e => setWeek(e.target.value)}
              >
                {weeks.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                Start Lotnummer (Laatste 4 cijfers)
              </label>
              <input
                type="number"
                min="1"
                max="9999"
                value={startNum}
                onChange={(e) => setStartNum(e.target.value)}
                onBlur={() => setStartNum(String(parsedStartNum))}
                className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                {t("mazak.quantity", "Aantal Labels")}
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={quantity}
                onChange={(e) => {
                  const parsed = Number.parseInt(String(e.target.value || "1"), 10);
                  setQuantity(Number.isFinite(parsed) ? Math.max(1, Math.min(200, parsed)) : 1);
                }}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="mb-6 pt-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={incremental}
                onChange={(e) => setIncremental(e.target.checked)}
                className="w-6 h-6 rounded-md text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <span className="text-sm font-bold text-slate-700">
                {t("mazak.incremental", "Oplopend (volgende label +1)")}
              </span>
            </label>
          </div>

          <div className="mb-6">
            <div className="mt-4 bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 flex flex-col items-center">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest w-full text-left">Live Preview (max 5)</p>
              <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white" style={{ maxWidth: '90mm' }}>
                {previewLots.map((lot) => (
                  <div key={lot} className="w-full h-[13mm] px-2 flex items-center gap-2 border-b border-dashed border-slate-300 last:border-b-0" style={{ maxWidth: '90mm' }}>
                    <InternalQrImage value={lot} size={128} alt="QR Preview Links" className="w-8 h-8 object-contain" />
                    <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-[0.08em] leading-none break-all flex-1 text-center">
                      {lot}
                    </p>
                  </div>
                ))}
                {quantity > 5 && (
                  <p className="text-[11px] font-bold text-slate-500 text-center py-2 bg-slate-50 border-t border-slate-200">
                    +{quantity - 5} extra labels worden geprint
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={handlePrint}
              disabled={printing || !isStationValid}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all ${
                printing || !isStationValid ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white shadow-xl hover:shadow-2xl hover:-translate-y-1"
              }`}
            >
              <Printer size={18} />
              {printing ? t("mazak.printing", "Bezig met printen...") : t("mazak.print_labels", "Print Labels")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
