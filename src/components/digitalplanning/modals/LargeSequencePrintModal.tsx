import React, { useState, useEffect, useMemo } from "react";
import { X, Hash, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import { db } from "../../../config/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { getPathString, PATHS } from "../../../config/dbPaths";
import { getStationMachineCode } from "../../../utils/lotLogic";

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
const yy = String(new Date().getFullYear()).slice(-2);

export const LargeSequencePrintModal = ({
  onClose,
  onPrint,
  printing
}: LargeSequencePrintModalProps) => {
  const { t } = useTranslation();
  
  const [departmentGroups, setDepartmentGroups] = useState<any[]>([]);
  const [station, setStation] = useState("MAZAK");
  const [week, setWeek] = useState(weeks[0]);
  const [startNum, setStartNum] = useState("1");
  const [quantity, setQuantity] = useState<number>(1);
  const [incremental, setIncremental] = useState<boolean>(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, getPathString(PATHS.FACTORY_SETTINGS)), (snap) => {
      if (snap.exists()) {
        const dgs = snap.data().departmentGroups || [];
        setDepartmentGroups(dgs);
        // Default to first available station if current one is not valid
        const allStations = dgs.flatMap((d: any) => d.stations || []);
        if (allStations.length > 0 && !allStations.includes(station)) {
          setStation(allStations[0]);
        }
      }
    });
    return () => unsub();
  }, []);

  const allAvailableStations = useMemo(() => {
    return departmentGroups.flatMap(d => d.stations || []).filter(Boolean);
  }, [departmentGroups]);

  const stationsToUse = allAvailableStations.length > 0 ? allAvailableStations : ["MAZAK", "ROBOT", "LASER", "ASSEMBLY", "QC"];

  const parsedStartNum = Math.max(1, parseInt(startNum, 10) || 1);
  const machineCode = getStationMachineCode(station);
  const previewLotStr = `40${yy}${week}${machineCode}40${String(parsedStartNum).padStart(4, "0")}`;

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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("mazak.station", "Station")}</label>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500"
                value={station}
                onChange={e => setStation(e.target.value)}
              >
                {stationsToUse.map((s) => <option key={s} value={s}>{s}</option>)}
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

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
              {t("mazak.start_lot", "Start Lotnummer")}
            </label>
            <div className="flex gap-2 items-center w-full">
              <input
                type="text"
                disabled
                value={`40${yy}${week}${machineCode}40`}
                className="w-2/3 p-4 bg-slate-100 border-2 border-slate-200 rounded-2xl font-bold text-slate-500 outline-none select-none text-right"
              />
              <input
                type="number"
                min="1"
                max="9999"
                value={startNum}
                onChange={(e) => setStartNum(e.target.value)}
                onBlur={() => setStartNum(String(parsedStartNum))}
                className="w-1/3 p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-slate-400 mt-2 ml-1">Preview: <span className="font-mono font-bold text-slate-600">{previewLotStr}</span></p>
          </div>

          <div className="grid grid-cols-2 gap-4 items-center">
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
            <div className="pt-6">
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
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={handlePrint}
              disabled={printing || !previewLotStr || previewLotStr.length !== 15}
              className="w-full bg-blue-500 text-white font-black italic p-4 rounded-2xl hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 uppercase tracking-wide disabled:opacity-50"
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
