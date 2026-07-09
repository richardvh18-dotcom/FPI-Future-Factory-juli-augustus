/* eslint-disable */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Layers, Calendar, History, Package, ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, Printer, X, Download, ScanBarcode, Keyboard, AlertTriangle } from "lucide-react";
import { format, isValid, isSameDay, subDays, addDays, startOfISOWeek, endOfISOWeek, isWithinInterval } from "date-fns";
import { nl } from "date-fns/locale";
import QRCode from "qrcode";
import OrderDetail from "./OrderDetail";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import ProductDossierModal from "./modals/ProductDossierModal";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { collection, query, where, getDocs, onSnapshot, limit } from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../config/dbPaths";
import { rejectTrackedProductFinal, completeTrackedProduct, tempRejectTrackedProduct, appendQcNote } from "../../services/planningSecurityService";
import { getStartedCounterField } from "../../utils/hubHelpers";
import InternalQrImage from "../../utils/InternalQrImage";
import PlanningSidebar from "./PlanningSidebar";
import { useNotifications } from '../../contexts/NotificationContext';
import { useTouchKeyboardPreference } from "../../hooks/useTouchKeyboardPreference";
import { OrderRecord, ProductRecord, SidebarEntry, FinishPayload, DeliveryMismatch } from "./bm01/bm01Types";
import { useBM01Data } from "./bm01/useBM01Data";
import BM01InspectionTab from "./bm01/BM01InspectionTab";
import BM01HistoryTab from "./bm01/BM01HistoryTab";
import BM01NahardingTab from "./bm01/BM01NahardingTab";


type BM01HubProps = {
    onBack?: () => void;
    orders?: OrderRecord[];
    products?: ProductRecord[];
    onMoveLot?: (lotNumber: string, station: string) => void;
};

const QR_CODE_OK_CONFIRMATION = 'FPI-ACTION-APPROVE-OK';

const escapeHtml = (value: unknown) =>
    String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const resolveProductIdentifier = (product: ProductRecord | null | undefined) =>
    String(product?.sourcePath || product?.__docPath || product?.id || product?.lotNumber || "").trim();
