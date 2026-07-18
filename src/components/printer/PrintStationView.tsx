import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { db, auth, logActivity } from '../../config/firebase';
import { collection, query, where, getDocs, limit, doc, getDoc, documentId, onSnapshot, collectionGroup, orderBy } from 'firebase/firestore';
import { PATHS, getPathString, getArchiveItemsPath } from '../../config/dbPaths';
import { Loader2, Printer, Search, RefreshCw, Send, X, Tag, Usb, Settings2 } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { generateLotBatchZPL } from '../../utils/zplHelper';
import { resolvePrinterDpi } from '../../utils/printerDrivers';
import { getISOWeekInfo, getStationMachineCode } from '../../utils/lotLogic';
import AutoScaledLabelPreview from './AutoScaledLabelPreview';
import { useLabelCatalog } from '../../hooks/useLabelCatalog';
import { useLabelPreview } from '../../hooks/useLabelPreview';
import { processLabelData, applyLabelLogic, filterOrderLabelsByProduct, filterLabelsByProduct } from '../../utils/labelHelpers';
import { executeOrderLabelSearch, loadFactoryMachinePaths, normalizeText } from "../../utils/orderLabelSearch";
import { renderLabelToBitmapZpl } from '../../utils/unifiedLabelRenderEngine';
import { resolvePrinterForRouting } from '../../utils/printRouting';
import { queuePrintJob } from '../../services/printService';
import {
  buildOrderLabelPreviewData,
  buildOrderLabelTemplateProduct,
  hasOrderLabelCode,
  getOrderLabelDescription,
  getOrderLabelItemCode,
  getOrderLabelOrder,
  isOrderLabelFlangeProduct,
  normalizeOrderLabelProductData,
  pickPreferredTempTemplateId,
  resolveLinkedTemplateChain,
} from '../../utils/orderLabelTemplateUtils';

type AnyRecord = Record<string, unknown>;

type LabelTemplate = {
  id: string;
  name?: string;
  width?: number;
  height?: number;
  tags?: string[];
  elements?: unknown[];
  [key: string]: unknown;
};

type PrinterConfig = {
  id: string;
  vendorId?: number | string;
  productId?: number | string;
  productName?: string;
  dpi?: number | string;
  darkness?: number | string;
  zplTextFont?: string;
  bitmapPrintEnabled?: boolean;
  queueStations?: unknown[];
  linkedStations?: unknown[];
  [key: string]: unknown;
};

type DepartmentGroup = {
  key: string;
  label: string;
  stations: string[];
};

type TempLabelItemProps = {
  item: AnyRecord;
  labelTemplates: LabelTemplate[];
  labelRules: AnyRecord[];
  onPrint: (orderData: AnyRecord, templateId: string, quantity?: number) => Promise<void>;
  printerDpi?: number;
  departmentGroups?: DepartmentGroup[];
  printers?: PrinterConfig[];
  stationId?: string;
};

type TempLabelModalProps = {
  onClose: () => void;
  onPrint: (orderData: AnyRecord, templateId: string, quantity?: number) => Promise<void>;
  labelTemplates?: LabelTemplate[];
  labelRules?: AnyRecord[];
  printerDpi?: number;
  departmentGroups?: DepartmentGroup[];
  printers?: PrinterConfig[];
  stationId?: string;
};

type LotPrintModalProps = {
  onClose: () => void;
  departmentGroups: DepartmentGroup[];
  onPrintBatch: (batchData: string, lotCount: number) => Promise<void>;
  printer: PrinterConfig | null;
};

type PrintStationWizardModalProps = {
  onClose: () => void;
  stations: string[];
  printers: PrinterConfig[];
  selectedStation: string;
  stationBindings: Record<string, string>;
  onSave: (station: string, printerId: string) => void;
};

const USB_PRINTER_VENDOR_KEY = 'usb_printer_vendor';
const USB_PRINTER_PRODUCT_KEY = 'usb_printer_product';
const USB_PRINTER_ID_KEY = 'usb_printer_id';
const PRINT_STATION_SELECTED_KEY = 'print_station_selected_station';
const PRINT_STATION_BINDINGS_KEY = 'print_station_printer_bindings_v1';

const stationNameFromValue = (stationValue: unknown): string => {
  if (!stationValue) return '';
  if (typeof stationValue === 'string') return stationValue.trim();
  if (typeof stationValue === 'object') {
    const stationObj = stationValue as AnyRecord;
    return String(
      stationObj.name || stationObj.station || stationObj.id || stationObj.code || ''
    ).trim();
  }
  return String(stationValue).trim();
};

const getErrMsg = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message || "onbekende fout");
  }
  return String(err);
};

const normalizeStationBindingKey = (value: unknown): string =>
  String(value || '').trim().toUpperCase().replace(/\s+/g, '');

const readStationBindings = (): Record<string, string> => {
  try {
    const raw = String(localStorage.getItem(PRINT_STATION_BINDINGS_KEY) || '').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed || {})
        .map(([key, value]) => [normalizeStationBindingKey(key), String(value || '').trim()])
        .filter(([key, value]) => Boolean(key) && Boolean(value))
    );
  } catch {
    return {};
  }
};

const writeStationBindings = (nextBindings: Record<string, string>) => {
  localStorage.setItem(PRINT_STATION_BINDINGS_KEY, JSON.stringify(nextBindings || {}));
};

const resolveUsbBoundPrinter = (printers: PrinterConfig[], usbDevice: USBDevice | null, stationId?: string): PrinterConfig | null => {
  const stationKey = normalizeStationBindingKey(stationId);
  if (stationKey) {
    const stationBindings = readStationBindings();
    const boundPrinterId = String(stationBindings[stationKey] || '').trim();
    if (boundPrinterId) {
      const boundPrinter = printers.find((printer) => printer.id === boundPrinterId) || null;
      if (boundPrinter) return boundPrinter;
    }
  }

  const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();
  if (savedPrinterId) {
    const savedPrinter = printers.find((printer) => printer.id === savedPrinterId) || null;
    if (savedPrinter) return savedPrinter;
  }

  if (!usbDevice) return null;

  const matches = printers.filter(
    (printer) => Number(printer.vendorId) === usbDevice.vendorId && Number(printer.productId) === usbDevice.productId
  );

  if (matches.length === 1) return matches[0];
  return null;
};

