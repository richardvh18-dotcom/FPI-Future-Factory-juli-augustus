
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

import { PrinterRecord, LabelTemplate, TempOrderRecord, colPath } from '../adminPrinterHelpers';

const TempLabelModal = ({ onClose, printers, labelTemplates, labelRules, onPrint, onOpenTemplateManager }: {
  onClose: () => void;
  printers: PrinterRecord[];
  labelTemplates: LabelTemplate[];
  labelRules: Record<string, unknown>[];
  onPrint: (orderData: TempOrderRecord, targetPrinterId: string, templateId?: string) => void;
  onOpenTemplateManager?: () => void;
}) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [orderStr, setOrderStr] = useState("");
  const [results, setResults] = useState<TempOrderRecord[]>([]);
  const [initialList, setInitialList] = useState<TempOrderRecord[]>([]);
  const [loadingInitialList, setLoadingInitialList] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchDiagnostics, setSearchDiagnostics] = useState<string[]>([]);
  const [printerId, setPrinterId] = useState<string>(printers[0]?.id || "");
  const [selectedTemplateByOrder, setSelectedTemplateByOrder] = useState<Record<string, string>>({});


  const getTemplateOptions = (item: TempOrderRecord): LabelTemplate[] => {
    return filterTempOrderLabelsByProduct(labelTemplates, buildOrderLabelTemplateProduct(item as Record<string, unknown>)) as LabelTemplate[];
  };

  const getPreviewData = (item: TempOrderRecord): Record<string, unknown> => {
    return buildOrderLabelPreviewData(item as Record<string, unknown>, labelRules || []);
  };

  useEffect(() => {
    let isMounted = true;

    const loadInitialList = async () => {
      setLoadingInitialList(true);
      try {
        const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;
        
        const loadInitialDeepPaths = async () => {
          const deepResults: TempOrderRecord[] = [];
          const machinePairs = await loadFactoryMachinePaths();
          for (const { productType, machine } of machinePairs) {
              try {
                const machinePath = `${getPathString(PATHS.PLANNING)}/${productType}/machines/${machine}/orders`;
                const machineSnap = await getDocs(query(collection(db, machinePath), limit(200)));
                machineSnap.docs.forEach((d) => {
                  const data = (d.data() || {}) as DocumentData;
                  deepResults.push({
                    id: d.id,
                    ...data,
                    orderDisplay: data.orderId || data.Order || data.Productieorder || data.order || d.id,
                    productDisplay: data.item || data.itemCode || data.Item || data.Artikel || data.description || data.Description || data.Omschrijving || "-",
                  });
                });
              } catch {
                // Silent fail: pad bestaat misschien niet
              }
          }
          return deepResults;
        };

        const [tempSnap, planSnap, trackSnap, scopedPlanningSnap, deepPaths] = await Promise.all([
          getDocs(query(colPath(PATHS.TEMP_PLANNING), limit(120))),
          getDocs(query(colPath(PATHS.PLANNING), limit(120))),
          getDocs(query(colPath(PATHS.TRACKING), limit(120))),
          getDocs(query(collectionGroup(db, "orders"), limit(250))),
          loadInitialDeepPaths(),
        ]);

        if (!isMounted) return;

        const rows: TempOrderRecord[] = [];
        const pushRows = (snap: QuerySnapshot<DocumentData>, pathPrefix?: string) => {
          snap.docs.forEach((d) => {
            if (pathPrefix && !String(d.ref?.path || "").startsWith(pathPrefix)) return;
            const data = (d.data() || {}) as DocumentData;
            rows.push({
              id: d.id,
              ...data,
              orderDisplay: data.orderId || data.Order || data.Productieorder || data.order || d.id,
              productDisplay: data.item || data.itemCode || data.Item || data.Artikel || data.description || data.Description || data.Omschrijving || "-",
            });
          });
        };

        pushRows(tempSnap);
        pushRows(planSnap);
        pushRows(trackSnap);
        pushRows(scopedPlanningSnap, planningPrefix);
        deepPaths.forEach((item) => {
          if (!rows.find((r) => r.id === item.id)) rows.push(item);
        });

        const dedup: TempOrderRecord[] = [];
        const seen = new Set<string>();
        rows.forEach((r) => {
          if (seen.has(r.id)) return;
          seen.add(r.id);
          dedup.push(r);
        });

        dedup.sort((a, b) => String(a.orderDisplay).localeCompare(String(b.orderDisplay), undefined, { numeric: true }));
        setInitialList(dedup);
      } catch (err: unknown) {
        console.error("❌ Fout bij laden order labels lijst:", err);
      } finally {
        if (isMounted) setLoadingInitialList(false);
      }
    };

    loadInitialList();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearch = async () => {
    if (!orderStr.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setResults([]);
    setSearchDiagnostics([]);
    try {
      const { results: finalResults, diagnostics } = await executeOrderLabelSearch(orderStr, initialList as LabelTemplate[]);
      setSearchDiagnostics(diagnostics);
      setResults(finalResults as TempOrderRecord[]);

      if (finalResults.length === 0) {
        setSearchDiagnostics((prev) => {
          const msgs = prev.length > 0 ? prev : ["Geen matches in fallback queries."];
          notify({ type: "warning", message: `Geen resultaat gevonden voor '${orderStr}'.` });
          return msgs;
        });
      }
    } catch (e: unknown) {
      console.error("❌ Zoekfout temp labels:", e);
      console.error("Search string was:", orderStr);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Tag className="text-amber-500" /> Legacy Order Labels
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs font-bold text-emerald-800">
            Label Templates: groot overzicht per vaste map. Klik op het pennetje om direct in Designer te openen.
          </p>
          {onOpenTemplateManager && (
            <button
              type="button"
              onClick={onOpenTemplateManager}
              className="px-3 py-2 bg-white border border-emerald-200 text-emerald-700 rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-emerald-100"
            >
              Open Label Templates
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-6">
          <input 
            type="text" 
            placeholder={t('printer.searchOrderPlaceholder', 'TYP ORDERNUMMER (BIJV. N20000)')}
            className="flex-1 p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold uppercase outline-none focus:border-amber-500"
            value={orderStr}
            onChange={(e) => setOrderStr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} disabled={loading} className="px-6 bg-slate-900 text-white rounded-2xl font-black uppercase text-sm hover:bg-slate-800 transition-all flex items-center gap-2">
            <Search size={18} /> {t("common.search", "Zoek")}
          </button>
        </div>

        <div className="mb-4">
          <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{t("adminPrinterManager.printer", "Printer")}</label>
          <select 
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
            value={printerId}
            onChange={(e) => setPrinterId(e.target.value)}
          >
            {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {(results.length > 0 || (!orderStr.trim() && initialList.length > 0)) && (
          <div className="space-y-2 mb-2 max-h-[48vh] overflow-y-auto custom-scrollbar pr-2">
            {(orderStr.trim() ? results : initialList).map((item, idx) => {
              const orderDisplay = item.orderId || item.Order || item.Productieorder || item.order || item.id || "-";
              const productDisplay = item.item || item.itemCode || item.Item || item.Artikel || item.description || item.Description || item.Omschrijving || "-";
              const itemKey = String(item.id || orderDisplay);
              const templateOptions = getTemplateOptions(item);
              const selectedTemplateId = selectedTemplateByOrder[itemKey] || templateOptions[0]?.id || "";
              const selectedTemplate = templateOptions.find((tpl) => tpl.id === selectedTemplateId) || templateOptions[0] || null;
              const previewData = getPreviewData(item);

              return (
                <div
                  key={`${item.id || orderDisplay}-${idx}`}
                  className="w-full p-4 bg-white border border-slate-200 hover:border-amber-300 rounded-2xl transition-all"
                >
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-800 truncate">{orderDisplay}</p>
                      <p className="text-xs font-bold text-slate-500 truncate">{productDisplay}</p>

                      <div className="mt-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t("common.template", "Template")}</label>
                        {templateOptions.length > 0 ? (
                          <select
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                            value={selectedTemplateId}
                            onChange={(e) => {
                              const value = e.target.value;
                              setSelectedTemplateByOrder((prev) => ({ ...prev, [itemKey]: value }));
                            }}
                          >
                            {templateOptions.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>{String(tpl.name || tpl.id)}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs italic text-amber-600">{t("adminPrinterManager.noMatchingTemporaryTemplate", "Geen passende tijdelijke template gevonden.")}</p>
                        )}
                      </div>

                      <button
                        onClick={() => onPrint(item, printerId, selectedTemplateId)}
                        disabled={!printerId || !selectedTemplateId}
                        className="mt-3 px-3 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-amber-600 disabled:opacity-50"
                      >
                        Print
                      </button>
                    </div>

                    <div className="w-full lg:w-64 h-36 bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-center">
                      {selectedTemplate ? (
                        <AutoScaledLabelPreview
                          label={selectedTemplate}
                          data={previewData}
                          maxScale={1}
                          exactBitmapPreview
                        />
                      ) : (
                        <p className="text-xs text-slate-400 italic">{t("adminPrinterManager.noPreview", "Geen preview")}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loadingInitialList && !orderStr.trim() && (
          <p className="text-center py-8 text-slate-400 font-bold italic">{t("common.loading", "Lijst laden...")}</p>
        )}

        {results.length === 0 && orderStr.trim() && !loading && (
          <div className="py-6 space-y-2">
            <p className="text-center text-slate-400 font-bold italic">{t("adminPrinterManager.noOrderFoundInTemporaryImport", "Geen order gevonden in tijdelijke import.")}</p>
            {searchDiagnostics.length > 0 && (
              <div className="mx-auto max-w-xl text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-600">
                <p className="font-black mb-1">{t("adminPrinterManager.searchDiagnostics", "Zoekdiagnostiek")}</p>
                {searchDiagnostics.map((line, idx) => (
                  <p key={`${line}-${idx}`} className="break-all">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TempLabelModal;