const BM01Hub = React.memo(({ onBack, orders = [], products = [], onMoveLot }: BM01HubProps) => {
    void onBack;
    const { t } = useTranslation();
    const { user } = useAdminAuth();
  // AANGEPAST: Standaard view op 'inspectie' (Aan te bieden)
    const { notify, showError } = useNotifications();
  const [activeTab, setActiveTab] = useState("inspectie");
        const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
        const [selectedSidebarEntry, setSelectedSidebarEntry] = useState<SidebarEntry | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
    const [viewingDossier, setViewingDossier] = useState<(ProductRecord & SidebarEntry) | null>(null);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [lastNahardingResetAt, setLastNahardingResetAt] = useState<string | null>(() => {
    return typeof window !== "undefined" ? localStorage.getItem("last_naharding_reset_at") : null;
  });
  const [viewMode, setViewMode] = useState("export"); // 'export', 'day' or 'week'
    const [deliveryMismatchFilter, setDeliveryMismatchFilter] = useState("all"); // all | over | under
        const [showDeliveryMismatch, setShowDeliveryMismatch] = useState(false);
  
  const [scanInput, setScanInput] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
    const [isNahardingBatchProcessing, setIsNahardingBatchProcessing] = useState(false);
    const scanInputRef = useRef<HTMLInputElement | null>(null);
    const selectedProductRef = useRef<ProductRecord | null>(null); // Ref voor race-condition preventie
        const { touchKeyboardPreferred, setTouchKeyboardPreferred } = useTouchKeyboardPreference();
        const isTouchDevice = useMemo(() => {
                if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
                return window.matchMedia("(pointer: coarse)").matches;
        }, []);

    const focusScanInput = useCallback(() => {
        const input = scanInputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
    }, []);

    const scheduleScanFocus = useCallback(() => {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => {
                focusScanInput();
                setTimeout(focusScanInput, 0);
            });
            return;
        }
        setTimeout(focusScanInput, 0);
    }, [focusScanInput]);

    const resolveSystemStation = useCallback((product: ProductRecord | undefined | null) => {
        if (!product) return "Onbekend";
        const station = String(product.currentStation || "").trim();
        if (station) return station;
        const step = String(product.currentStep || "").trim();
        if (step) return step;
        const lastStation = String(product.lastStation || "").trim();
        if (lastStation) return lastStation;
        return "Onbekend";
    }, []);

  // Sync ref met state
  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  // Auto-focus logic voor scanner
    useEffect(() => {
        if (!scannerMode) return;
        // Focus direct bij laden of als scannerMode aan gaat
        scheduleScanFocus();
        // Ook bij click buiten input, behalve op interactieve elementen
        const handleClick = (e: MouseEvent) => {
            const target = e?.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]')) return;
            if (activeTab === "inspectie" && !showFinishModal && !viewingDossier && !selectedOrderId) {
                scheduleScanFocus();
            }
        };
        const handleWindowFocus = () => {
            if (activeTab === "inspectie" && !showFinishModal && !viewingDossier && !selectedOrderId) {
                scheduleScanFocus();
            }
        };
        document.addEventListener('click', handleClick);
        window.addEventListener('focus', handleWindowFocus);
        return () => {
            document.removeEventListener('click', handleClick);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [activeTab, showFinishModal, viewingDossier, selectedOrderId, scannerMode, scheduleScanFocus]);

    // Focus scanveld bij eerste render (ook als scannerMode uit staat)
    useEffect(() => {
        scheduleScanFocus();
    }, [scheduleScanFocus]);

    const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const code = scanInput.trim().toUpperCase();
            if (!code) return;
            const selectedForAction = selectedProductRef.current || selectedProduct;

            // Debug: log scan

            // Goedkeuren met QR-code (OK QR)
            if (code === QR_CODE_OK_CONFIRMATION && selectedForAction) {
                setScanInput("");
                await handlePostProcessingFinish('completed', { note: 'Goedgekeurd via QR Scan' }, selectedForAction as ProductRecord);
                return;
            }

            // Zoek product op lotnummer
            const found = bm01Products.find((i: ProductRecord) => (i.lotNumber || "").toUpperCase() === code);
            if (found) {
                setSelectedProduct(found);
                setShowFinishModal(true); // Direct popup openen
                setScanInput("");
                // Debug: log gevonden product
            } else {
                const foundElsewhere = products.find((i: ProductRecord) => (i.lotNumber || "").toUpperCase() === code);
                if (foundElsewhere) {
                    const systemStation = resolveSystemStation(foundElsewhere);
                    showError(
                        t(
                            "bm01.wrong_station_scan",
                            "Lot {{lot}} ligt niet op BM01. Volgens het systeem staat dit lot op: {{station}}.",
                            { lot: code, station: systemStation }
                        ),
                        t("bm01.wrong_station_title", "Verkeerd station")
                    );
                } else {
                    notify(`Item ${code} niet gevonden in de lijst 'Aan te bieden'.`);
                }
                setScanInput("");
                setSelectedProduct(null);
            }
            // Na scan altijd weer focus op het scanveld
            setTimeout(() => {
                scheduleScanFocus();
            }, 50);
        }
    };
    const handleSidebarSelect = async (entry: SidebarEntry | null) => {
        if (!entry) {
            setSelectedOrderId(null);
            setSelectedSidebarEntry(null);
            return;
        }

        const entryOrderId = String(entry.orderId || entry.id || "").trim();
        if (!entryOrderId) return;
        setSelectedSidebarEntry(entry);

        if (entry.isArchivedOrder) {
            setSelectedOrderId(null);
            try {
                const baseYear = new Date().getFullYear();
                const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];
                const snapshots = await Promise.all(
                    years.map((year) =>
                        getDocs(query(archiveColPath(year), where("orderId", "==", entryOrderId), limit(100)))
                    )
                );

                const candidates: ProductRecord[] = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProductRecord, 'id'>) })));
                const best: ProductRecord | null = candidates
                    .sort((a, b) => {
                        const ta = toMillisFromMixed(a?.timestamps?.finished || a?.updatedAt || 0);
                        const tb = toMillisFromMixed(b?.timestamps?.finished || b?.updatedAt || 0);
                        return tb - ta;
                    })[0] || null;

                if (best) {
                    const lotNumbers = Array.from(
                        new Set(
                            candidates
                                .map((c) => String(c.lotNumber || c.activeLot || "").trim())
                                .filter(Boolean)
                        )
                    );

                    setSelectedSidebarEntry({
                        ...entry,
                        status: "completed",
                        archived: true,
                        isArchivedOrder: true,
                        archivedCandidates: candidates,
                        lotNumbers,
                        lotNumbersText: lotNumbers.join(" "),
                        machine: best.machine || best.originMachine || entry.machine,
                        item: best.item || best.itemDescription || entry.item,
                    });
                    return;
                }
            } catch (err) {
                console.warn("Kon archiefdossier niet laden:", err);
            }

            setSelectedSidebarEntry({
                ...entry,
                status: "completed",
                archived: true,
                isArchivedOrder: true,
            });
            return;
        }

        setSelectedOrderId(entry.id || entryOrderId);
    };

    const handleOpenArchivedLotDossier = async (lotNumber: string) => {
        if (!selectedSidebarEntry?.isArchivedOrder) return;

        const lot = String(lotNumber || "").trim();
        const localCandidates = Array.isArray(selectedSidebarEntry.archivedCandidates)
            ? selectedSidebarEntry.archivedCandidates
            : [];

        let best: ProductRecord | null = null;

        if (localCandidates.length > 0) {
            const scoped = lot
                ? localCandidates.filter((c) => String(c.lotNumber || c.activeLot || "").trim() === lot)
                : localCandidates;

            best = scoped.sort((a, b) => {
                const ta = toMillisFromMixed(a?.timestamps?.finished || a?.updatedAt || 0);
                const tb = toMillisFromMixed(b?.timestamps?.finished || b?.updatedAt || 0);
                return tb - ta;
            })[0] || null;
        }

        if (!best) {
            try {
                const orderId = String(selectedSidebarEntry.orderId || selectedSidebarEntry.id || "").trim();
                const baseYear = new Date().getFullYear();
                const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];
                const snaps = await Promise.all(
                    years.map((year) =>
                        getDocs(query(archiveColPath(year), where("orderId", "==", orderId), limit(150)))
                    )
                );

                const candidates: ProductRecord[] = snaps
                    .flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProductRecord, 'id'>) })))
                    .filter((c: ProductRecord) => {
                        if (!lot) return true;
                        return String(c.lotNumber || c.activeLot || "").trim() === lot;
                    });

                best = candidates.sort((a, b) => {
                        const ta = toMillisFromMixed(a?.timestamps?.finished || a?.updatedAt || 0);
                        const tb = toMillisFromMixed(b?.timestamps?.finished || b?.updatedAt || 0);
                    return tb - ta;
                })[0] || null;
            } catch (err) {
                console.warn("Kon dossier voor lot niet laden:", err);
            }
        }

        if (best) {
            setViewingDossier({
                ...best,
                status: "completed",
                archived: true,
                isArchivedOrder: true,
            });
            return;
        }

        setViewingDossier({
            ...selectedSidebarEntry,
            status: "completed",
            archived: true,
            lotNumber: lot || selectedSidebarEntry.lotNumber,
        });
    };

        const {
            planningOrders,
            deliveryInspectionMismatches,
            deliveryInspectionOverMismatches,
            deliveryInspectionUnderMismatches,
            visibleDeliveryInspectionMismatches,
            selectedOrder,
            selectedDetailEntry,
            selectedSidebarEntryId,
            bm01Products,
            nahardingProducts,
            latestNahardingBatchDateKey,
            nahardingBatchProducts,
            latestNahardingBatchLabel,
            archivedProducts,
            nahardingPrintList,
            completedProducts,
            getNahardingOfferedMillis,
            archiveColPath,
            toMillisFromMixed,
            toDateFromMixed
        } = useBM01Data({
            orders, products, selectedOrderId, selectedSidebarEntry, activeTab, selectedDate, viewMode, lastNahardingResetAt, deliveryMismatchFilter
        });
  // Filter producten specifiek voor BM01 (Aan te bieden tab)
  // Dit zorgt ervoor dat items met stap 'Eindinspectie' of station 'BM01' correct worden doorgegeven
  console.log("BM01 Raw Products received:", products);
  console.log("BM01 Filtered bm01Products:", bm01Products);

  const toMillisSafe = (value: unknown) => toMillisFromMixed(value);
    const handleNahardingBatchComplete = async () => {
        if (isNahardingBatchProcessing) return;
        const batchItems = nahardingBatchProducts.filter((item) => Boolean(resolveProductIdentifier(item)));
        if (batchItems.length === 0) {
            notify(t("bm01.naharding_batch_empty", "Geen Naharding lots gevonden om te gereedmelden."));
            return;
        }

        const confirmed = window.confirm(
            t(
                "bm01.naharding_batch_confirm",
                "Weet je zeker dat je de laatst aangeboden batch ({{count}} Naharding lots) in 1x gereed wilt melden en archiveren?",
                { count: batchItems.length }
            )
        );
        if (!confirmed) return;

        setIsNahardingBatchProcessing(true);
        let successCount = 0;
        let failCount = 0;

        for (const item of batchItems) {
            const productId = resolveProductIdentifier(item);
            try {
                await completeTrackedProduct({
                    productId,
                    finishType: "archive",
                    fromStation: "Naharding",
                    note: "Batch Naharding gereedgemeld vanuit BM01",
                    actorLabel: user?.email || "Operator",
                    source: "BM01Hub:naharding-batch",
                });
                successCount += 1;
            } catch (error) {
                failCount += 1;
                console.error("Naharding batch gereedmelden mislukt:", productId, error);
            }
        }

        try {
            await logActivity(
                user?.uid || "system",
                "POST_PROCESS_COMPLETE_BATCH",
                `BM01 Naharding batch gereedgemeld: success=${successCount}, failed=${failCount}`
            );
        } catch (error) {
            console.error("Kon BM01 batch log niet opslaan:", error);
        }

        if (failCount === 0) {
            notify(t("bm01.naharding_batch_success", "Naharding batch gereedgemeld: {{count}} lots gearchiveerd.", { count: successCount }));
        } else {
            notify(
                t(
                    "bm01.naharding_batch_partial",
                    "Naharding batch deels gereedgemeld: {{success}} gelukt, {{failed}} mislukt.",
                    { success: successCount, failed: failCount }
                )
            );
        }

        setIsNahardingBatchProcessing(false);
    };

  // Fetch archived products for selected date
  // Specifieke lijst voor de Naharding Print-tegel, inclusief historie/archief van de geselecteerde dag
  // Filter producten die gereed zijn (Aangeboden tab) op basis van geselecteerde datum
  // Combineert actieve producten (die nog niet gearchiveerd zijn) en gearchiveerde producten
    const handleItemClick = (item: ProductRecord) => {
    setSelectedProduct(item); // Selecteer item
    setShowFinishModal(true); // Open modal voor handmatige actie
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setShowFinishModal(false);
        setTimeout(scheduleScanFocus, 50);
  };

    const handlePostProcessingFinish = async (status: string, data: FinishPayload, productOverride: ProductRecord | null = null) => {
    const product = productOverride || selectedProduct;
    if (!product) return;

        const productId = resolveProductIdentifier(product);
        if (!productId) {
            notify("Kon dit product niet afronden: ontbrekende product-id.");
            return;
        }

    try {
      if (status === "completed") {
        await completeTrackedProduct({
          productId,
                    finishType: "post_inspection",
          fromStation: "BM01",
          note: data.note || "",
          actorLabel: user?.email || "Operator",
          source: "BM01Hub",
        });
        await logActivity(
          user?.uid || "system",
          "POST_PROCESS_COMPLETE",
                    `BM01 afgerond en doorgestuurd naar Naharding: lot ${product.lotNumber || productId}`
        );
                notify(`Lot ${product.lotNumber || productId} is doorgestuurd naar Naharding.`);
                if (resolveProductIdentifier(selectedProductRef.current) === productId) handleCloseModal();
        return;
      }

      if (status === "rejected") {
        await rejectTrackedProductFinal({
          productId,
          reasons: data.reasons || [],
          note: data.note || "",
          source: "BM01Hub",
          actorLabel: user?.email || "Operator",
        });
        await logActivity(
          user?.uid || "system",
          "QUALITY_REJECT_FINAL",
          `BM01 Definitieve afkeur en gearchiveerd: lot ${product.lotNumber || productId}`
        );
                notify(`Lot ${product.lotNumber || productId} is definitief afgekeurd.`);
                if (resolveProductIdentifier(selectedProductRef.current) === productId) handleCloseModal();
        return;
      }

            await tempRejectTrackedProduct({
                productId,
                reasons: data.reasons || [],
                note: data.note || "",
                station: "BM01",
                actorLabel: user?.email || "Operator",
                source: "BM01Hub",
      });
      await logActivity(
        user?.uid || "system",
        "QUALITY_TEMP_REJECT",
        `BM01 Tijdelijke afkeur: lot ${product.lotNumber || productId}`
      );
            notify(`Lot ${product.lotNumber || productId} is tijdelijk afgekeurd.`);
    if (resolveProductIdentifier(selectedProductRef.current) === productId) handleCloseModal();
        } catch (error: unknown) {
      console.error("Fout bij afronden:", error);
            notify(`Afronden mislukt: ${error instanceof Error ? error.message : "onbekende fout"}`);
    }
  };

  const handleExport = () => {
      if (completedProducts.length === 0) return;
      
      const headers = ["Order", "Lot", "Item", "Item Code", "Gereed Datum", "Tijd"];
      const rows = completedProducts.map((p: ProductRecord) => {
          const date = toDateFromMixed(p.timestamps?.finished || p.updatedAt) || new Date();
          return [
              p.orderId || "",
              p.lotNumber || "",
              `"${(p.item || "").replace(/"/g, '""')}"`,
              p.itemCode || "",
              format(date, "yyyy-MM-dd"),
              format(date, "HH:mm")
          ];
      });
      
      const csvContent = "data:text/csv;charset=utf-8," 
          + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
          
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `bm01_export_${viewMode}_${format(selectedDate, "yyyy-MM-dd")}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

    const handlePrintQrOverview = async () => {
            // BEPALING LIJST: Als we in NH tab zitten, gebruik de specifieke print lijst voor die dag
            let listToPrint: ProductRecord[] = activeTab === "naharding_batch" ? nahardingPrintList : completedProducts;

            if (activeTab === "naharding_batch") {
                listToPrint = [...listToPrint].sort((a, b) => {
                    const orderA = String(a.orderId || "").trim();
                    const orderB = String(b.orderId || "").trim();
                    return orderA.localeCompare(orderB);
                });
            }

            if (listToPrint.length === 0) return;

            try {
                    const itemsWithQr = await Promise.all(
                            listToPrint.map(async (item: ProductRecord, index: number) => {
                                    const orderId = String(item.orderId || "").trim();
                                    const lotNumber = String(item.lotNumber || "").trim();
                                    const itemName = String(item.item || "").trim();
                                    const itemCode = String(item.itemCode || "").trim();

                                    const orderQr = orderId
                                            ? await QRCode.toDataURL(orderId, { errorCorrectionLevel: "H", margin: 1, width: 220 })
                                            : "";
                                    const lotQr = lotNumber
                                            ? await QRCode.toDataURL(lotNumber, { errorCorrectionLevel: "H", margin: 1, width: 220 })
                                            : "";

                                        const finishedAt = activeTab === "naharding_batch"
                                            ? new Date(getNahardingOfferedMillis(item))
                                            : (toDateFromMixed(item.timestamps?.finished || item.updatedAt || Date.now()) || new Date());

                                    return {
                                            index: index + 1,
                                            orderId,
                                            lotNumber,
                                            itemName,
                                            itemCode,
                                            finishedAtText: isValid(finishedAt) ? format(finishedAt, "HH:mm") : "--:--",
                                            orderQr,
                                            lotQr,
                                    };
                            })
                    );

                    const reportDate = viewMode === "day"
                        ? format(selectedDate, "EEEE d MMMM yyyy", { locale: nl })
                        : `Week ${format(selectedDate, "w")} (${format(startOfISOWeek(selectedDate), "d MMM", { locale: nl })} - ${format(endOfISOWeek(selectedDate), "d MMM", { locale: nl })})`;

                    let cardsHtml = "";
                    let customStyle = "";

                    if (activeTab === "naharding_batch") {
                        cardsHtml = itemsWithQr.map((row, idx) => {
                            const isFirstOfOrder = idx === 0 || itemsWithQr[idx - 1].orderId !== row.orderId;
                            return `
                                        <article class="card">
                                            <div class="cardHeader">
                                                <div>
                                                    <div class="index">#${row.index}</div>
                                                    <h2 class="title">${escapeHtml(row.itemName)}</h2>
                                                    <p class="code">${escapeHtml(row.itemCode)}</p>
                                                </div>
                                                <div class="time">${escapeHtml(row.finishedAtText)}</div>
                                            </div>
                                            <div class="qrGrid">
                                                ${isFirstOfOrder ? `
                                                <section class="qrBlock">
                                                    ${row.orderQr ? `<img src="${row.orderQr}" alt="QR Order ${escapeHtml(row.orderId)}" />` : ""}
                                                    <div>
                                                        <div class="label">${t('common.orderNumber', 'Ordernummer')}</div>
                                                        <div class="value">${escapeHtml(row.orderId)}</div>
                                                    </div>
                                                </section>
                                                ` : `<div></div>`}
                                                <section class="qrBlock">
                                                    ${row.lotQr ? `<img src="${row.lotQr}" alt="QR Lot ${escapeHtml(row.lotNumber)}" />` : ""}
                                                    <div>
                                                        <div class="label">${t('common.lotNumber', 'Lotnummer')}</div>
                                                        <div class="value">${escapeHtml(row.lotNumber)}</div>
                                                    </div>
                                                </section>
                                            </div>
                                        </article>
                                    `;
                        }).join("");
                    } else {
                        cardsHtml = `
                            <table class="simple-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>${t('common.lotNumber', 'Lotnummer')}</th>
                                        <th>${t('common.orderNumber', 'Ordernummer')}</th>
                                        <th>${t('common.product', 'Product')}</th>
                                        <th>${t('common.time', 'Tijd')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsWithQr.map(row => `
                                        <tr>
                                            <td>${row.index}</td>
                                            <td><strong>${escapeHtml(row.lotNumber)}</strong></td>
                                            <td>${escapeHtml(row.orderId)}</td>
                                            <td>${escapeHtml(row.itemName)}</td>
                                            <td>${escapeHtml(row.finishedAtText)}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        `;
                        customStyle = `
                            .simple-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                            .simple-table th, .simple-table td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
                            .simple-table th { background-color: #f8fafc; font-weight: bold; text-transform: uppercase; font-size: 10px; color: #64748b; }
                            .simple-table tr:nth-child(even) { background-color: #f1f5f9; }
                        `;
                    }

                    const html = `<!doctype html>
<html lang="nl">
    <head>
        <meta charset="utf-8" />
        <title>${t('bm01.qrOverviewTitle', 'BM01 QR Overzicht')}</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #0f172a; }
            .sheet { width: 100%; }
            .header { border-bottom: 2px solid #0f172a; margin-bottom: 10px; padding-bottom: 6px; }
            .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
            .header p { margin: 4px 0 0; font-size: 12px; color: #334155; }
            .list { display: flex; flex-direction: column; gap: 6px; }
            .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; break-inside: avoid; page-break-inside: avoid; }
            .cardHeader { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
            .index { font-size: 10px; font-weight: 700; color: #64748b; }
            .title { margin: 0; font-size: 11px; line-height: 1.25; font-weight: 800; }
            .code { margin: 2px 0 0; font-size: 9px; color: #64748b; }
            .time { font-size: 10px; font-weight: 700; white-space: nowrap; }
            .qrGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
            .qrBlock { display: flex; gap: 6px; align-items: center; }
            .qrBlock img { width: 56px; height: 56px; object-fit: contain; border: 1px solid #e2e8f0; }
            .label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
            .value { font-size: 11px; font-weight: 800; word-break: break-all; }
            ${customStyle}
        </style>
    </head>
    <body>
        <main class="sheet">
            <header class="header" style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <h1>${activeTab === "naharding_batch" ? t('bm01.nahardingOverview', 'QR Overzicht Naharding') : t('bm01.readyListOverview', 'Gereedlijst Overzicht')}</h1>
                    <p>${escapeHtml(reportDate)}</p>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">${t('bm01.lotCount', 'Aantal lots')}:</span>
                    <span style="font-size: 24px; font-weight: 900; margin-left: 6px; color: #0f172a;">${itemsWithQr.length}</span>
                </div>
            </header>
            <section class="${activeTab === "naharding_batch" ? "list" : ""}">${cardsHtml}</section>
        </main>
    </body>
</html>`;

                    const frame = document.createElement("iframe");
                    frame.style.position = "fixed";
                    frame.style.right = "0";
                    frame.style.bottom = "0";
                    frame.style.width = "0";
                    frame.style.height = "0";
                    frame.style.border = "0";
                    frame.setAttribute("aria-hidden", "true");
                    document.body.appendChild(frame);

                    const cleanup = () => {
                            setTimeout(() => {
                                    if (frame.parentNode) frame.parentNode.removeChild(frame);
                            }, 150);
                    };

                    frame.onload = () => {
                            const win = frame.contentWindow;
                            if (!win) {
                                    cleanup();
                                    return;
                            }
                            win.onafterprint = cleanup;
                            win.focus();
                            win.print();
                            setTimeout(cleanup, 2000);

                            if (activeTab === "naharding_batch") {
                                setTimeout(() => {
                                    const confirmReset = window.confirm(
                                        t("bm01.reset_counter_confirm", "Wil je de teller resetten (de geprinte items markeren als geëxporteerd)?")
                                    );
                                    if (confirmReset) {
                                        const nowStr = new Date().toISOString();
                                        localStorage.setItem("last_naharding_reset_at", nowStr);
                                        setLastNahardingResetAt(nowStr);
                                    }
                                }, 500);
                            }
                    };

                    frame.srcdoc = html;
            } catch (err) {
                    console.error("Print fout:", err);
                    notify("Kon QR-overzicht niet printen. Probeer opnieuw.");
            }
    };

    const handleAddQcNote = async (noteText: string) => {
      if (!viewingDossier || !noteText.trim()) return;
      
      try {
          const product = viewingDossier;
          const isArchived = archivedProducts.some(p => p.id === product.id);
                    const date = toDateFromMixed(product.timestamps?.finished || product.updatedAt || Date.now()) || new Date();
          const archiveYear = isArchived && Number.isFinite(date.getFullYear()) ? date.getFullYear() : null;

          const noteObj = {
              text: noteText,
              timestamp: new Date().toISOString(),
              user: user?.email || "BM01 Operator"
          };

          await appendQcNote({
              productId: product.id,
              note: noteText,
              archivedYear: archiveYear,
              source: "bm01_hub",
              actorLabel: user?.email || "BM01 Operator",
          });
                    await logActivity(
                        user?.uid || "system",
                        "QC_NOTE_ADD",
                        `QC notitie toegevoegd: lot ${product?.lotNumber || product?.id || "onbekend"}`
                    );
          
          // Update lokale state voor directe feedback in de modal
          setViewingDossier((prev) => {
              if (!prev) return prev;
              return {
                  ...prev,
                  qcNotes: [...(prev.qcNotes || []), noteObj],
              };
          });
      } catch (err: unknown) {
          console.error("Fout bij opslaan notitie:", err);
          notify("Kon rapport niet opslaan: " + (err instanceof Error ? err.message : String(err)));
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      {/* Custom Tabs Header voor BM01 */}
      <div className="p-0.5 bg-white border-b border-slate-200 shrink-0 shadow-sm sm:p-2">
        <div className="flex justify-center overflow-x-auto no-scrollbar">
            <div className="flex bg-slate-100 p-0.5 rounded-lg w-full max-w-2xl min-w-[280px]">
                <button 
                    onClick={() => setActiveTab("planning")}
                    className={`flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "planning" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    {t('bm01.planning_total')}
                </button>
                <button 
                    onClick={() => setActiveTab("inspectie")}
                    className={`flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "inspectie" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    {t('bm01.to_offer')}
                </button>
                <button 
                    onClick={() => setActiveTab("naharding_batch")}
                    className={`flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "naharding_batch" ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    NH
                </button>
                <button 
                    onClick={() => setActiveTab("completed")}
                    className={`flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "completed" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    {t('bm01.offered')}
                </button>
                <button 
                    onClick={() => setActiveTab("mismatch")}
                    className={`flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "mismatch" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    LN
                </button>
            </div>
        </div>
      </div>

      <style>{`
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(168, 85, 247, 0); }
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .scan-pulse-bm01 {
          animation: scan-pulse 2s infinite;
        }
        .pulse-text-bm01 {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      `}</style>
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "planning" ? (
            <div className="h-full flex gap-6 overflow-hidden">
                <div className={`shrink-0 flex flex-col min-h-0 transition-all duration-300 ${selectedDetailEntry ? 'hidden lg:flex w-[38rem]' : 'w-full lg:w-[38rem]'}`}>
                    <PlanningSidebar orders={planningOrders as any[]} selectedOrderId={selectedSidebarEntryId || undefined} onSelect={handleSidebarSelect as any} />
                </div>

                <div className={`flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden ${selectedDetailEntry ? 'flex' : 'hidden lg:flex'}`}>
                    {selectedOrder ? (
                        <OrderDetail
                            order={selectedOrder}
                            products={products}
                            onClose={() => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }}
                            onMoveLot={onMoveLot}
                            isManager={true}
                        />
                    ) : selectedSidebarEntry?.isArchivedOrder ? (
                        <div className="h-full flex flex-col p-8 lg:p-10 text-left overflow-y-auto">
                            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">{t('bm01.historyArchive', 'History / Archief')}</p>
                                    <h3 className="text-2xl font-black text-slate-900 italic tracking-tight mt-1">{selectedSidebarEntry.orderId || selectedSidebarEntry.id || '-'}</h3>
                                    <p className="text-sm font-bold text-slate-500 mt-1">{selectedSidebarEntry.item || selectedSidebarEntry.itemDescription || '-'}</p>
                                </div>
                                <button
                                    onClick={() => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }}
                                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-200"
                                >
                                    {t('common.close', 'Sluiten')}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('common.status', 'Status')}</p>
                                    <p className="text-sm font-bold text-slate-800 mt-1">{t('bm01.completedArchive', 'Voltooid (Archief)')}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('common.machine', 'Machine')}</p>
                                    <p className="text-sm font-bold text-slate-800 mt-1">{selectedSidebarEntry.machine || selectedSidebarEntry.originMachine || '-'}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 md:col-span-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('bm01.lotNumbers', 'Lotnummers')}</p>
                                    {Array.isArray(selectedSidebarEntry.lotNumbers) && selectedSidebarEntry.lotNumbers.length > 0 ? (
                                        <div className="mt-2 space-y-2">
                                            {selectedSidebarEntry.lotNumbers.map((lot) => (
                                                <div key={lot} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                    <span className="text-sm font-bold text-slate-800 break-all">{lot}</span>
                                                    <button
                                                        onClick={() => handleOpenArchivedLotDossier(lot)}
                                                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
                                                    >
                                                        {t('bm01.openDossier', 'Open dossier')}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2">
                                            <span className="text-sm font-bold text-slate-800 break-all">{selectedSidebarEntry.lotNumber || selectedSidebarEntry.lotNumbersText || '-'}</span>
                                            <button
                                                onClick={() => handleOpenArchivedLotDossier(String(selectedSidebarEntry.lotNumber || ""))}
                                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
                                            >
                                                {t('bm01.openDossier', 'Open dossier')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center items-center opacity-40 italic text-center">
                            <Layers size={64} className="mb-4 text-slate-300" />
                            <p className="font-black uppercase tracking-widest text-xs text-slate-400">{t('bm01.select_order', 'Selecteer een order uit de lijst')}</p>
                        </div>
                    )}
                </div>
            </div>
        ) : activeTab === "inspectie" ? (
            <BM01InspectionTab
                bm01Products={bm01Products}
                selectedProduct={selectedProduct}
                scanInput={scanInput}
                setScanInput={setScanInput}
                scannerMode={scannerMode}
                setScannerMode={setScannerMode}
                scanInputRef={scanInputRef}
                handleScan={handleScan}
                isTouchDevice={isTouchDevice}
                touchKeyboardPreferred={touchKeyboardPreferred}
                setTouchKeyboardPreferred={setTouchKeyboardPreferred}
                handleItemClick={handleItemClick}
                scheduleScanFocus={scheduleScanFocus}
            />
        ) : activeTab === "completed" ? (
            <BM01HistoryTab
                completedProducts={completedProducts}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                viewMode={viewMode}
                setViewMode={setViewMode}
                handleExport={handleExport}
                setShowPrintModal={setShowPrintModal}
                setViewingDossier={setViewingDossier}
                toDateFromMixed={toDateFromMixed}
            />
        ) : activeTab === "naharding_batch" ? (
            <BM01NahardingTab
                nahardingBatchProducts={nahardingBatchProducts}
                latestNahardingBatchLabel={latestNahardingBatchLabel}
                isNahardingBatchProcessing={isNahardingBatchProcessing}
                handleNahardingBatchComplete={handleNahardingBatchComplete}
                viewMode={viewMode}
                setViewMode={setViewMode}
                nahardingPrintList={nahardingPrintList}
                lastNahardingResetAt={lastNahardingResetAt}
                setLastNahardingResetAt={setLastNahardingResetAt}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setShowPrintModal={setShowPrintModal}
                nahardingProducts={nahardingProducts}
            />
        ) : (
            <div className="h-full flex flex-col p-4 overflow-y-auto">
                <div className="mb-4 rounded-3xl border-2 border-rose-200 bg-rose-50 px-5 py-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-rose-700">
                            <AlertTriangle size={20} className="shrink-0" />
                            <div className="text-left">
                                <p className="text-xs font-black uppercase tracking-widest leading-none">{t('bm01.lnMismatch', 'LN Mismatch')}</p>
                                <p className="text-[10px] font-bold opacity-60 mt-1 uppercase">{t('bm01.deliveredVsApproved', 'Geleverd vs Goedgekeurd')}</p>
                            </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-xl bg-white border border-rose-200 text-rose-700 text-[11px] font-black italic">
                            {deliveryInspectionMismatches.length}
                        </span>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setDeliveryMismatchFilter("all")}
                            className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${deliveryMismatchFilter === "all" ? "bg-white border-rose-300 text-rose-700 shadow-sm" : "bg-rose-100/60 border-rose-200 text-rose-600 hover:bg-white"}`}
                        >
                            {t('common.all', 'Alles')} ({deliveryInspectionMismatches.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeliveryMismatchFilter("over")}
                            className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${deliveryMismatchFilter === "over" ? "bg-white border-orange-300 text-orange-700 shadow-sm" : "bg-rose-100/60 border-rose-200 text-rose-600 hover:bg-white"}`}
                        >
                            LN {'>'} FF ({deliveryInspectionOverMismatches.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeliveryMismatchFilter("under")}
                            className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${deliveryMismatchFilter === "under" ? "bg-white border-amber-300 text-amber-700 shadow-sm" : "bg-rose-100/60 border-rose-200 text-rose-600 hover:bg-white"}`}
                        >
                            LN {'<'} FF ({deliveryInspectionUnderMismatches.length})
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    {visibleDeliveryInspectionMismatches.length === 0 ? (
                        <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 px-6 py-12 text-center">
                            <CheckCircle2 size={40} className="mx-auto mb-3 text-slate-300" />
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400 italic">
                                {t('bm01.noMismatchOrdersFound', 'Geen mismatch-orders gevonden.')}
                            </p>
                        </div>
                    ) : (
                        visibleDeliveryInspectionMismatches.map((entry: DeliveryMismatch) => (
                            <div key={`${entry.orderId}_${entry.item}`} className="flex items-center justify-between gap-4 rounded-3xl bg-white border border-slate-100 p-5 shadow-sm hover:border-blue-200 transition-all group">
                                <div className="min-w-0">
                                    <p className="text-base font-black text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors">{entry.orderId}</p>
                                    <p className="text-xs font-bold text-slate-500 truncate mt-0.5">{entry.item}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-xs font-black text-rose-600 uppercase tracking-wider">LN {entry.deliveredQty}</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">FF {entry.inspectionApprovedQty}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}
      </div>

      {showFinishModal && selectedProduct && (
        <div className="fixed z-[9999]">
          <PostProcessingFinishModal
              product={selectedProduct}
              onClose={handleCloseModal}
              onConfirm={handlePostProcessingFinish}
              currentStation="BM01"
          />
        </div>
      )}

      {viewingDossier && (
        <div className="fixed z-[9999]">
          <ProductDossierModal
              isOpen={true}
                            product={viewingDossier as React.ComponentProps<typeof ProductDossierModal>["product"]}
              onClose={() => setViewingDossier(null)}
              onAddNote={handleAddQcNote}
                            orders={orders as React.ComponentProps<typeof ProductDossierModal>["orders"]}
                            onMoveLot={onMoveLot as React.ComponentProps<typeof ProductDossierModal>["onMoveLot"]}
          />
        </div>
      )}

      {/* PRINT / SCAN MODAL */}
      {showPrintModal && (
        <div
            className="bm01-print-overlay fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-3 md:p-6 animate-in fade-in print:block print:static print:bg-white print:p-0 print:backdrop-blur-0"
            onClick={() => setShowPrintModal(false)}
        >
                        <style>{`
                            @media print {
                                @page {
                                    size: A4 portrait;
                                    margin: 8mm;
                                }

                                body * {
                                    visibility: hidden !important;
                                }

                                .bm01-print-overlay,
                                .bm01-print-overlay * {
                                    visibility: visible !important;
                                }

                                .bm01-qr-print-sheet {
                                    max-width: 190mm !important;
                                    margin: 0 auto !important;
                                }

                                .bm01-print-overlay,
                                .bm01-print-dialog {
                                    max-height: none !important;
                                    height: auto !important;
                                    overflow: visible !important;
                                }
                            }
                        `}</style>
            <div
                className="bm01-print-dialog w-full max-w-6xl max-h-[92vh] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden print:max-h-none print:overflow-visible print:max-w-none print:rounded-none print:border-0 print:shadow-none"
                onClick={(e) => e.stopPropagation()}
            >
                                <div className="bm01-qr-print-sheet p-5 md:p-8 overflow-y-auto max-h-[92vh] print:max-h-none print:overflow-visible print:p-0 print:max-w-none">
                {/* Header - Hidden on Print */}
                <div className="flex justify-between items-center mb-8 print:hidden">
                    <div>
                        <h2 className="text-2xl font-black uppercase italic text-slate-900">{t('bm01.daily_overview')}</h2>
                        <p className="text-slate-500 font-bold">{format(selectedDate, "EEEE d MMMM yyyy", { locale: nl })}</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 text-right">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">{t('bm01.lotCount', 'Aantal lots')}</span>
                            <span className="text-2xl font-black text-slate-800 leading-none">{(activeTab === "naharding_batch" ? nahardingPrintList : completedProducts).length}</span>
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={handlePrintQrOverview}
                                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 shadow-lg"
                            >
                                <Printer size={16} /> {t('bm01.print_pdf')}
                            </button>
                            <button 
                                onClick={() => setShowPrintModal(false)}
                                className="p-3 hover:bg-slate-100 rounded-xl text-slate-500"
                            >
                                <X size={24} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Print Header - Visible only on Print */}
                <div className="hidden print:flex mb-8 border-b-2 border-slate-900 pb-4 justify-between items-end">
                    <div>
                        <h1 className="text-2xl font-black uppercase">
                            {activeTab === "naharding_batch" ? t('bm01.naharding_overview', 'QR Overzicht Naharding') : t('bm01.daily_overview_offered')}
                        </h1>
                        <p className="text-lg">
                            {format(selectedDate, "EEEE d MMMM yyyy", { locale: nl })}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">{t('bm01.lotCount', 'Aantal lots')}:</span>
                        <span className="ml-2 text-3xl font-black text-slate-900">{(activeTab === "naharding_batch" ? nahardingPrintList : completedProducts).length}</span>
                    </div>
                </div>

                {/* Content */}
                <div className={`space-y-6 ${activeTab === "naharding_batch" ? "print:space-y-0 print:grid print:grid-cols-2 print:gap-y-4 print:gap-x-4 print:content-start" : "print:space-y-0"}`}>
                    {(activeTab === "naharding_batch" ? nahardingPrintList : completedProducts).length === 0 ? (
                        <p className="text-center text-slate-400 italic py-10">{t('bm01.no_products_date')}</p>
                    ) : (
                        activeTab === "naharding_batch" ? (
                        nahardingPrintList.map((item, index) => {
                            const isFirstOfOrder = index === 0 || nahardingPrintList[index - 1].orderId !== item.orderId;
                            return (
                            <div key={item.id} className="border-b border-slate-200 pb-6 mb-6 break-inside-avoid print:border print:border-slate-300 print:p-2 print:mb-0 print:rounded-lg print:pb-1 print:break-inside-avoid">
                                <div className="flex justify-between items-start mb-4 print:mb-1">
                                    <div className="min-w-0 overflow-hidden">
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs font-black text-slate-400 uppercase print:text-[8px]">#{index + 1}</span>
                                            <span className="hidden print:inline text-[8px] font-bold text-slate-500 truncate">{item.itemCode}</span>
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900 print:text-xs print:leading-tight truncate">{item.item}</h3>
                                        <p className="text-sm text-slate-500 font-bold print:hidden">{item.itemCode}</p>
                                    </div>
                                    <div className="text-right shrink-0 ml-1">
                                        <span className="block text-sm font-bold text-slate-900 print:text-[8px]">{item.timestamps?.finished ? format(toDateFromMixed(item.timestamps.finished) || new Date(), "HH:mm") : "--:--"}</span>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-8 print:gap-2">
                                    {/* Order QR */}
                                    {isFirstOfOrder ? (
                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:border-0 print:bg-transparent print:p-0 print:gap-2">
                                        <InternalQrImage value={item.orderId} size={240} alt={`QR Order ${item.orderId}`} className="w-24 h-24 mix-blend-multiply print:w-10 print:h-10" />
                                        <div className="min-w-0 overflow-hidden">
                                            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest print:hidden">{t('bm01.order_number')}</span>
                                            <span className="block text-xl font-black font-mono text-slate-900 print:text-[10px] truncate">{item.orderId}</span>
                                        </div>
                                    </div>
                                    ) : (
                                        <div></div>
                                    )}

                                    {/* Lot QR */}
                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:border-0 print:bg-transparent print:p-0 print:gap-2">
                                        <InternalQrImage value={item.lotNumber} size={240} alt={`QR Lot ${item.lotNumber}`} className="w-24 h-24 mix-blend-multiply print:w-10 print:h-10" />
                                        <div className="min-w-0 overflow-hidden">
                                            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest print:hidden">{t('bm01.lot_number')}</span>
                                            <span className="block text-xl font-black font-mono text-slate-900 break-all print:text-[10px] truncate">{item.lotNumber}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            );
                        })
                        ) : (
                            <table className="w-full border-collapse text-left text-sm print:text-[10px]">
                                <thead>
                                    <tr className="border-b-2 border-slate-200">
                                        <th className="py-2 px-2 text-slate-500 uppercase">#</th>
                                        <th className="py-2 px-2 text-slate-500 uppercase">{t('common.lotNumber', 'Lotnummer')}</th>
                                        <th className="py-2 px-2 text-slate-500 uppercase">{t('common.orderNumber', 'Ordernummer')}</th>
                                        <th className="py-2 px-2 text-slate-500 uppercase">{t('common.product', 'Product')}</th>
                                        <th className="py-2 px-2 text-slate-500 uppercase">{t('common.time', 'Tijd')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {completedProducts.map((item, index) => {
                                        const date = toDateFromMixed(item.timestamps?.finished || item.updatedAt) || new Date();
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                                <td className="py-3 px-2 font-bold text-slate-400">{index + 1}</td>
                                                <td className="py-3 px-2 font-black text-slate-800">{item.lotNumber}</td>
                                                <td className="py-3 px-2 font-mono text-slate-600">{item.orderId}</td>
                                                <td className="py-3 px-2 text-slate-700 truncate max-w-[200px]" title={item.item}>{item.item}</td>
                                                <td className="py-3 px-2 font-bold text-slate-500">{isValid(date) ? format(date, "HH:mm") : "--:--"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )
                    )}
                </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
});

export default BM01Hub;
