
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { jsPDF } from "jspdf";
import * as QRCode from "qrcode";
import { 
  Printer, 
  Plus, 
  Trash2, 
  Save, 
  Play,
  X,
  MapPin,
  Edit,
  Usb,
  List,
  Server,
  QrCode,
  Hash,
  Tag,
  Search,
  Crosshair,
  Loader2,
  Activity,
  CheckCircle,
  AlertCircle,
  WifiOff,
  PauseCircle,
} from "lucide-react";
import { 
  collection, 
  collectionGroup,
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  setDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  documentId,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { getDriver, applyCalibration, PRINTER_DRIVERS } from "../../../utils/printerDrivers";
import { queuePrintJob } from "../../../services/planningSecurityService";
import { generatePrintData } from "../../../utils/zplHelper";
import {
  processLabelData,
  resolveLabelContent,
  applyLabelLogic,
  filterTempOrderLabelsByProduct,
} from "../../../utils/labelHelpers";
import PrintQueueAdminView from "../../printer/PrintQueueAdminView";
import AutoScaledLabelPreview from "../../printer/AutoScaledLabelPreview";
import InternalQrImage from "../../../utils/InternalQrImage";
import { useNotifications } from "../../../contexts/NotificationContext";
import { logComplianceEvent } from "../../../services/complianceAudit";
import { useLabelCatalog } from "../../../hooks/useLabelCatalog";
import { useFormPersistence } from "../../../hooks/useFormPersistence";
import { serializeRoutingKeys } from "../../../utils/printRouting";
import { renderLabelToBitmapZpl } from "../../../utils/zebraLabelRenderEngine";
import { normalizePrinterProtocol, renderLabelForPrinter } from "../../../utils/printerProtocolService";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS, getPathString } from "../../../config/dbPaths";
import { isUsbDirectSupported, requestUsbDevice, printRawUsb, printBinaryUsbToDevice, resolveUsbDeviceForPrinter } from "../../../utils/usbPrintService";
import { buildTsplUsbPayload, renderLabelToBitmapTspl } from "../../../utils/tsplPrintService";
import { executeOrderLabelSearch, loadFactoryMachinePaths, normalizeText } from "../../../utils/orderLabelSearch";
import {
  buildOrderLabelPreviewData,
  buildOrderLabelTemplateProduct,
} from "../../../utils/orderLabelTemplateUtils";
import { isPrinterOnline } from "../../../utils/printerStatus";
import { loadPrinterStatusHistory, type PrinterStatusRecord } from "../../../utils/printerStatus";
import { queryAndSavePrinterStatusUsb } from "../../../utils/usbPrintService";
import { resolvePreferredQueueDepartment } from "../../../utils/printerQueueStationUtils";

import { PrinterRecord, LabelTemplate, getIsoWeekAndYear, getMachineCode } from '../adminPrinterHelpers';

