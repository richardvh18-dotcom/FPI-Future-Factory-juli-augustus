import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, X, Search, Tag } from 'lucide-react';
import { AnyRecord, LabelTemplate, PrinterConfig, TempLabelItemProps, TempLabelModalProps, DepartmentGroup } from '../printQueue.types';
import { useNotifications } from '../../../contexts/NotificationContext';
import { useLabelCatalog } from '../../../hooks/useLabelCatalog';
import { 
  ORDER_LABELS_PAGE_SIZE, ORDER_LABELS_LIST_MIN_HEIGHT, SCOPED_ORDERS_FALLBACK_LIMIT,
  normalizeStationKey, isUsbDirectSupported, printRawUsb, enforceCutModeOnBatchPayload
} from '../printQueueHelpers';
import { filterOrderLabelsByProduct, processLabelData, applyLabelLogic, getCompactPrintVariables } from '../../../utils/labelHelpers';
import { buildOrderLabelTemplateProduct, pickPreferredTempTemplateId, getOrderLabelDescription, getOrderLabelItemCode, getOrderLabelOrder, resolveLinkedTemplateChain, isOrderLabelFlangeProduct, hasOrderLabelCode, normalizeOrderLabelProductData , buildOrderLabelPreviewData } from '../../../utils/orderLabelTemplateUtils';
import AutoScaledLabelPreview from '../AutoScaledLabelPreview';
import { collection, collectionGroup, documentId, query, where, getDocs, limit, orderBy, startAfter } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { PATHS, getPathString } from '../../../config/dbPaths';
import { loadFactoryMachinePaths } from '../../../utils/orderLabelSearch';
import { shouldResetOrderLabelMachineState } from '../../../utils/orderLabelMachineState';
import { resolvePrinterDpi } from '../../../utils/printerDrivers';
import { renderLabelToBitmapZpl } from '../../../utils/zebraLabelRenderEngine';
import { buildProtocolAwareUsbPayload, renderLabelForPrinter } from '../../../utils/printerProtocolService';
import { queuePrintJob } from '../../../services/planningSecurityService';
import { LABELS_PRINTING_QUEUE_STATION, resolvePrintTransport } from '../../../services/printRouting';
import { isPrinterOnline } from '../../../utils/printerStatus';

