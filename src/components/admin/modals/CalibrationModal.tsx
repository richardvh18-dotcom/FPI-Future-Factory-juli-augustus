
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

import { PrinterRecord, PrinterFormData, parseMm, buildCalibrationCrossZpl, resolveRollWidthMm, buildLabelaryPreviewUrl, getErrMsg } from '../adminPrinterHelpers';

const CalibrationModal = ({ printer, onClose, onPrint, onApply }: {
  printer: PrinterRecord;
  onClose: () => void;
  onPrint: (config: { labelHeightMm: number }) => void;
  onApply: (payload: { calibrationOffsetXMm: number; calibrationOffsetYMm: number }) => void;
}) => {
  const { t } = useTranslation();
  const [labelHeightMm, setLabelHeightMm] = useState(40);
  const [manualXMm, setManualXMm] = useState(String(parseMm(printer?.calibrationOffsetXMm, 0)));
  const [manualYMm, setManualYMm] = useState(String(parseMm(printer?.calibrationOffsetYMm, 0)));
  const [measuredLeftMm, setMeasuredLeftMm] = useState("");
  const [measuredRightMm, setMeasuredRightMm] = useState("");
  const [measuredTopMm, setMeasuredTopMm] = useState("");
  const [measuredBottomMm, setMeasuredBottomMm] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");

  const measuredLeft = parseMm(measuredLeftMm, NaN);
  const measuredRight = parseMm(measuredRightMm, NaN);
  const measuredTop = parseMm(measuredTopMm, NaN);
  const measuredBottom = parseMm(measuredBottomMm, NaN);
  const suggestionX = Number.isFinite(measuredLeft) && Number.isFinite(measuredRight)
    ? ((measuredRight - measuredLeft) / 2)
    : null;
  const suggestionY = Number.isFinite(measuredTop) && Number.isFinite(measuredBottom)
    ? ((measuredBottom - measuredTop) / 2)
    : null;

  const handleUseSuggestions = () => {
    if (suggestionX !== null) setManualXMm(suggestionX.toFixed(2));
    if (suggestionY !== null) setManualYMm(suggestionY.toFixed(2));
  };

  const handlePreview = () => {
    try {
      setPreviewError("");
      const previewPrinter = {
        ...printer,
        calibrationOffsetXMm: String(parseMm(manualXMm, 0)),
        calibrationOffsetYMm: String(parseMm(manualYMm, 0)),
      };
      const zpl = buildCalibrationCrossZpl({
        printer: previewPrinter,
        labelWidthMm: resolveRollWidthMm(previewPrinter),
        labelHeightMm,
      });
      const dpi = getDriver(previewPrinter).nativeDpi;
      setPreviewUrl(buildLabelaryPreviewUrl({ zpl, dpi, widthMm: resolveRollWidthMm(previewPrinter), heightMm: labelHeightMm }));
    } catch (err: unknown) {
      setPreviewError("Preview genereren mislukt: " + getErrMsg(err));
    }
  };

  return (
    <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Crosshair className="text-blue-600" /> {t("adminPrinterManager.printCalibration", "Print Calibratie")} - {printer?.name || t("adminPrinterManager.printer", "Printer")}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.calibrationLabelFormat", "Calibratie Labelformaat")}</label>
            <select
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              value={String(labelHeightMm)}
              onChange={(e) => setLabelHeightMm(parseInt(e.target.value, 10) || 40)}
            >
              <option value="40">90 x 40 mm</option>
              <option value="65">90 x 65 mm</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => onPrint({ labelHeightMm })}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <Printer size={18} /> {t("adminPrinterManager.printCrosses", "Print Kruisjes")}
            </button>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-3">{t("adminPrinterManager.quickCalculateMargins", "Snel berekenen op basis van marges")}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.measuredFreeMarginLeft", "Gemeten vrije marge links (mm)")}</label>
              <input type="number" step="0.1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" value={measuredLeftMm} onChange={(e) => setMeasuredLeftMm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.measuredFreeMarginRight", "Gemeten vrije marge rechts (mm)")}</label>
              <input type="number" step="0.1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" value={measuredRightMm} onChange={(e) => setMeasuredRightMm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.measuredFreeMarginTop", "Gemeten vrije marge boven (mm)")}</label>
              <input type="number" step="0.1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" value={measuredTopMm} onChange={(e) => setMeasuredTopMm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.measuredFreeMarginBottom", "Gemeten vrije marge onder (mm)")}</label>
              <input type="number" step="0.1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" value={measuredBottomMm} onChange={(e) => setMeasuredBottomMm(e.target.value)} />
            </div>
          </div>
          {suggestionX !== null && (
            <p className="mt-3 text-sm font-bold text-blue-700">
              {t("adminPrinterManager.suggestionXCorrection", "Suggestie X-correctie")}: {suggestionX > 0 ? '+' : ''}{suggestionX.toFixed(2)} mm
              <span className="text-slate-500 font-semibold"> ({t("adminPrinterManager.positiveMeansRight", "positief = naar rechts")})</span>
            </p>
          )}
          {suggestionY !== null && (
            <p className="mt-1 text-sm font-bold text-blue-700">
              {t("adminPrinterManager.suggestionYCorrection", "Suggestie Y-correctie")}: {suggestionY > 0 ? '+' : ''}{suggestionY.toFixed(2)} mm
              <span className="text-slate-500 font-semibold"> ({t("adminPrinterManager.positiveMeansDown", "positief = naar beneden")})</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.offsetX", "Offset X (mm)")}</label>
            <input type="number" step="0.1" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" value={manualXMm} onChange={(e) => setManualXMm(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.offsetY", "Offset Y (mm)")}</label>
            <input type="number" step="0.1" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" value={manualYMm} onChange={(e) => setManualYMm(e.target.value)} />
          </div>
        </div>

        <div className="mb-5">
          <button
            onClick={handleUseSuggestions}
            disabled={suggestionX === null && suggestionY === null}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg font-black text-xs uppercase tracking-wider hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("adminPrinterManager.useSuggestions", "Gebruik suggesties")}
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-xs font-bold uppercase text-slate-500">{t("adminPrinterManager.previewBeforePrint", "Preview vóór printen")}</p>
            <button
              onClick={handlePreview}
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg font-black text-xs uppercase tracking-wider hover:bg-slate-100"
            >
              {t("adminPrinterManager.generatePreview", "Preview Genereren")}
            </button>
          </div>
          {previewError && <p className="mt-2 text-xs font-bold text-rose-600">{previewError}</p>}
          {previewUrl && (
            <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3 overflow-auto">
              <img src={previewUrl} alt={t("adminPrinterManager.calibrationPreview", "Calibratie preview")} className="max-w-full h-auto" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">{t("common.close", "Sluiten")}</button>
          <button
            onClick={() => onApply({
              calibrationOffsetXMm: parseMm(manualXMm, 0),
              calibrationOffsetYMm: parseMm(manualYMm, 0),
            })}
            className="px-5 py-2 bg-emerald-600 text-white font-black rounded-lg hover:bg-emerald-700"
          >
            {t("adminPrinterManager.saveAsPrinterOffset", "Opslaan als Printer Offset")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationModal;