const LotPrintModal = ({ onClose, stations, printers, onPrint }: {
  onClose: () => void;
  stations: string[];
  printers: PrinterRecord[];
  onPrint: (config: {
    station: string;
    year: string;
    week: string;
    startSeq: number;
    count: number;
    mode: "sequential" | "identical";
    printerId: string;
  }) => void;
}) => {
  const { t } = useTranslation();
  const { week: curWeek, year: curYear } = getIsoWeekAndYear(new Date());
  const [config, setConfig] = useState<{
    station: string;
    year: string;
    week: string;
    startSeq: string;
    count: string;
    mode: "sequential" | "identical";
    printerId: string;
  }>({
    station: stations[0] || "",
    year: String(curYear),
    week: String(curWeek).padStart(2, '0'),
    startSeq: "1",
    count: "1",
    mode: 'sequential', // 'sequential' | 'identical'
    printerId: printers[0]?.id || ""
  });

  const parsedStartSeq = Math.max(1, Math.min(9999, parseInt(config.startSeq, 10) || 1));
  const parsedCount = Math.max(1, Math.min(100, parseInt(config.count, 10) || 1));

  const yy = config.year.replace(/\D/g, '').slice(-2).padStart(2, '0');
  const ww = config.week.replace(/\D/g, '').padStart(2, '0');
  const machineCode = getMachineCode(config.station);
  const baseLot = `40${yy}${ww}${machineCode}40`;
  const previewLots = Array.from({ length: Math.min(5, Math.max(1, parsedCount)) }, (_, i) => {
    const seqNum = config.mode === 'sequential' ? parsedStartSeq + i : parsedStartSeq;
    return `${baseLot}${String(seqNum).padStart(4, '0')}`;
  });

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Hash className="text-blue-600" /> {t("adminPrinterManager.printLotNumbers", "Lotnummers Printen")}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.station", "Station")}</label>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.station}
                onChange={e => setConfig({...config, station: e.target.value})}
              >
                {stations.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.year", "Jaar")}</label>
                <input
                  type="text"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                  value={config.year}
                  onChange={(e) => setConfig({ ...config, year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  onBlur={() => {
                    if (!config.year) {
                      const { year } = getIsoWeekAndYear(new Date());
                      setConfig(prev => ({ ...prev, year: String(year) }));
                    }
                  }}
                  maxLength={4}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.week", "Week")}</label>
                <input
                  type="text"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                  value={config.week}
                  onChange={(e) => setConfig({ ...config, week: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                  onBlur={() => {
                    const val = config.week.replace(/\D/g, '');
                    if (!val) {
                      const { week } = getIsoWeekAndYear(new Date());
                      setConfig(prev => ({ ...prev, week: String(week).padStart(2, '0') }));
                    } else {
                      setConfig(prev => ({ ...prev, week: val.padStart(2, '0') }));
                    }
                  }}
                  maxLength={2}
                  required
                />
              </div>
            </div>
            <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("adminPrinterManager.isoWeek", "ISO week")} {ww}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.startSequenceNumber", "Start Volgnummer")}</label>
              <input 
                type="number" 
                min="1"
                max="9999"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.startSeq}
                onChange={e => setConfig({...config, startSeq: e.target.value})}
                onBlur={() => setConfig(prev => ({ ...prev, startSeq: String(parsedStartSeq) }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.numberOfLabels", "Aantal Labels")}</label>
              <input 
                type="number" 
                min="1"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.count}
                onChange={e => setConfig({...config, count: e.target.value})}
                onBlur={() => setConfig(prev => ({ ...prev, count: String(parsedCount) }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-2 block">{t("adminPrinterManager.printMode", "Print Modus")}</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 flex-1">
                <input type="radio" name="mode" checked={config.mode === 'sequential'} onChange={() => setConfig({...config, mode: 'sequential'})} />
                <span className="text-sm font-bold">{t("adminPrinterManager.sequential", "Oplopend")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 flex-1">
                <input type="radio" name="mode" checked={config.mode === 'identical'} onChange={() => setConfig({...config, mode: 'identical'})} />
                <span className="text-sm font-bold">{t("adminPrinterManager.identical", "Identiek")}</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.printer", "Printer")}</label>
            <select 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              value={config.printerId}
              onChange={e => setConfig({...config, printerId: e.target.value})}
            >
              {printers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 flex flex-col items-center">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest w-full text-left">{t("adminPrinterManager.livePreviewMax", "Live Preview (max 5)")}</p>
            <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white" style={{ maxWidth: '90mm' }}>
              {previewLots.map((lot) => (
                <div key={lot} className="w-full h-[13mm] px-2 flex items-center gap-2 border-b border-dashed border-slate-300 last:border-b-0" style={{ maxWidth: '90mm' }}>
                  <InternalQrImage value={lot} size={128} alt="QR Preview Links" className="w-8 h-8 object-contain" />
                  <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-[0.08em] leading-none break-all flex-1 text-center">
                    {lot}
                  </p>
                </div>
              ))}
              {parsedCount > 5 && (
                <p className="text-[11px] font-bold text-slate-500 text-center">+{parsedCount - 5} {t("adminPrinterManager.extraLabelsPrinted", "extra labels worden geprint")}</p>
              )}
            </div>
          </div>

          <button 
            onClick={() => onPrint({
              station: config.station,
              year: config.year,
              week: config.week,
              startSeq: parsedStartSeq,
              count: parsedCount,
              mode: config.mode,
              printerId: config.printerId
            })}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <Printer size={20} /> {t("adminPrinterManager.startPrintJob", "Start Printopdracht")}
          </button>
        </div>
      </div>
    </div>
  );
};

// Tijdelijke legacy label modal (tot 30 maart)
export default LotPrintModal;