const TempLabelItem = ({ item, labelTemplates, labelRules, printerDpi = 203, handleTempLegacyPrint }: TempLabelItemProps) => {
  const { t } = useTranslation();
  const itemDisplay = getOrderLabelDescription(item) || getOrderLabelItemCode(item);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const topOptions = useMemo(() => {
    return filterOrderLabelsByProduct(labelTemplates || [], buildOrderLabelTemplateProduct(item)) as LabelTemplate[];
  }, [item, labelTemplates]);

  useEffect(() => {
    if (topOptions.length > 0) {
      const isValidSelection = topOptions.some((t) => String(t.id) === selectedTemplateId);
      if (!selectedTemplateId || !isValidSelection) {
        setSelectedTemplateId(pickPreferredTempTemplateId(item, topOptions as any[]));
      }
    } else if (selectedTemplateId) {
      setSelectedTemplateId("");
    }
  }, [topOptions, selectedTemplateId]);

  const selectedTemplate = topOptions.find((t) => String(t.id) === selectedTemplateId) || topOptions[0];
  const previewTemplates = selectedTemplate ? [selectedTemplate] : [];

  const previewData = useMemo(() => {
    return buildOrderLabelPreviewData(item, labelRules);
  }, [item, labelRules]);

  return (
    <div className="w-full p-4 bg-white border border-slate-200 hover:border-amber-300 rounded-2xl transition-all">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-800 truncate">{getOrderLabelOrder(item)}</p>
          <p className="text-xs font-bold text-slate-500 truncate">{itemDisplay}</p>
          <div className="mt-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t("common.template", "Template")}</label>
            {topOptions.length > 0 ? (
              <select
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {topOptions.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>{String(t.name || t.id)}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs italic text-amber-600">{t("printer.noMatchingTemporaryTemplate", "Geen passende tijdelijke template gevonden.")}</p>
            )}
          </div>
          <button
            onClick={() => handleTempLegacyPrint(item, selectedTemplate, previewData)}
            disabled={!selectedTemplate || topOptions.length === 0}
            className="mt-3 px-3 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-amber-600 disabled:opacity-50"
          >
            {t("common.print", "Print")}
          </button>
        </div>
        <div className="w-full lg:w-64 h-56 bg-white border border-slate-200 rounded-xl p-2 overflow-y-auto">
          {previewTemplates.length > 0 ? (
            <div className="space-y-2">
              {previewTemplates.map((template, idx) => (
                <div key={String(template.id || idx)} className="bg-slate-50 border border-slate-200 rounded-lg p-1">
                  {previewTemplates.length > 1 && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1 pb-1">
                      {t("printer.labelStep", "Label {{index}}", { index: idx + 1 })}
                    </p>
                  )}
                  <AutoScaledLabelPreview label={template as any} data={previewData} maxScale={1} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">{t("printer.noPreview", "Geen preview")}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Modal: Tijdelijke Labels Zoeken ---
const TempLabelModal = ({ onClose, labelTemplates = [], labelRules = [], printerDpi = 203, usbDevice, setUsbDevice, activeQueuePrinter, requestLabelsQueuePrinter, selectedStation, departmentGroups = [], printers = [] }: TempLabelModalProps) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  




  // Printfunctie nu binnen de modal zodat t altijd beschikbaar is
  const handleTempLegacyPrint = async (orderData: AnyRecord, template: any, processedData: any, quantity = 1) => {
    const chosenPrinter = await requestLabelsQueuePrinter('Order Labels printen');
    if (!chosenPrinter?.id) {
      throw new Error('Geen Labels Printing printer geselecteerd.');
    }

    const dpi = printerDpi;
    const darkness = 15; // of printerDarkness als beschikbaar

    const order = getOrderLabelOrder(orderData);
    const item = getOrderLabelItemCode(orderData);
    const desc = getOrderLabelDescription(orderData);

    let zpl;
    const printQuantity = Math.max(1, Number(quantity) || 1);
    const templatesToPrint = template ? [template as LabelTemplate] : [];

    if (template) {
      try {
        const zplChunks: string[] = [];
        for (const currentTemplate of templatesToPrint) {
          const widthMm = Number((currentTemplate as any)?.width || 90);
          const heightMm = Number((currentTemplate as any)?.height || 40);
          const rendered = await renderLabelForPrinter({
            printer: chosenPrinter as Record<string, unknown>,
            template: currentTemplate as any,
            data: processedData as AnyRecord,
            printerDpi: dpi,
            darkness,
            printSpeed: 3,
            widthMm,
            heightMm,
          });
          zplChunks.push(rendered);
        }
        zpl = zplChunks.join('\n');
      } catch (bitmapErr) {
        throw new Error(`Bitmap print mislukt: ${bitmapErr instanceof Error ? bitmapErr.message : String(bitmapErr)}`);
      }
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
      zpl = await renderLabelForPrinter({
        printer: chosenPrinter as Record<string, unknown>,
        template: fallbackTemplate as any,
        data: {
          orderNumber: order,
          itemCode: item,
          description: String(desc || '').substring(0, 80),
        },
        printerDpi: dpi,
        darkness,
        printSpeed: 3,
        widthMm: 90,
        heightMm: 40,
      });
    }

    try {
      if (chosenPrinter?.id) {
        await queuePrintJob(
          chosenPrinter.id,
          zpl,
          {
            description: `Order label voor ${order}`,
            quantity: printQuantity,
            orderId: order,
            lotNumber: orderData.lotNumber || order,
            stationId: LABELS_PRINTING_QUEUE_STATION,
            targetPrinterName: chosenPrinter.name,
            width: parseInt(String(template?.width || 90), 10),
            height: parseInt(String(template?.height || 40), 10),
            renderMode: 'bitmap',
            variables: template ? getCompactPrintVariables(processedData as Record<string, unknown>) : {
              orderNumber: order,
              productId: item,
              description: desc,
            },
            templateId: template?.id || null,
            source: 'temp_order_labels'
          }
        );
        notify(t("common.printLabelQueued", { order, printer: chosenPrinter.name }));
        return;
      }

      throw new Error('Geen directe USB printer gekoppeld en geen wachtrijprinter geconfigureerd.');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      notify(t("common.printErrorMessage", { message }));
    }
  };
  const [orderStr, setOrderStr] = useState("");
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [machineItems, setMachineItems] = useState<AnyRecord[]>([]);
  const [loadingMachineItems, setLoadingMachineItems] = useState(false);
  const [loadingMoreMachineItems, setLoadingMoreMachineItems] = useState(false);
  const [searchItems, setSearchItems] = useState<AnyRecord[]>([]);
  const [loadingSearchItems, setLoadingSearchItems] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [printCount, setPrintCount] = useState<string>("1");
  const [isSubmittingPrint, setIsSubmittingPrint] = useState(false);
  const [hasMoreMachineItems, setHasMoreMachineItems] = useState(false);
  const machineCursorRef = useRef<Record<string, unknown>>({});
  const machineListRef = useRef<HTMLDivElement>(null);
  const previousMachineRef = useRef<string>("");
  const machineItemsRef = useRef<AnyRecord[]>([]);
  const machineRequestRef = useRef(0);
  const normalizeText = useCallback((value: unknown) => String(value || "").toLowerCase().trim(), []);

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
    if (!selectedMachine) {
      setMachineItems([]);
      setSearchItems([]);
      setSelectedOrderId("");
      setSelectedTemplateId("");
      setHasMoreMachineItems(false);
      machineCursorRef.current = {};
      previousMachineRef.current = "";
      machineItemsRef.current = [];
      return;
    }

    if (shouldResetOrderLabelMachineState(previousMachineRef.current, selectedMachine)) {
      setMachineItems([]);
      setSearchItems([]);
      setSelectedOrderId("");
      setSelectedTemplateId("");
      setHasMoreMachineItems(false);
      machineCursorRef.current = {};
      machineItemsRef.current = [];
    }

    previousMachineRef.current = selectedMachine;
  }, [selectedMachine]);

  const buildMachineFetchTargets = useCallback(async (machineValue: string) => {
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

    return fetchTargets;
  }, [normalizeMachineKey]);

  const loadMachineOrders = useCallback(async (machineValue: string, append = false, requestId?: number) => {
    if (!machineValue) {
      setMachineItems([]);
      setSearchItems([]);
      setHasMoreMachineItems(false);
      machineCursorRef.current = {};
      machineItemsRef.current = [];
      return;
    }

    const activeRequestId = requestId ?? ++machineRequestRef.current;
    if (requestId !== undefined) {
      machineRequestRef.current = activeRequestId;
    }

    if (append) {
      setLoadingMoreMachineItems(true);
    } else {
      setLoadingMachineItems(true);
      machineCursorRef.current = {};
    }

    try {
      const fetchTargets = await buildMachineFetchTargets(machineValue);
      const cursorByTarget = append ? machineCursorRef.current : {};
      const fetches = fetchTargets.map(async ({ productType, machine }) => {
        const machinePath = `${getPathString(PATHS.PLANNING)}/${productType}/machines/${machine}/orders`;
        const cursorKey = `${productType}/${machine}`;
        const lastCursor = cursorByTarget[cursorKey];
        const baseQuery = query(collection(db, machinePath), limit(ORDER_LABELS_PAGE_SIZE));
        const queryWithCursor = lastCursor ? query(baseQuery, startAfter(lastCursor as never)) : baseQuery;
        try {
          const snap = await getDocs(queryWithCursor);
          return {
            rows: snap.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as AnyRecord),
              __machine: machine,
              __productType: productType,
            })),
            lastDoc: snap.docs[snap.docs.length - 1] ?? null,
            cursorKey,
            hasMore: snap.docs.length === ORDER_LABELS_PAGE_SIZE,
          };
        } catch {
          return { rows: [] as AnyRecord[], lastDoc: null, cursorKey, hasMore: false };
        }
      });

      let rows = (await Promise.all(fetches)).flatMap((entry) => entry.rows);
      let hasMore = (await Promise.all(fetches)).some((entry) => entry.hasMore);

      if (rows.length === 0) {
        const machineMarkers = Array.from(new Set(fetchTargets.map((target) => `/machines/${target.machine}/orders/`)));
        try {
          const scopedSnap = await getDocs(query(collectionGroup(db, 'orders'), limit(SCOPED_ORDERS_FALLBACK_LIMIT)));
          rows = scopedSnap.docs
            .filter((docSnap) => {
              const refPath = String(docSnap.ref?.path || '');
              return machineMarkers.some((marker) => refPath.includes(marker));
            })
            .map((docSnap) => {
              const refPath = String(docSnap.ref?.path || '');
              const machineMatch = refPath.match(/\/machines\/([^/]+)\/orders\//i);
              return {
                id: docSnap.id,
                ...(docSnap.data() as AnyRecord),
                __machine: machineMatch?.[1] || undefined,
              };
            });
          hasMore = false;
        } catch {
          hasMore = false;
        }
      }

      if (machineRequestRef.current !== activeRequestId) return;

      const byId = new Map<string, AnyRecord>();
      const currentItems = [...machineItemsRef.current, ...rows].filter((row) => !!row);
      currentItems.forEach((row) => {
        const rowId = String(row.id || "").trim();
        if (!rowId) return;
        byId.set(rowId, row);
      });

      const sorted = Array.from(byId.values())
        .filter((item: any) => !isOrderLabelFlangeProduct(item))
        .sort((a, b) => String(getOrderLabelOrder(a)).localeCompare(String(getOrderLabelOrder(b)), undefined, { numeric: true }));

      machineItemsRef.current = sorted;
      setMachineItems(sorted);
      setHasMoreMachineItems(hasMore);
      const nextCursors = Object.fromEntries((await Promise.all(fetches)).map((entry) => [entry.cursorKey, entry.lastDoc])) as Record<string, unknown>;
      machineCursorRef.current = nextCursors;
      setSelectedOrderId((prev) => {
        if (prev && sorted.some((row) => String(row.id) === prev)) return prev;
        return String(sorted[0]?.id || "");
      });
    } catch (err) {
      console.error("Fout bij laden machine-orders voor order labels:", err);
      setMachineItems([]);
      setSearchItems([]);
      setSelectedOrderId("");
    } finally {
      if (machineRequestRef.current === activeRequestId) {
        setLoadingMachineItems(false);
        setLoadingMoreMachineItems(false);
      }
    }
  }, [buildMachineFetchTargets]);

  useEffect(() => {
    if (!selectedMachine) return;
    const requestId = ++machineRequestRef.current;
    void loadMachineOrders(selectedMachine, false, requestId);
  }, [loadMachineOrders, selectedMachine]);

  useEffect(() => {
    const searchText = String(orderStr || "").trim().toUpperCase();
    if (searchText.length < 3) {
      setSearchItems([]);
      setLoadingSearchItems(false);
      return;
    }

    let active = true;

    const runSearch = async () => {
      setLoadingSearchItems(true);
      try {
        let rows: AnyRecord[] = [];
        let machineMarkers: string[] = [];

        if (selectedMachine) {
          const fetchTargets = await buildMachineFetchTargets(selectedMachine);
          machineMarkers = Array.from(new Set(fetchTargets.map((target) => `/machines/${target.machine}/orders/`)));
          const queries = fetchTargets.map(async ({ productType, machine }) => {
            const machinePath = `${getPathString(PATHS.PLANNING)}/${productType}/machines/${machine}/orders`;
            try {
              const snap = await getDocs(
                query(
                  collection(db, machinePath),
                  orderBy(documentId()),
                  where(documentId(), ">=", searchText),
                  where(documentId(), "<=", `${searchText}\uf8ff`),
                  limit(80)
                )
              );
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

          rows = (await Promise.all(queries)).flat();
        }

        // Fallback: zoek direct in alle scoped 'orders' collections en filter op machinepad indien machine gekozen.
        if (rows.length === 0 || !selectedMachine) {
          try {
            const { executeOrderLabelSearch } = await import('../../../utils/orderLabelSearch');
            const { results } = await executeOrderLabelSearch(searchText, machineItemsRef.current);

            const fallbackRows = results
              .filter((item: any) => {
                if (!selectedMachine) return true;
                const refPath = String(item.path || item._path || item.__path || '');
                // Try to infer from __machine if set, or just return true and let user see it anyway
                if (item.__machine && item.__machine !== selectedMachine) return false;
                return true; 
              });
              
            rows = selectedMachine ? fallbackRows : fallbackRows;
          } catch (err) {
            console.error("SEARCH_DEBUG: FALLBACK ERROR", err);
            // Silence fallback failures; list stays empty.
          }
        }

        const byId = new Map<string, AnyRecord>();
        rows.forEach((row) => {
          const rowId = String(row.id || "").trim();
          if (!rowId) return;
          byId.set(rowId, row);
        });

        const results = Array.from(byId.values())
          .filter((item: any) => !isOrderLabelFlangeProduct(item))
          .sort((a, b) =>
          String(getOrderLabelOrder(a)).localeCompare(String(getOrderLabelOrder(b)), undefined, { numeric: true })
        );

        if (active) {
          setSearchItems(results);
          if (results.length > 0) {
            setSelectedOrderId((prev) => {
              if (prev && results.some((row) => String(row.id) === prev)) return prev;
              return String(results[0].id || "");
            });
          }
        }
      } finally {
        if (active) setLoadingSearchItems(false);
      }
    };

    void runSearch();

    return () => {
      active = false;
    };
  }, [buildMachineFetchTargets, orderStr, selectedMachine]);

  const handleMachineListScroll = useCallback(() => {
    const container = machineListRef.current;
    if (!container || !selectedMachine || loadingMachineItems || loadingMoreMachineItems || !hasMoreMachineItems) return;

    const distanceToBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    const reachedBottom = distanceToBottom <= 48;

    if (reachedBottom) {
      void loadMachineOrders(selectedMachine, true);
    }
  }, [hasMoreMachineItems, loadMachineOrders, loadingMachineItems, loadingMoreMachineItems, selectedMachine]);

  const filteredMachineItems = useMemo(() => {
    const queryText = normalizeText(orderStr);
    if (!queryText) return machineItems;

    return machineItems.filter((item: any) => {
      const orderText = normalizeText(getOrderLabelOrder(item));
      const productText = normalizeText(getOrderLabelDescription(item) || getOrderLabelItemCode(item));
      return orderText.includes(queryText) || productText.includes(queryText);
    });
  }, [machineItems, orderStr]);

  const displayItems = useMemo(() => {
    const hasSearch = String(orderStr || "").trim().length >= 3;
    if (!hasSearch) return filteredMachineItems;
    return searchItems.length > 0 ? searchItems : filteredMachineItems;
  }, [filteredMachineItems, orderStr, searchItems]);

  const searchQuery = String(orderStr || "").trim();
  const searchActive = searchQuery.length >= 3;
  const showInitialMachineLoader = loadingMachineItems && machineItems.length === 0 && !searchActive;
  const showSearchBusyState = searchActive && loadingSearchItems && displayItems.length === 0;

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return displayItems.find((item: any) => String(item.id || "") === selectedOrderId)
      || machineItems.find((item: any) => String(item.id || "") === selectedOrderId)
      || null;
  }, [displayItems, machineItems, selectedOrderId]);

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
    if (!selectedOrder) return {} as AnyRecord;
    return buildOrderLabelPreviewData(selectedOrder, labelRules);
  }, [labelRules, selectedOrder]);

  const previewTemplates = useMemo(() => {
    if (!selectedTemplate) return [] as LabelTemplate[];
    const chain = resolveLinkedTemplateChain(labelTemplates as any[], selectedTemplate.id, { maxDepth: 4 }) as LabelTemplate[];
    return chain.length > 0 ? chain : [selectedTemplate];
  }, [labelTemplates, selectedTemplate]);

  const handlePrintSelected = async () => {
    if (!selectedOrder || !selectedTemplate || isSubmittingPrint) return;

    setIsSubmittingPrint(true);
    try {
      const processedData = buildOrderLabelPreviewData(selectedOrder, labelRules);
      const qty = Math.max(1, Math.min(100, Number.parseInt(printCount, 10) || 1));
      await handleTempLegacyPrint(selectedOrder, selectedTemplate, processedData, qty);
    } finally {
      setIsSubmittingPrint(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-[1200px] rounded-[36px] shadow-2xl overflow-hidden border border-slate-100">
        <div className="p-8 md:p-10 flex flex-col h-full max-h-[92vh]">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
                <Tag size={24} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase italic leading-none">{t("printer.orderLabels", "Order Labels")}</h3>
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
                    <option value="">{t('common.selectMachine', 'Kies machine')}</option>
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
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-300"
                    value={orderStr}
                    onChange={(e) => setOrderStr(e.target.value)}
                  />
                </div>
              </div>

              <div
                ref={machineListRef}
                className={`mt-4 flex-1 min-h-0 overflow-y-auto bg-white border border-slate-200 rounded-xl ${ORDER_LABELS_LIST_MIN_HEIGHT}`}
                onScroll={handleMachineListScroll}
              >
                {showInitialMachineLoader ? (
                  <div className={`h-full ${ORDER_LABELS_LIST_MIN_HEIGHT} flex items-center justify-center text-slate-400 gap-2`}>
                    <Loader2 className="animate-spin" size={18} /> {t('common.loadingList', 'Lijst laden...')}
                  </div>
                ) : !selectedMachine && !searchActive ? (
                  <div className={`h-full ${ORDER_LABELS_LIST_MIN_HEIGHT} flex items-center justify-center text-center text-slate-400 p-6`}>
                    {t('printStationView.selectMachineFirst', 'Kies een machine of zoek direct op ordernummer.')}
                  </div>
                ) : showSearchBusyState ? (
                  <div className={`h-full ${ORDER_LABELS_LIST_MIN_HEIGHT} flex items-center justify-center text-center text-slate-400 p-6`}>
                    {t('printer.searchingOrders', 'Zoeken in orders...')}
                  </div>
                ) : displayItems.length === 0 ? (
                  <div className={`h-full ${ORDER_LABELS_LIST_MIN_HEIGHT} flex items-center justify-center text-center text-slate-400 p-6`}>
                    {t('printStationView.noLabelsFound', 'Geen labels gevonden')}
                  </div>
                ) : (
                  <div className={`divide-y divide-slate-100 ${ORDER_LABELS_LIST_MIN_HEIGHT}`}>
                    {displayItems.map((item: any) => {
                      const itemId = String(item.id || '');
                      const selected = itemId === selectedOrderId;
                      return (
                        <button
                          key={itemId}
                          type="button"
                          onClick={() => setSelectedOrderId(itemId)}
                          className={`w-full text-left px-3 py-2.5 transition-colors ${selected ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                        >
                          <p className="text-sm font-black text-slate-800 truncate">{getOrderLabelOrder(item)}</p>
                          <p className="text-sm font-black text-slate-800 truncate">{getOrderLabelDescription(item) || getOrderLabelItemCode(item)}</p>
                        </button>
                      );
                    })}
                    {hasMoreMachineItems && (
                      <div className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {loadingMoreMachineItems ? 'Meer laden...' : 'Scroll voor meer orders'}
                      </div>
                    )}
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
                        {temporaryTemplates.length === 0 && <option value="">{t('printer.noMatchingTemporaryTemplate', 'Geen tijdelijke labels beschikbaar')}</option>}
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
                                {t('printer.labelStep', 'Label {{index}}', { index: idx + 1 })}
                              </p>
                            )}
                            <AutoScaledLabelPreview label={template as any} data={previewData} maxScale={1.5} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                        {t('printer.noPreview', 'Geen preview')}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handlePrintSelected}
                    aria-busy={isSubmittingPrint}
                    disabled={!selectedTemplate || temporaryTemplates.length === 0 || isSubmittingPrint}
                    className={`mt-3 w-full px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 flex items-center justify-center gap-2 ${isSubmittingPrint ? 'bg-amber-600 text-white shadow-lg ring-4 ring-amber-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    {isSubmittingPrint ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        <span>{t('printer.sendingPrintJob', 'Versturen...')}</span>
                      </>
                    ) : (
                      <>{t('common.print', 'Print')}</>
                    )}
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

// --- Modal: Lotnummers Printen ---
export default TempLabelModal;
export { TempLabelItem };