// --- Helper voor Tijdelijke Labels ---
const TempLabelItem = ({ item, labelTemplates, labelRules, onPrint, printerDpi = 203, departmentGroups = [], printers = [], stationId }: TempLabelItemProps) => {
  const { t } = useTranslation();
  const { notify, showError, showSuccess } = useNotifications();
  const itemDisplay = getOrderLabelDescription(item) || getOrderLabelItemCode(item);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  
  // States for "Add Lot Number" form
  const [lotFormOpen, setLotFormOpen] = useState(false);
  const [manualDept, setManualDept] = useState(departmentGroups[0]?.key || "");
  const [manualStation, setManualStation] = useState(departmentGroups[0]?.stations?.[0] || "");
  const [manualWeekOffset, setManualWeekOffset] = useState(0);
  const [manualSeq, setManualSeq] = useState("");
  const [labelCount, setLabelCount] = useState("1");
  const [isGenerating, setIsGenerating] = useState(false);

  const topOptions = useMemo(() => {
    return filterOrderLabelsByProduct(labelTemplates || [], buildOrderLabelTemplateProduct(item)) as LabelTemplate[];
  }, [item, labelTemplates]);

  useEffect(() => {
    if (topOptions.length > 0) {
      const isValidSelection = topOptions.some((t: LabelTemplate) => t.id === selectedTemplateId);
      if (!selectedTemplateId || !isValidSelection) {
        setSelectedTemplateId(pickPreferredTempTemplateId(item, topOptions as any[]));
      }
    } else if (selectedTemplateId) {
      setSelectedTemplateId("");
    }
  }, [topOptions, selectedTemplateId]);

  const currentManualDept = useMemo(
    () => departmentGroups.find(d => d.key === manualDept) || departmentGroups[0] || null,
    [departmentGroups, manualDept]
  );
  const availableManualStations = currentManualDept?.stations || [];
  
  useEffect(() => {
    if (departmentGroups.length > 0 && !departmentGroups.some(d => d.key === manualDept)) {
      setManualDept(departmentGroups[0].key);
    }
  }, [departmentGroups, manualDept]);

  useEffect(() => {
    if (availableManualStations.length > 0 && !availableManualStations.includes(manualStation)) {
      setManualStation(availableManualStations[0]);
    } else if (availableManualStations.length === 0 && manualStation) {
      setManualStation("");
    }
  }, [availableManualStations, manualStation]);

  const handleLotPrint = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isFlange = String(item.itemCode || "").toUpperCase().startsWith("FL");
    if (isFlange) {
        showSuccess(t("productionStartModal.labels.flangePrintLater", "Voor flenzen worden bij start geen labels geprint. Labelprint gebeurt later bij Mazak."));
        return;
    }

    if (!manualStation || !manualSeq.trim()) {
      showError("Vul alle velden in (Machine en Volgnummer).");
      return;
    }
    
    setIsGenerating(true);
    try {
      const now = new Date();
      now.setDate(now.getDate() + (Number(manualWeekOffset) * 7));
      const { year, week } = getISOWeekInfo(now);
      const weekStr = String(week).padStart(2, '0');
      const machineCode = getStationMachineCode(manualStation);
      const seqStr = String(manualSeq).trim().padStart(3, '0');
      const generatedLot = `${machineCode}${weekStr}${seqStr}`;
      
      const count = parseInt(labelCount, 10);
      if (isNaN(count) || count < 1) {
          throw new Error("Ongeldig aantal labels.");
      }

      const availableRealLabels = filterLabelsByProduct(labelTemplates || [], item, { excludeTempOrderLabels: true });
      if (!availableRealLabels || availableRealLabels.length === 0) {
          throw new Error("Geen reguliere label template gevonden voor dit product.");
      }
      
      // Selecteer de beste match op basis van naam of eerste
      let bestTemplate = availableRealLabels[0];
      
      // Zoek naar target printer BM01
      const bm01Printer = printers.find(p => p.id === 'BM01' || String(p.name || '').toUpperCase().includes('BM01'));
      if (!bm01Printer) {
          throw new Error("Printer BM01 niet gevonden in het systeem.");
      }
      
      let dpiForPrint = printerDpi;
      if (bm01Printer.dpi) {
          dpiForPrint = parseInt(String(bm01Printer.dpi), 10);
      }
      
      const previewDataForPrint = buildOrderLabelPreviewData(item, labelRules);
      const renderData = { ...previewDataForPrint, lotNumber: generatedLot };
      
      const darkness = Number.parseInt(String((bm01Printer as any)?.darkness || '15'), 10);
      
      const zplPayload = await renderLabelToBitmapZpl({
        template: bestTemplate,
        data: renderData,
        printerDpi: dpiForPrint,
        darkness: Number.isFinite(darkness) ? darkness : 15,
        printSpeed: 3
      });

      if (!zplPayload) {
          throw new Error("Genereren van label payload mislukt.");
      }
      
      await queuePrintJob(
        bm01Printer.id,
        zplPayload,
        {
          description: `Nood-label ${bestTemplate.name} voor ${getOrderLabelOrder(item)} (Lot: ${generatedLot}) (x${count})`,
          quantity: count,
          orderId: String(getOrderLabelOrder(item) || ""),
          lotNumber: generatedLot,
          stationId: stationId || "SYSTEM",
          targetPrinterName: bm01Printer.name || "BM01",
          variables: renderData,
          templateId: bestTemplate.id,
        }
      );
      
      showSuccess(`Label succesvol verzonden naar wachtrij van ${bm01Printer.name}`);
      setLotFormOpen(false);
    } catch (err) {
      showError(getErrMsg(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedTemplate = topOptions.find((t: LabelTemplate) => t.id === selectedTemplateId) || topOptions[0];
  const selectedTemplateChain = useMemo<LabelTemplate[]>(() => {
    if (!selectedTemplate) return [];
    return resolveLinkedTemplateChain(labelTemplates as any[], selectedTemplate.id, { maxDepth: 4 }) as LabelTemplate[];
  }, [labelTemplates, selectedTemplate]);
  const previewTemplates = selectedTemplateChain.length > 0 ? selectedTemplateChain : (selectedTemplate ? [selectedTemplate] : []);

  const previewData = useMemo<Record<string, unknown>>(() => {
    return buildOrderLabelPreviewData(item, labelRules);
  }, [item, labelRules]);

  const isFlangeInfo = String(item.itemCode || "").toUpperCase().startsWith("FL");

  return (
    <div className="w-full p-4 bg-white border border-slate-200 hover:border-amber-300 rounded-2xl transition-all">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-800 truncate">{getOrderLabelOrder(item)}</p>
          <p className="text-xs font-bold text-slate-500 truncate">{itemDisplay}</p>
          
          <div className="flex gap-2 mt-4">
            <button
                onClick={() => setLotFormOpen(false)}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${!lotFormOpen ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
                Print Normaal
            </button>
            <button
                onClick={() => setLotFormOpen(true)}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${lotFormOpen ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
                + Voeg Lotnummer Toe
            </button>
          </div>

          {!lotFormOpen ? (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('common.template', 'Template')}</label>
                {topOptions.length > 0 ? (
                  <select
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    {topOptions.map((t: LabelTemplate) => (
                      <option key={t.id} value={t.id}>{String(t.name || t.id)}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs italic text-amber-600">{t('printStationView.noMatchingTemporaryTemplateFound', 'Geen passende tijdelijke template gevonden.')}</p>
                )}
                <button
                  onClick={() => onPrint(item, selectedTemplateId)}
                  disabled={!selectedTemplateId || topOptions.length === 0}
                  className="w-full mt-3 px-3 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-700 disabled:opacity-50"
                >
                  Regulier Printen
                </button>
              </div>
          ) : (
              <form onSubmit={handleLotPrint} className="mt-4 p-3 bg-amber-50/50 border border-amber-100 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">{t("common.department", "Afdeling")}</label>
                        <select value={manualDept} onChange={e => setManualDept(e.target.value)} className="w-full p-2 text-xs border border-slate-200 rounded-lg font-bold bg-white" disabled={departmentGroups.length === 0}>
                            {departmentGroups.length === 0 && <option value="">{t("common.noDepartmentsFound")}</option>}
                            {departmentGroups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">{t("common.stationMachine", "Machine")}</label>
                        <select value={manualStation} onChange={e => setManualStation(e.target.value)} className="w-full p-2 text-xs border border-slate-200 rounded-lg font-bold bg-white" disabled={availableManualStations.length === 0}>
                            {availableManualStations.length === 0 && <option value="">{t("common.noStationsFound")}</option>}
                            {availableManualStations.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">{t("common.week", "Week")}</label>
                        <select value={String(manualWeekOffset)} onChange={(e) => setManualWeekOffset(parseInt(e.target.value, 10) || 0)} className="w-full p-2 text-xs border border-slate-200 rounded-lg font-bold bg-white">
                            <option value="-1">{t("common.previousWeek", "Vorige week")}</option>
                            <option value="0">{t("common.currentWeek", "Huidige week")}</option>
                            <option value="1">{t("common.nextWeek", "Volgende week")}</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Volgnummer</label>
                        <input type="text" value={manualSeq} onChange={e => setManualSeq(e.target.value)} className="w-full p-2 text-xs border border-slate-200 rounded-lg font-bold bg-white" placeholder="Bijv. 123" required />
                    </div>
                </div>
                <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Aantal</label>
                    <input type="number" min="1" value={labelCount} onChange={e => setLabelCount(e.target.value)} className="w-full p-2 text-xs border border-slate-200 rounded-lg font-bold bg-white" required />
                </div>
                
                {isFlangeInfo && (
                  <p className="text-[10px] font-bold text-amber-700 italic">Let op: Voor flenzen worden hier geen labels geprint. Dit gebeurt later bij Mazak.</p>
                )}

                <button
                  type="submit"
                  disabled={isGenerating}
                  className="w-full mt-2 px-3 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGenerating ? <Loader2 className="animate-spin" size={14} /> : null}
                  Lotnummer Toevoegen & Printen (BM01)
                </button>
              </form>
          )}
        </div>
        <div className="w-full lg:w-64 h-56 bg-white border border-slate-200 rounded-xl p-2 overflow-y-auto">
          {previewTemplates.length > 0 ? (
            <div className="space-y-2">
              {previewTemplates.map((template: LabelTemplate, idx: number) => (
                <div key={String(template.id || idx)} className="bg-slate-50 border border-slate-200 rounded-lg p-1">
                  {previewTemplates.length > 1 && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1 pb-1">
                      {t('printStationView.labelStep', 'Label {{index}}', { index: idx + 1 })}
                    </p>
                  )}
                  <AutoScaledLabelPreview label={template} data={previewData} maxScale={1} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">{t('printStationView.noPreview', 'Geen preview')}</p>
          )}
        </div>
        </div>
      </div>
    );
};
// --- Modal: Tijdelijke Labels Zoeken ---
const TempLabelModal = ({ onClose, onPrint, labelTemplates = [], labelRules = [], printerDpi = 203, departmentGroups = [], printers = [], stationId }: TempLabelModalProps) => {
  const { t } = useTranslation();
  const [orderStr, setOrderStr] = useState("");
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [machineItems, setMachineItems] = useState<AnyRecord[]>([]);
  const [loadingMachineItems, setLoadingMachineItems] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [printCount, setPrintCount] = useState<string>("1");

  const normalizeMachineKey = useCallback((value: unknown) => {
    const compact = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    const token = compact.match(/(40BH\d+|BH\d+)/)?.[0];
    return token ? token.replace(/^40(?=BH)/, "") : compact;
  }, []);

  const machineOptions = useMemo(() => {
    const stations = departmentGroups
      .flatMap((group) => Array.isArray(group?.stations) ? group.stations : [])
      .map((station) => String(station || "").trim())
      .filter((station) => /^40BH\d+/i.test(station) || /^BH\d+/i.test(station));

    return Array.from(new Set(stations)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [departmentGroups]);

  useEffect(() => {
    if (selectedMachine) return;

    if (stationId) {
      const stationMatch = machineOptions.find((entry) => normalizeMachineKey(entry) === normalizeMachineKey(stationId));
      if (stationMatch) {
        setSelectedMachine(stationMatch);
        return;
      }
    }

    if (machineOptions.length > 0) {
      setSelectedMachine(machineOptions[0]);
    }
  }, [machineOptions, normalizeMachineKey, selectedMachine, stationId]);

  const loadMachineOrders = useCallback(async (machineValue: string) => {
    if (!machineValue) {
      setMachineItems([]);
      return;
    }

    setLoadingMachineItems(true);
    try {
      const machinePairs = await loadFactoryMachinePaths();
      const targetKey = normalizeMachineKey(machineValue);
      const relevantPairs = machinePairs.filter((pair) => normalizeMachineKey(pair.machine) === targetKey);

      const machineAliases = new Set<string>();
      const pushMachineAlias = (value: unknown) => {
        const normalized = normalizeMachineKey(value);
        if (!normalized) return;
        machineAliases.add(normalized);
        if (normalized.startsWith("BH")) machineAliases.add(`40${normalized}`);
        if (normalized.startsWith("40BH")) machineAliases.add(normalized.replace(/^40/, ""));
      };

      pushMachineAlias(machineValue);
      relevantPairs.forEach((pair) => pushMachineAlias(pair.machine));

      const productTypes = new Set<string>();
      relevantPairs.forEach((pair) => {
        const pt = String(pair.productType || "").trim();
        if (pt) productTypes.add(pt);
      });

      if (productTypes.size === 0) {
        productTypes.add("Fittings");
      }

      const fetchTargets: Array<{ productType: string; machine: string }> = [];
      productTypes.forEach((productType) => {
        machineAliases.forEach((machine) => {
          fetchTargets.push({ productType, machine });
        });
      });

      const fetches = fetchTargets.map(async ({ productType, machine }) => {
        const machinePath = `${getPathString(PATHS.PLANNING)}/${productType}/machines/${machine}/orders`;
        try {
          const snap = await getDocs(query(collection(db, machinePath), limit(600)));
          return snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as AnyRecord),
            __machine: machine,
            __productType: productType,
          }));
        } catch {
          return [] as AnyRecord[];
        }
      });

      const rows = (await Promise.all(fetches)).flat();
      const byId = new Map<string, AnyRecord>();
      rows.forEach((row) => {
        const rowId = String(row.id || "").trim();
        if (!rowId) return;
        byId.set(rowId, row);
      });

      const sorted = Array.from(byId.values())
        .filter((item) => !isOrderLabelFlangeProduct(item))
        .sort((a, b) =>
        String(getOrderLabelOrder(a)).localeCompare(String(getOrderLabelOrder(b)), undefined, { numeric: true })
      );

      setMachineItems(sorted);
      setSelectedOrderId((prev) => {
        if (prev && sorted.some((row) => String(row.id) === prev)) return prev;
        return String(sorted[0]?.id || "");
      });
    } catch (err) {
      console.error("Fout bij laden machine-orders voor order labels:", err);
      setMachineItems([]);
      setSelectedOrderId("");
    } finally {
      setLoadingMachineItems(false);
    }
  }, [normalizeMachineKey]);

  useEffect(() => {
    void loadMachineOrders(selectedMachine);
  }, [loadMachineOrders, selectedMachine]);

  const filteredMachineItems = useMemo(() => {
    const queryText = normalizeText(orderStr);
    if (!queryText) return machineItems;

    return machineItems.filter((item) => {
      const orderText = normalizeText(getOrderLabelOrder(item));
      const productText = normalizeText(getOrderLabelDescription(item) || getOrderLabelItemCode(item));
      return orderText.includes(queryText) || productText.includes(queryText);
    });
  }, [machineItems, orderStr]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return machineItems.find((item) => String(item.id || "") === selectedOrderId) || null;
  }, [machineItems, selectedOrderId]);

  const temporaryTemplates = useMemo(() => {
    if (!selectedOrder) return [] as LabelTemplate[];
    return filterOrderLabelsByProduct(labelTemplates || [], buildOrderLabelTemplateProduct(selectedOrder)) as LabelTemplate[];
  }, [labelTemplates, selectedOrder]);

  useEffect(() => {
    if (temporaryTemplates.length === 0) {
      setSelectedTemplateId("");
      return;
    }

    const stillValid = temporaryTemplates.some((template) => String(template.id) === selectedTemplateId);
    if (!stillValid) {
      setSelectedTemplateId(String(temporaryTemplates[0].id));
    }
  }, [selectedTemplateId, temporaryTemplates]);

  const selectedTemplate = useMemo(() => {
    return temporaryTemplates.find((template) => String(template.id) === selectedTemplateId) || temporaryTemplates[0] || null;
  }, [selectedTemplateId, temporaryTemplates]);

  const previewData = useMemo(() => {
    if (!selectedOrder) return {} as Record<string, unknown>;
    return buildOrderLabelPreviewData(selectedOrder, labelRules);
  }, [labelRules, selectedOrder]);

  const previewTemplates = useMemo(() => {
    if (!selectedTemplate) return [] as LabelTemplate[];
    const chain = resolveLinkedTemplateChain(labelTemplates as any[], selectedTemplate.id, { maxDepth: 4 }) as LabelTemplate[];
    return chain.length > 0 ? chain : [selectedTemplate];
  }, [labelTemplates, selectedTemplate]);

  const handlePrintSelected = async () => {
    if (!selectedOrder || !selectedTemplateId) return;
    const qty = Math.max(1, Math.min(100, Number.parseInt(printCount, 10) || 1));
    await onPrint(selectedOrder, selectedTemplateId, qty);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-[1200px] rounded-[36px] shadow-2xl overflow-hidden border border-slate-100">
        <div className="p-8 md:p-10 flex flex-col h-full max-h-[92vh]">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
                <Tag size={24} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase italic leading-none">{t('printStationView.orderLabels', 'Order Labels')}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Machine-keuze, orderlijst en labelpreview
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"><X size={20} /></button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col min-h-0">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t('common.stationMachine', 'Station / Machine')}</label>
                  <select
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold"
                    value={selectedMachine}
                    onChange={(e) => setSelectedMachine(e.target.value)}
                    disabled={machineOptions.length === 0}
                  >
                    {machineOptions.length === 0 && <option value="">{t('common.noStationsFound', 'Geen stations gevonden')}</option>}
                    {machineOptions.map((machine) => (
                      <option key={machine} value={machine}>{machine}</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder={t('printer.searchOrderPlaceholder', 'ZOEK OP ORDER OF PRODUCT')}
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300"
                    value={orderStr}
                    onChange={(e) => setOrderStr(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex-1 min-h-0 overflow-y-auto bg-white border border-slate-200 rounded-xl">
                {loadingMachineItems ? (
                  <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                    <Loader2 className="animate-spin" size={18} /> {t('common.loadingList', 'Lijst laden...')}
                  </div>
                ) : filteredMachineItems.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center text-slate-400 p-6">
                    {t('printStationView.noLabelsFound', 'Geen labels gevonden')}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredMachineItems.map((item) => {
                      const itemId = String(item.id || '');
                      const selected = itemId === selectedOrderId;
                      return (
                        <button
                          key={itemId}
                          type="button"
                          onClick={() => setSelectedOrderId(itemId)}
                          className={`w-full text-left px-3 py-2.5 transition-colors ${selected ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                        >
                          <p className="text-sm font-black text-slate-800 truncate">{getOrderLabelOrder(item)}</p>
                          <p className="text-xs font-semibold text-slate-500 truncate">{getOrderLabelDescription(item) || getOrderLabelItemCode(item)}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col min-h-0">
              {!selectedOrder ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  {t('printStationView.selectOrderFirst', 'Selecteer eerst een order aan de linkerkant.')}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t('common.template', 'Template')}</label>
                      <select
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        disabled={temporaryTemplates.length === 0}
                      >
                        {temporaryTemplates.length === 0 && <option value="">{t('printStationView.noMatchingTemporaryTemplateFound', 'Geen tijdelijke labels beschikbaar')}</option>}
                        {temporaryTemplates.map((template) => (
                          <option key={String(template.id)} value={String(template.id)}>{String(template.name || template.id)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t('common.amount', 'Aantal')}</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={printCount}
                        onChange={(e) => setPrintCount(e.target.value)}
                        onBlur={() => setPrintCount(String(Math.max(1, Math.min(100, Number.parseInt(printCount, 10) || 1))))}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-3">
                    {previewTemplates.length > 0 ? (
                      <div className="space-y-3">
                        {previewTemplates.map((template, idx) => (
                          <div key={String(template.id || idx)} className="bg-white border border-slate-200 rounded-xl p-2">
                            {previewTemplates.length > 1 && (
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1 pb-1">
                                {t('printStationView.labelStep', 'Label {{index}}', { index: idx + 1 })}
                              </p>
                            )}
                            <AutoScaledLabelPreview label={template} data={previewData} maxScale={1.5} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                        {t('printStationView.selectALabel', 'Selecteer een label')}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handlePrintSelected}
                    disabled={!selectedTemplateId || temporaryTemplates.length === 0}
                    className="mt-3 w-full px-4 py-3 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50"
                  >
                    {t('common.print', 'Print')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LotPrintModal = ({ onClose, departmentGroups, onPrintBatch, printer }: LotPrintModalProps) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [departmentKey, setDepartmentKey] = useState(departmentGroups[0]?.key || "");
  const [station, setStation] = useState(departmentGroups[0]?.stations?.[0] || "");
  const [weekOffset, setWeekOffset] = useState(0); // -1,0,1
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
      const now = new Date();
      now.setDate(now.getDate() + (Number(weekOffset) * 7));
      const { week, year } = getISOWeekInfo(now);
      const yy = String(year).slice(-2);
      const ww = String(week).padStart(2, '0');
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
      notify(t("common.lotsPrintedDirectUsb", { count: parsedCount }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notify(t("common.generationError", { message }));
    } finally {
      setLoading(false);
    }
  };

  const previewNow = new Date();
  previewNow.setDate(previewNow.getDate() + (Number(weekOffset) * 7));
  const { week: previewWeek, year: previewYear } = getISOWeekInfo(previewNow);
  const previewYY = String(previewYear).slice(-2);
  const previewWW = String(previewWeek).padStart(2, '0');
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
              onChange={(e) => setDepartmentKey(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              disabled={departmentGroups.length === 0}
            >
              {departmentGroups.length === 0 && <option value="">{t("common.noDepartmentsFound")}</option>}
              {departmentGroups.map((group: DepartmentGroup) => (
                <option key={group.key} value={group.key}>{group.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.stationMachine")}</label>
            <select value={station} onChange={e => setStation(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50" disabled={availableStations.length === 0}>
              {availableStations.length === 0 && <option value="">{t("common.noStationsFound")}</option>}
              {availableStations.map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.week")}</label>
            <select value={String(weekOffset)} onChange={(e) => setWeekOffset(parseInt(e.target.value, 10) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50">
              <option value="-1">{t("common.previousWeek")}</option>
              <option value="0">{t("common.currentWeek")}</option>
              <option value="1">{t("common.nextWeek")}</option>
            </select>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{t("common.isoWeek", { week: previewWW })}</p>
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

          <button type="submit" disabled={loading} className="w-full mt-4 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all flex justify-center items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
            {t("common.generateAndPrint")}
          </button>
        </form>
      </div>
    </div>
  );
};

const PrintStationWizardModal = ({
  onClose,
  stations,
  printers,
  selectedStation,
  stationBindings,
  onSave,
}: PrintStationWizardModalProps) => {
  const { t } = useTranslation();
  const [station, setStation] = useState<string>(selectedStation || stations[0] || '');
  const [printerId, setPrinterId] = useState<string>('');
  const previousStationRef = useRef<string>('');

  useEffect(() => {
    if (!station) return;
    const stationChanged = previousStationRef.current !== station;
    previousStationRef.current = station;

    const stationKey = normalizeStationBindingKey(station);
    const boundPrinterId = String(stationBindings[stationKey] || '').trim();
    const fallbackPrinterId = boundPrinterId || printers[0]?.id || '';
    const currentPrinterStillExists = printers.some((printer) => printer.id === printerId);

    // Keep a manual in-progress selection stable while the wizard is open.
    if (!stationChanged && currentPrinterStillExists) {
      return;
    }

    setPrinterId(fallbackPrinterId);
  }, [station, stationBindings, printers, printerId]);

  const handleSave = () => {
    if (!station || !printerId) return;
    onSave(station, printerId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-xl rounded-[30px] shadow-2xl p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Settings2 size={20} className="text-blue-600" /> {t('printStationView.printerWizardTitle', 'Print Station Wizard')}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t('common.stationMachine', 'Station / Machine')}</label>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
            >
              {stations.map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t('adminPrinterManager.printer', 'Printer')}</label>
            <select
              value={printerId}
              onChange={(e) => setPrinterId(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
            >
              {printers.map((printer) => (
                <option key={printer.id} value={printer.id}>{String(printer.name || printer.id)}</option>
              ))}
            </select>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            {t('printStationView.printerWizardHelp', 'Deze koppeling geldt voor alle gebruikers op deze pc/browser. Operator of admin maakt hierbij niet uit.')}
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">{t('common.cancel', 'Annuleren')}</button>
            <button onClick={handleSave} disabled={!station || !printerId} className="px-5 py-2 bg-blue-600 text-white font-black rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {t('common.save', 'Opslaan')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PrintStationView = () => {
  const { t } = useTranslation();
  const [lotNumber, setLotNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [productData, setProductData] = useState<AnyRecord | null>(null);
  const [error, setError] = useState('');
  const { showSuccess, showError } = useNotifications();

  const [selectedLabelId, setSelectedLabelId] = useState('');
  const [showTempModal, setShowTempModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [showStationWizard, setShowStationWizard] = useState(false);
  const { labelTemplates, labelRules } = useLabelCatalog();
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [factoryConfig, setFactoryConfig] = useState<AnyRecord | null>(null);
  const [selectedStation, setSelectedStation] = useState<string>(() => String(localStorage.getItem(PRINT_STATION_SELECTED_KEY) || '').trim());
  const [stationBindings, setStationBindings] = useState<Record<string, string>>(() => readStationBindings());
  const previewRef = useRef<HTMLDivElement>(null);

  const normalizedProductData = useMemo(() => {
    if (!productData) return null;
    return normalizeOrderLabelProductData(productData);
  }, [productData]);

  const { selectedLabel, previewData, availableLabels } = useLabelPreview(normalizedProductData, selectedLabelId);
  const selectedLabelPreviewChain = useMemo<LabelTemplate[]>(() => {
    if (!selectedLabel) return [];
    return resolveLinkedTemplateChain(labelTemplates as any[], (selectedLabel as any).id, { maxDepth: 4 }) as LabelTemplate[];
  }, [labelTemplates, selectedLabel]);
  const selectedPreviewTemplates = selectedLabelPreviewChain.length > 0
    ? selectedLabelPreviewChain
    : (selectedLabel ? [selectedLabel as LabelTemplate] : []);

  const filteredLabels = useMemo(() => {
    if (!normalizedProductData) return availableLabels;
    return filterOrderLabelsByProduct(availableLabels as any[], buildOrderLabelTemplateProduct(normalizedProductData as AnyRecord));
  }, [availableLabels, normalizedProductData]);

  useEffect(() => {
    if (filteredLabels.length > 0 && !filteredLabels.find((l: any) => String(l.id) === selectedLabelId)) {
      setSelectedLabelId(String(filteredLabels[0].id));
    }
  }, [filteredLabels, selectedLabelId]);

  // --- USB State & Logic ---
  const [usbDevice, setUsbDevice] = useState<USBDevice | null>(null);

  useEffect(() => {
    const matchesSavedUsbDevice = (
      device: USBDevice,
      savedVendor?: string | null,
      savedProduct?: string | null,
      savedPrinterId?: string,
      printers?: PrinterConfig[]
    ): boolean => {
      if (savedVendor && savedProduct) {
        return (
          device.vendorId === parseInt(savedVendor, 10) &&
          device.productId === parseInt(savedProduct, 10)
        );
      }

      if (savedPrinterId && printers) {
        const savedPrinter = printers.find((printer) => printer.id === savedPrinterId);
        if (savedPrinter?.vendorId !== undefined && savedPrinter?.productId !== undefined) {
          return (
            Number(savedPrinter.vendorId) === device.vendorId &&
            Number(savedPrinter.productId) === device.productId
          );
        }
      }

      return false;
    };

    const restoreUsbConnection = async () => {
      if (!('usb' in navigator)) return;
      const savedVendor = localStorage.getItem(USB_PRINTER_VENDOR_KEY);
      const savedProduct = localStorage.getItem(USB_PRINTER_PRODUCT_KEY);
      const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();

      try {
        const devices = await navigator.usb.getDevices();
        if (devices.length === 0) return;

        const match = devices.find((device) =>
          matchesSavedUsbDevice(device, savedVendor, savedProduct, savedPrinterId, printers)
        );

        if (match) {
          setUsbDevice(match);
          return;
        }

        if (!savedVendor && !savedProduct && !savedPrinterId && devices.length === 1) {
          setUsbDevice(devices[0]);
          return;
        }
      } catch (err) {
        console.warn("Kon USB printer niet automatisch herstellen:", err);
      }
    };

    const handleUsbConnect = (event: any) => {
      const device = event.device;
      if (!device) return;

      const savedVendor = localStorage.getItem(USB_PRINTER_VENDOR_KEY);
      const savedProduct = localStorage.getItem(USB_PRINTER_PRODUCT_KEY);
      const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();

      if (matchesSavedUsbDevice(device, savedVendor, savedProduct, savedPrinterId, printers)) {
        setUsbDevice(device);
      }
    };

    const handleUsbDisconnect = (event: any) => {
      const device = event.device;
      if (!device || !usbDevice) return;
      if (
        device.vendorId === usbDevice.vendorId &&
        device.productId === usbDevice.productId &&
        String(device.serialNumber || '').trim() === String(usbDevice.serialNumber || '').trim()
      ) {
        setUsbDevice(null);
      }
    };

    void restoreUsbConnection();
    // @ts-ignore
    navigator.usb.addEventListener('connect', handleUsbConnect as EventListener);
    // @ts-ignore
    navigator.usb.addEventListener('disconnect', handleUsbDisconnect as EventListener);

    return () => {
      // @ts-ignore
      navigator.usb.removeEventListener('connect', handleUsbConnect as EventListener);
      // @ts-ignore
      navigator.usb.removeEventListener('disconnect', handleUsbDisconnect as EventListener);
    };
  }, [printers, usbDevice]);

  const handleConnectUsb = async () => {
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(device);
      localStorage.setItem(USB_PRINTER_VENDOR_KEY, String(device.vendorId));
      localStorage.setItem(USB_PRINTER_PRODUCT_KEY, String(device.productId));

      const routingPrinter = resolvePrinterForRouting(printers, {
        stationId: selectedStation,
        routeKey: selectedStation,
      });
      const usbMatches = printers.filter(
        (printer) => Number(printer.vendorId) === device.vendorId && Number(printer.productId) === device.productId
      );
      const printerIdToStore = routingPrinter?.id || (usbMatches.length === 1 ? usbMatches[0].id : '');
      if (printerIdToStore) {
        persistStationBinding(selectedStation, printerIdToStore);
      }

      showSuccess(`Verbonden met USB printer: ${device.productName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showError("USB Koppelen mislukt: " + message);
    }
  };

  const printRawUsb = async (device: USBDevice, content: string, logMessage?: string) => {
    if (!device) throw new Error("Geen printer verbonden");
    if (!device.opened) await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    try { await device.claimInterface(0); } catch {
      void 0;
    }

    const encoder = new globalThis.TextEncoder();
    const data = encoder.encode(content);
    const configuration = device.configuration;
    if (!configuration) throw new Error('USB configuratie ontbreekt op apparaat.');
    const interface0 = configuration.interfaces[0];
    const endpoint = interface0?.alternates?.flatMap((a) => a.endpoints || []).find((e) => e.direction === 'out');
    const endpointNumber = endpoint ? endpoint.endpointNumber : 1;

    await device.transferOut(endpointNumber, data);

    if (logMessage) {
      try {
        await logActivity(auth.currentUser?.uid || 'system', 'PRINT_LABEL', logMessage);
      } catch (err) {
        console.error("Logging print failed:", err);
      }
    }
  };

  useEffect(() => {
    const unsubPrinters = onSnapshot(collection(db, getPathString(PATHS.PRINTERS)), (snap) => {
      setPrinters(snap.docs.map((d): PrinterConfig => ({ id: d.id, ...(d.data() as AnyRecord) })));
    });

    return () => {
      unsubPrinters();
    };
  }, []);

  useEffect(() => {
    const unsubFactory = onSnapshot(doc(db, getPathString(PATHS.FACTORY_CONFIG)), (snap) => {
      setFactoryConfig(snap.exists() ? (snap.data() as AnyRecord) : null);
    });
    return () => unsubFactory();
  }, []);

  const allFactoryStations = useMemo<string[]>(() => {
    const departments = Array.isArray(factoryConfig?.departments) ? (factoryConfig?.departments as AnyRecord[]) : [];
    const stations = departments
      .flatMap((dept: AnyRecord) => (Array.isArray(dept?.stations) ? dept.stations : []))
      .map(stationNameFromValue)
      .filter(Boolean) as string[];

    return Array.from(new Set(stations)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [factoryConfig]);

  useEffect(() => {
    if (allFactoryStations.length === 0) return;
    if (!selectedStation) {
      setSelectedStation(allFactoryStations[0]);
      return;
    }

    const exists = allFactoryStations.some((station) => station === selectedStation);
    if (!exists) {
      setSelectedStation(allFactoryStations[0]);
    }
  }, [allFactoryStations, selectedStation]);

  useEffect(() => {
    if (!selectedStation) return;
    localStorage.setItem(PRINT_STATION_SELECTED_KEY, selectedStation);
  }, [selectedStation]);

  const persistStationBinding = useCallback((station: string, printerId: string) => {
    const key = normalizeStationBindingKey(station);
    if (!key || !printerId) return;

    const nextBindings = {
      ...readStationBindings(),
      [key]: printerId,
    };

    writeStationBindings(nextBindings);
    setStationBindings(nextBindings);
    localStorage.setItem(USB_PRINTER_ID_KEY, printerId);
  }, []);

  const handleSaveStationBinding = useCallback((station: string, printerId: string) => {
    persistStationBinding(station, printerId);
    setSelectedStation(station);
    const selectedPrinter = printers.find((printer) => printer.id === printerId);
    showSuccess(
      t('printStationView.printerWizardSaved', 'Station {{station}} gekoppeld aan printer {{printer}}.', {
        station,
        printer: String(selectedPrinter?.name || printerId),
      })
    );
  }, [persistStationBinding, printers, showSuccess, t]);

  const stationBindingSummary = useMemo(() => {
    const stationNames = new Set<string>(allFactoryStations);
    Object.keys(stationBindings || {}).forEach((stationKey) => {
      stationNames.add(stationKey);
    });

    return Array.from(stationNames)
      .map((station) => {
        const stationKey = normalizeStationBindingKey(station);
        const printerId = String(stationBindings?.[stationKey] || '').trim();
        const printerName = printerId
          ? String(printers.find((printer) => printer.id === printerId)?.name || printerId)
          : '';

        return {
          station,
          printerName,
          isSelected: station === selectedStation,
        };
      })
      .sort((a, b) => a.station.localeCompare(b.station, undefined, { numeric: true }));
  }, [allFactoryStations, stationBindings, printers, selectedStation]);

  const activeQueuePrinter = useMemo<PrinterConfig | null>(() => {
    const boundPrinter = resolveUsbBoundPrinter(printers, usbDevice, selectedStation);
    if (boundPrinter) return boundPrinter;

    return resolvePrinterForRouting(printers, {
      stationId: selectedStation,
      routeKey: selectedStation,
    });
  }, [printers, usbDevice, selectedStation]);

  const stationGroups = useMemo<string[]>(() => {
    if (!activeQueuePrinter) return [];
    const stations = Array.isArray(activeQueuePrinter.queueStations)
      ? activeQueuePrinter.queueStations
      : (activeQueuePrinter.linkedStations || []);
    return Array.from(new Set(stations.map(stationNameFromValue).filter(Boolean)))
      .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
  }, [activeQueuePrinter]);

  const departmentGroups = useMemo<DepartmentGroup[]>(() => {
    const departments = Array.isArray(factoryConfig?.departments) ? (factoryConfig?.departments as AnyRecord[]) : [];
    const fromConfig = departments
      .map((dept: AnyRecord, idx) => {
        const stations = Array.from(new Set(((dept?.stations as unknown[]) || [])
          .map(stationNameFromValue)
          .filter(Boolean)))
          .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
        if (stations.length === 0) return null;

        const key = String(dept?.slug || dept?.id || `dept-${idx}`);
        const label = String(dept?.name || dept?.slug || dept?.id || `Afdeling ${idx + 1}`);
        return { key, label, stations };
      })
      .filter((v): v is DepartmentGroup => Boolean(v));

    if (fromConfig.length > 0) return fromConfig;

    return stationGroups.length > 0
      ? [{ key: 'all-stations', label: 'Alle stations', stations: stationGroups }]
      : [];
  }, [factoryConfig, stationGroups]);

  const printerDpi = useMemo(() => {
    return resolvePrinterDpi(activeQueuePrinter as Record<string, unknown>, 203);
  }, [activeQueuePrinter]);

  const printerDarkness = useMemo(() => {
    const parsed = parseInt(String(activeQueuePrinter?.darkness ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : 15;
  }, [activeQueuePrinter]);

  const printerZplTextFont = useMemo(() => {
    const raw = String(activeQueuePrinter?.zplTextFont || '').trim().toUpperCase();
    return raw === 'A' ? 'A' : '0';
  }, [activeQueuePrinter]);

  const bitmapPrintEnabled = useMemo(() => Boolean(activeQueuePrinter?.bitmapPrintEnabled), [activeQueuePrinter]);

  const handleLotNumberSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!lotNumber) return;

    setIsLoading(true);
    setProductData(null);
    setError('');

    try {
      const searchStr = lotNumber.trim().toUpperCase();
      let foundDoc: AnyRecord | null = null;

        // 1. Zoek in actieve productie (Lotnummer) - Root tracking
      try {
          const trackingRef = collection(db, getPathString(PATHS.TRACKING as string[]));
          const trackingSnap = await getDocs(query(trackingRef, where('lotNumber', '==', searchStr), limit(1)));
          if (!trackingSnap.empty) foundDoc = { id: trackingSnap.docs[0].id, ...(trackingSnap.docs[0].data() as AnyRecord) };
      } catch (e) { console.warn(e); }

        // 2. Zoek in actieve productie (Lotnummer) - Scoped tracking
      if (!foundDoc) {
        try {
            const itemsSnap = await getDocs(query(collectionGroup(db, 'items'), where('lotNumber', '==', searchStr), limit(1)));
            if (!itemsSnap.empty) foundDoc = { id: itemsSnap.docs[0].id, ...(itemsSnap.docs[0].data() as AnyRecord) };
          } catch (e) { console.warn(e); }
        }

        // 3. Fallback: Legacy actieve productie
        if (!foundDoc) {
          try {
            const activeRef = collection(db, getPathString(PATHS.ACTIVE_PRODUCTION as string[]));
            const activeSnap = await getDocs(query(activeRef, where('lotNumber', '==', searchStr), limit(1)));
            if (!activeSnap.empty) foundDoc = { id: activeSnap.docs[0].id, ...(activeSnap.docs[0].data() as AnyRecord) };
          } catch (e) { console.warn(e); }
        }

        // 4. Zoek in archief (meerdere jaren + legacy)
        if (!foundDoc) {
          try {
            const currentYear = new Date().getFullYear();
            for (let year = currentYear; year >= currentYear - 4; year--) {
              const archiveRef = collection(db, getPathString(getArchiveItemsPath(year)));
              const archiveSnap = await getDocs(query(archiveRef, where('lotNumber', '==', searchStr), limit(1)));
              if (!archiveSnap.empty) {
                foundDoc = { id: archiveSnap.docs[0].id, ...(archiveSnap.docs[0].data() as AnyRecord) };
                break;
              }
            }
          } catch (e) { console.warn(e); }
          
          if (!foundDoc) {
              try {
                  const archiveRef = collection(db, getPathString(PATHS.PRODUCTION_ARCHIVE as string[]));
                  const archiveSnap = await getDocs(query(archiveRef, where('lotNumber', '==', searchStr), limit(1)));
                  if (!archiveSnap.empty) foundDoc = { id: archiveSnap.docs[0].id, ...(archiveSnap.docs[0].data() as AnyRecord) };
              } catch (e) { console.warn(e); }
          }
      }

      // 3. Fallback: Zoek in orders via collectionGroup (Voor als een ordernummer gescand wordt ipv lotnummer)
      if (!foundDoc) {
        try {
          const orderQueries = [
            getDocs(query(collectionGroup(db, 'orders'), where('orderId', '==', searchStr), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('orderNumber', '==', searchStr), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('Order', '==', searchStr), limit(1)))
          ];
          const snaps = await Promise.all(orderQueries.map(p => p.catch(() => null)));
          for (const snap of snaps) {
            if (snap && !snap.empty) {
              foundDoc = { id: snap.docs[0].id, ...(snap.docs[0].data() as AnyRecord) };
              break;
            }
          }
        } catch (e) { console.warn(e); }
      }

      // 4. Fallback: Direct Document ID Lookup (Voor legacy paden zoals BH18 waar ID = N20025243 is)
      if (!foundDoc) {
        const targetedPaths = [
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
          getPathString(PATHS.TEMP_PLANNING),
          getPathString(PATHS.PLANNING),
          getPathString(PATHS.TRACKING)
        ];
        for (const path of targetedPaths) {
          try {
            const docRef = doc(db, path, searchStr);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              foundDoc = { id: docSnap.id, ...(docSnap.data() as AnyRecord) };
              break;
            }
          } catch (e) { console.warn(e); }
        }
      }

      if (foundDoc) {
        setProductData(foundDoc);
        showSuccess(`Gevonden: ${foundDoc.orderId || foundDoc.lotNumber || foundDoc.id}`);
      } else {
        setError(`Order of Lotnummer '${searchStr}' niet gevonden.`);
        showError(`Order of Lotnummer '${searchStr}' niet gevonden.`);
      }
    } catch (err) {
      console.error("Fout bij zoeken:", err);
      setError("Er is een fout opgetreden bij het zoeken.");
      const message = err instanceof Error ? err.message : String(err);
      showError("Zoekfout: " + message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTempLegacyPrint = async (orderData: AnyRecord, templateId: string, quantity = 1) => {
    const template = labelTemplates.find((t: LabelTemplate) => t.id === templateId);
    const templateChain = template
      ? (resolveLinkedTemplateChain(labelTemplates as any[], template.id, { maxDepth: 4 }) as LabelTemplate[])
      : [];
    const templatesToPrint = templateChain.length > 0 ? templateChain : (template ? [template] : []);
    const dpi = printerDpi;
    const bitmapDarkness = Math.max(15, Number(printerDarkness) || 15);

    const order = getOrderLabelOrder(orderData);
    const item = getOrderLabelItemCode(orderData);
    const desc = getOrderLabelDescription(orderData);
    const printQuantity = Math.max(1, Number(quantity) || 1);

    let zpl;

    if (template) {
        const labelData = processLabelData({
            ...orderData,
            orderId: order,
            orderNumber: order,
            itemCode: item,
            productId: item,
            item: desc,
            description: desc,
            lotNumber: orderData.lotNumber || order
        });
        const processedData = applyLabelLogic(labelData, labelRules);
        const zplChunks: string[] = [];

        for (const currentTemplate of templatesToPrint) {
          const widthMm = Number((currentTemplate as any)?.width) || 90;
          const heightMm = Number((currentTemplate as any)?.height) || 40;
          const rendered = await renderLabelToBitmapZpl({
            template: currentTemplate as any,
            data: processedData as AnyRecord,
            printerDpi: dpi,
            darkness: bitmapDarkness,
            printSpeed: 3,
            widthMm,
            heightMm,
          });
          zplChunks.push(rendered);
        }

        zpl = zplChunks.join('\n');
    } else {
      const fallbackTemplate = {
        width: 90,
        height: 40,
        elements: [
          { type: 'text', x: 5, y: 4, width: 52, height: 8, fontSize: 12, isBold: true, content: 'Order: {orderNumber}' },
          { type: 'text', x: 5, y: 14, width: 52, height: 7, fontSize: 9, isBold: true, content: 'Item: {itemCode}' },
          { type: 'text', x: 5, y: 23, width: 52, height: 10, fontSize: 8, isBold: true, maxLines: 2, content: '{description}' },
          { type: 'qr', x: 60, y: 5, width: 25, height: 25, content: '{orderNumber}' },
        ],
      };
      zpl = await renderLabelToBitmapZpl({
        template: fallbackTemplate as any,
        data: {
          orderNumber: order,
          itemCode: item,
          description: String(desc || '').substring(0, 80),
        },
        printerDpi: dpi,
        darkness: bitmapDarkness,
        printSpeed: 3,
        widthMm: 90,
        heightMm: 40,
      });
    }

    try {
      let deviceToUse = usbDevice;
      if (!deviceToUse) {
        try {
          deviceToUse = await navigator.usb.requestDevice({ filters: [] });
          setUsbDevice(deviceToUse);
          localStorage.setItem(USB_PRINTER_VENDOR_KEY, String(deviceToUse.vendorId));
          localStorage.setItem(USB_PRINTER_PRODUCT_KEY, String(deviceToUse.productId));

          const routingPrinter = resolvePrinterForRouting(printers, {
            stationId: selectedStation,
            routeKey: selectedStation,
          });
          const usbMatches = printers.filter(
            (printer) => Number(printer.vendorId) === deviceToUse?.vendorId && Number(printer.productId) === deviceToUse?.productId
          );
          const printerIdToStore = routingPrinter?.id || (usbMatches.length === 1 ? usbMatches[0].id : '');
          if (printerIdToStore) {
            persistStationBinding(selectedStation, printerIdToStore);
          }
        } catch (usbErr) {
          if (!activeQueuePrinter?.id) {
            throw usbErr;
          }
        }
      }

      if (deviceToUse) {
        const usbPayload = printQuantity > 1
          ? Array.from({ length: printQuantity }, () => zpl).join('\n')
          : zpl;
        await printRawUsb(deviceToUse, usbPayload, `Order label geprint voor order: ${order}`);
        const labelsPrinted = Math.max(1, (templatesToPrint.length || 1) * printQuantity);
        showSuccess(`${labelsPrinted} label(s) voor ${order} direct geprint via USB!`);
        setShowTempModal(false);
        return;
      }

      if (!activeQueuePrinter?.id) {
        throw new Error('Geen USB-printer gekoppeld en geen wachtrijprinter geconfigureerd.');
      }

      await queuePrintJob(
        activeQueuePrinter.id,
        zpl,
        {
          description: `Order label voor ${order}`,
          quantity: printQuantity,
          orderId: order,
          lotNumber: String(orderData.lotNumber || order),
          stationId: selectedStation || 'PRINT_STATION',
          targetPrinterName: activeQueuePrinter.name,
          source: 'temp_order_labels',
          queuedAsBatch: templatesToPrint.length > 1,
          templateId: template?.id || null,
          variables: {
            orderNumber: order,
            itemCode: item,
            description: desc,
          },
        }
      );

      showSuccess(`Orderlabel in wachtrij gezet voor ${String(activeQueuePrinter.name || activeQueuePrinter.id)}.`);
      setShowTempModal(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showError("Print Fout: " + message);
    }
  };

  const handlePrint = async () => {
    if (!selectedLabel || !productData) {
      showError("Selecteer een product en een label voordat u print.");
      return;
    }
    setIsLoading(true);
    try {
      const bitmapDarkness = Math.max(15, Number(printerDarkness) || 15);
      const templateChain = resolveLinkedTemplateChain(labelTemplates as any[], (selectedLabel as any)?.id, { maxDepth: 4 }) as LabelTemplate[];
      const templatesToPrint = templateChain.length > 0 ? templateChain : [selectedLabel as LabelTemplate];

      const printDataChunks: string[] = [];
      for (const template of templatesToPrint) {
        const widthMm = Number((template as any)?.width) || 90;
        const heightMm = Number((template as any)?.height) || 40;
        const printData = await renderLabelToBitmapZpl({
          template: template as any,
          data: (previewData as AnyRecord) || {},
          printerDpi,
          darkness: bitmapDarkness,
          printSpeed: 3,
          widthMm,
          heightMm,
        });
        printDataChunks.push(printData);
      }
      
      let deviceToUse = usbDevice;
      if (!deviceToUse) {
        deviceToUse = await navigator.usb.requestDevice({ filters: [] });
        setUsbDevice(deviceToUse);
        localStorage.setItem(USB_PRINTER_VENDOR_KEY, String(deviceToUse.vendorId));
        localStorage.setItem(USB_PRINTER_PRODUCT_KEY, String(deviceToUse.productId));

        const routingPrinter = resolvePrinterForRouting(printers, {
          stationId: selectedStation,
          routeKey: selectedStation,
        });
        const usbMatches = printers.filter(
          (printer) => Number(printer.vendorId) === deviceToUse?.vendorId && Number(printer.productId) === deviceToUse?.productId
        );
        const printerIdToStore = routingPrinter?.id || (usbMatches.length === 1 ? usbMatches[0].id : '');
        if (printerIdToStore) {
          persistStationBinding(selectedStation, printerIdToStore);
        }
      }

  await printRawUsb(deviceToUse, printDataChunks.join('\n'), `Batch order labels geprint voor lot: ${productData.lotNumber}`);
  showSuccess(`${templatesToPrint.length} label(s) voor lot ${productData.lotNumber} direct geprint via USB!`);
      
      setProductData(null);
      setLotNumber('');
    } catch (err) {
      console.error("Fout bij direct printen:", err);
      const message = err instanceof Error ? err.message : String(err);
      showError("Print Fout: " + message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectLotPrintBatch = async (batchData: string, lotCount: number) => {
    let deviceToUse = usbDevice;
    if (!deviceToUse) {
      deviceToUse = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(deviceToUse);
      localStorage.setItem(USB_PRINTER_VENDOR_KEY, String(deviceToUse.vendorId));
      localStorage.setItem(USB_PRINTER_PRODUCT_KEY, String(deviceToUse.productId));

      const routingPrinter = resolvePrinterForRouting(printers, {
        stationId: selectedStation,
        routeKey: selectedStation,
      });
      const usbMatches = printers.filter(
        (printer) => Number(printer.vendorId) === deviceToUse?.vendorId && Number(printer.productId) === deviceToUse?.productId
      );
      const printerIdToStore = routingPrinter?.id || (usbMatches.length === 1 ? usbMatches[0].id : '');
      if (printerIdToStore) {
        persistStationBinding(selectedStation, printerIdToStore);
      }
    }

    await printRawUsb(deviceToUse, batchData, `Auto-print batch labels geprint (Aantal: ${lotCount})`);
    showSuccess(`${lotCount} lotnummer(s) direct geprint via USB!`);
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Printer className="text-slate-800" size={32} />
            <h1 className="text-3xl font-bold text-slate-800">{t('printStationView.centralPrintStation', 'Centraal Printstation')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowStationWizard(true)}
              className="bg-white text-slate-700 px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 border-2 border-slate-200 hover:border-blue-300 transition-all shadow-sm w-fit"
            >
              <Settings2 size={16} /> {t('printStationView.printerWizardTitle', 'Print Station Wizard')}
            </button>
            {('usb' in navigator) && (
              <button 
                onClick={handleConnectUsb}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider transition-all shadow-sm border-2 ${
                  usbDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                <Usb size={16} className={usbDevice ? "text-green-500" : ""} />
                <span className="hidden sm:inline">{usbDevice ? `USB: ${usbDevice.productName}` : t('printStationView.connectUsbPrinter', 'Koppel USB Printer')}</span>
              </button>
            )}
            <button
              onClick={() => setShowLotModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm w-fit"
            >
              <Printer size={16} /> Lotnummers
            </button>
            <button
              onClick={() => setShowTempModal(true)}
              className="bg-amber-500 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-amber-600 transition-all shadow-sm w-fit"
            >
              <Tag size={16} /> {t('printStationView.orderLabels', 'Order Labels')}
            </button>
          </div>
        </div>
        
        <p className="text-slate-600 mb-8">{t('printStationView.scanOrTypeLotForPrint', 'Scan of typ een lotnummer om een label te (her)printen. De printopdracht wordt naar de centrale printer bij BH18 gestuurd.')}</p>

        <div className="mb-8 bg-white border-2 border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              {t('printStationView.stationPrinterMappings', 'Station naar printer koppelingen')}
            </p>
            <p className="text-[11px] font-bold text-slate-400">
              {t('printStationView.stationPrinterMappingsHint', 'Beheer via Print Station Wizard')}
            </p>
          </div>

          {stationBindingSummary.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {stationBindingSummary.map((row) => (
                <div
                  key={row.station}
                  className={`rounded-xl border px-3 py-2 ${row.isSelected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
                >
                  <p className="text-xs font-black uppercase tracking-wider text-slate-600">{row.station}</p>
                  <p className="text-sm font-bold text-slate-800">{row.printerName || t('printStationView.noPrinterBound', 'Geen printer gekoppeld')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('printStationView.noMappingsYet', 'Nog geen station-koppelingen gevonden.')}</p>
          )}
        </div>

        <form onSubmit={handleLotNumberSearch} className="flex gap-2 mb-8">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value.toUpperCase())}
              placeholder={t("placeholders.scanOrTypeLot", "Scan of typ lotnummer...")}
              className="w-full p-3 pl-10 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>
          <button type="submit" disabled={isLoading || !lotNumber} className="bg-slate-800 text-white px-6 py-3 rounded-lg font-semibold hover:bg-slate-700 disabled:bg-slate-400 flex items-center gap-2">
            {isLoading ? <Loader2 className="animate-spin" /> : <Search size={20} />}
            <span>{t('common.search', 'Zoek')}</span>
          </button>
        </form>

        {error && <div className="text-red-600 bg-red-100 p-4 rounded-lg mb-8">{error}</div>}

        {productData && (
          <div className="bg-white p-6 rounded-lg shadow-md animate-in fade-in">
            <h2 className="text-2xl font-bold mb-4">{t('printStationView.productFound', 'Product Gevonden')}: {String(productData.lotNumber || '')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p><strong>{t('common.order', 'Order')}:</strong> {String(productData.orderId || '')}</p>
                <p><strong>{t('common.article', 'Artikel')}:</strong> {String(productData.itemCode || '')}</p>
                <p><strong>{t('common.description', 'Omschrijving')}:</strong> {String(productData.item || '')}</p>
                
                <div className="mt-4">
                  <label htmlFor="label-select" className="block text-sm font-medium text-slate-700 mb-1">{t('printStationView.chooseLabelTemplate', 'Kies Label Template')}</label>
                  <select
                    id="label-select"
                    value={selectedLabelId}
                    onChange={(e) => setSelectedLabelId(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md"
                  >
                    {(filteredLabels as AnyRecord[]).map((l) => <option key={String(l.id)} value={String(l.id)}>{String(l.name || l.id)} ({String(l.width || '-')}x{String(l.height || '-')}mm)</option>)}
                  </select>
                </div>

                <button onClick={handlePrint} disabled={isLoading} className="mt-6 w-full bg-blue-600 text-white px-6 py-4 rounded-lg font-bold text-lg hover:bg-blue-500 disabled:bg-blue-300 flex items-center justify-center gap-3">
                  {isLoading ? <Loader2 className="animate-spin" /> : <Send size={24} />}
                  <span>{t('printStationView.sendToPrinter', 'Stuur naar Printer')}</span>
                </button>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <h3 className="text-white font-bold mb-2">{t('printStationView.labelPreview', 'Label Preview')}</h3>
                <div ref={previewRef}>
                  {selectedPreviewTemplates.length > 0 ? (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                      {selectedPreviewTemplates.map((template: LabelTemplate, idx: number) => (
                        <div key={String(template.id || idx)} className="bg-slate-700/40 border border-slate-600 rounded-lg p-2">
                          {selectedPreviewTemplates.length > 1 && (
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-1">
                              {t('printStationView.labelStep', 'Label {{index}}', { index: idx + 1 })}
                            </p>
                          )}
                          <AutoScaledLabelPreview label={template as any} data={previewData} className="mx-auto" printerDpi={printerDpi} maxScale={1} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400">{t('printStationView.selectALabel', 'Selecteer een label')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {showTempModal && (
          <TempLabelModal onClose={() => setShowTempModal(false)} onPrint={handleTempLegacyPrint} labelTemplates={labelTemplates} labelRules={labelRules} printerDpi={printerDpi} departmentGroups={departmentGroups} stationId={selectedStation} />
        )}
        {showLotModal && (
          <LotPrintModal onClose={() => setShowLotModal(false)} departmentGroups={departmentGroups} onPrintBatch={handleDirectLotPrintBatch} printer={activeQueuePrinter} />
        )}
        {showStationWizard && (
          <PrintStationWizardModal
            onClose={() => setShowStationWizard(false)}
            stations={allFactoryStations}
            printers={printers}
            selectedStation={selectedStation}
            stationBindings={stationBindings}
            onSave={handleSaveStationBinding}
          />
        )}
      </div>
    </div>
  );
};

export default PrintStationView;
