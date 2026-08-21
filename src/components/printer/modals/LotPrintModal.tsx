import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Printer } from 'lucide-react';
import { useEffect } from 'react';
import { LotPrintModalProps, PrinterConfig, DepartmentGroup } from '../printQueue.types';
import { useNotifications } from '../../../contexts/NotificationContext';
import { getISOWeekInfo, getStationMachineCode } from '../../../utils/lotLogic';
import { resolvePrinterDpi } from '../../../utils/printerDrivers';
import { generateLotBatchZPL } from '../../../utils/zplHelper';
import { normalizeStationKey } from '../printQueueHelpers';

const LotPrintModal = ({ onClose, departmentGroups, onPrintBatch, printer }: LotPrintModalProps) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [departmentKey, setDepartmentKey] = useState(departmentGroups[0]?.key || "");
  const [station, setStation] = useState(departmentGroups[0]?.stations?.[0] || "");
  const { week: curWeek, year: curYear } = getISOWeekInfo(new Date());
  const [manualWeek, setManualWeek] = useState(String(curWeek).padStart(2, '0'));
  const [manualYear, setManualYear] = useState(String(curYear));
  const [count, setCount] = useState("1");
  const [startNum, setStartNum] = useState("1");
  const [loading, setLoading] = useState(false);

  const currentDepartment = useMemo(
    () => departmentGroups.find((d) => d.key === departmentKey) || departmentGroups[0] || null,
    [departmentGroups, departmentKey]
  );
  const availableStations = useMemo(() => {
    const stations = currentDepartment?.stations || [];
    return stations.filter((station) => /(^|[^A-Z0-9])BH\d+/i.test(String(station)) || /^40BH\d+/i.test(String(station)) || /^BH\d+/i.test(String(station)));
  }, [currentDepartment]);
  const parsedStartNum = Math.max(1, parseInt(startNum, 10) || 1);
  const parsedCount = Math.max(1, Math.min(100, parseInt(count, 10) || 1));

  useEffect(() => {
    if (departmentGroups.length > 0 && !departmentGroups.some((d) => d.key === departmentKey)) {
      setDepartmentKey(departmentGroups[0].key);
      return;
    }
    if (availableStations.length > 0 && !availableStations.includes(station)) {
      setStation(availableStations[0]);
    }
  }, [departmentGroups, departmentKey, availableStations, station]);

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!station) {
      notify(t("common.noStationAvailable"));
      return;
    }
    setLoading(true);
    try {
      const yy = manualYear.replace(/\D/g, '').slice(-2).padStart(2, '0');
      const ww = manualWeek.replace(/\D/g, '').padStart(2, '0');
      const machineCode = getStationMachineCode(station);
      const baseLot = `40${yy}${ww}${machineCode}40`;

      const lots = [];
      for (let i = 0; i < parsedCount; i++) {
        const currentNum = String(parsedStartNum + i).padStart(4, '0');
        lots.push(`${baseLot}${currentNum}`);
      }

      const dpi = resolvePrinterDpi(printer as Record<string, unknown>, 203);
      const darkness = printer?.darkness ? parseInt(String(printer.darkness), 10) : 15;
      const zplBatch = generateLotBatchZPL({
        lots,
        printerDpi: dpi,
        darkness,
      });

      await onPrintBatch(zplBatch, lots.length);
      notify(t("common.lotsPrintedQueued", {
        count: parsedCount,
        printer: printer?.name || printer?.id || station,
      }));
    } catch(err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      notify(t("common.generationError", { message }));
    } finally {
      setLoading(false);
    }
  };

  const previewYY = manualYear.replace(/\D/g, '').slice(-2).padStart(2, '0');
  const previewWW = manualWeek.replace(/\D/g, '').padStart(2, '0');
  const previewMachineCode = getStationMachineCode(station);
  const previewBaseLot = `40${previewYY}${previewWW}${previewMachineCode}40`;
  const previewLots = Array.from({ length: Math.min(5, Math.max(1, parsedCount)) }, (_, i) => {
    const seq = parsedStartNum + i;
    return `${previewBaseLot}${String(seq).padStart(4, '0')}`;
  });

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Printer className="text-blue-500" /> {t("common.printLotNumbers")}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.department")}</label>
            <select
              value={departmentKey}
              onChange={e => setDepartmentKey(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              disabled={departmentGroups.length === 0}
            >
              {departmentGroups.length === 0 && <option value="">{t("common.noDepartmentsFound")}</option>}
              {departmentGroups.map((group: DepartmentGroup) => <option key={group.key} value={group.key}>{group.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.stationMachine")}</label>
            <select value={station} onChange={e => setStation(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50" disabled={availableStations.length === 0}>
              {availableStations.length === 0 && <option value="">{t("common.noStationsFound")}</option>}
              {availableStations.map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.year", "Jaar")}</label>
              <input
                type="text"
                value={manualYear}
                onChange={(e) => setManualYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onBlur={() => {
                  if (!manualYear) {
                    const { year } = getISOWeekInfo(new Date());
                    setManualYear(String(year));
                  }
                }}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
                maxLength={4}
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.week", "Week")}</label>
              <input
                type="text"
                value={manualWeek}
                onChange={(e) => setManualWeek(e.target.value.replace(/\D/g, '').slice(0, 2))}
                onBlur={() => {
                  const val = manualWeek.replace(/\D/g, '');
                  if (!val) {
                    const { week } = getISOWeekInfo(new Date());
                    setManualWeek(String(week).padStart(2, '0'));
                  } else {
                    setManualWeek(val.padStart(2, '0'));
                  }
                }}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
                maxLength={2}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.startSequenceNumber")}</label>
              <input
                type="number"
                min="1"
                max="9999"
                inputMode="numeric"
                value={startNum}
                onChange={(e) => setStartNum(e.target.value)}
                onBlur={() => setStartNum(String(parsedStartNum))}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.numberOfLabels")}</label>
              <input
                type="number"
                min="1"
                max="100"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onBlur={() => setCount(String(parsedCount))}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              />
            </div>
          </div>
          <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 flex flex-col items-center mt-2">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest w-full text-left">{t("common.livePreviewMax", { max: 5 })}</p>
            <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white" style={{ maxWidth: '90mm' }}>
              {previewLots.map((lot) => (
                <div key={lot} className="w-full h-[13mm] px-2 flex items-center gap-2 border-b border-dashed border-slate-300 last:border-b-0" style={{ maxWidth: '90mm' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(lot)}`}
                    alt="QR links"
                    className="w-8 h-8 object-contain"
                  />
                  <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-[0.08em] leading-none break-all flex-1 text-center">
                    {lot}
                  </p>
                </div>
              ))}
              {parsedCount > 5 && (
                <p className="text-[11px] font-bold text-slate-500 text-center">{t("common.extraLabelsPrinted", { count: parsedCount - 5 })}</p>
              )}
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full mt-4 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
            {t("common.generateAndPrint")}
          </button>
        </form>
      </div>
    </div>
  );
};


export default LotPrintModal;