import { ProductItem, PlanningOrder, SavedFreeLabelTemplate } from '../mazak.types';
import * as helpers from '../utils/mazakHelpers';
import { 
  rejectTrackedProductFinal, completeTrackedProduct, tempRejectTrackedProduct,
  markMazakLabelsPrinted, queuePrintJob, reassignTrackedProductOrder, createProductionMessages 
} from '../../../../services/planningSecurityService';
import { resolvePrinterForRouting } from '../../../../utils/printRouting';
import { renderLabelToBitmapZpl } from '../../../../utils/zebraLabelRenderEngine';
import { resolveLinkedTemplateChain } from '../../../../utils/orderLabelTemplateUtils';
import { getPathString, PATHS } from '../../../../config/dbPaths';
import { db, logActivity } from '../../../../config/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { AdminUser } from '../mazak.types';
import { TranslateFn } from '../mazak.types';

export interface UseMazakActionsProps {
  user: AdminUser | null;
  notify: unknown;
  stationId: string;
  items: ProductItem[];
  setItems: unknown;
  selectedProduct: ProductItem | null;
  setSelectedProduct: unknown;
  scanInputInbox: string;
  setScanInputInbox: unknown;
  scanInputProcess: string;
  setScanInputProcess: unknown;
  scanInputAdjust: string;
  setScanInputAdjust: unknown;
  activeScanInput: string;
  setActiveScanInput: unknown;
  activeTab: unknown;
  setActiveTab: unknown;
  setShowActionModal: unknown;
  setShowPrintModal: unknown;
  setShowAdjustOrderModal: unknown;
  setShowRequestNewOrderModal: unknown;
  setShowLargeSequenceModal: unknown;
  setShowFreeLabelModal: unknown;
  selectedAdjustTargetOrder: PlanningOrder | null;
  adjustRequestNote: string;
  setAdjustSubmitting: unknown;
  setAdjustReason: unknown;
  setAdjustOrderSearch: unknown;
  setSelectedAdjustTargetOrder: unknown;
  setAdjustRequestNote: unknown;
  freeLabelTemplateName: string;
  freeLabelQuantity: number;
  freeLabelAlign: "left" | "center" | "right";
  freeLabelFontSize: number;
  freeLabelText: string;
  setSavingFreeTemplate: unknown;
  setFreeLabelTemplateName: unknown;
  setFreeLabelText: unknown;
  selectedLabelId: string;
  availableLabels: unknown[];
  availablePrinters: unknown[];
  setPrinting: unknown;
  t: TranslateFn;
}

export const useMazakActions = (props: UseMazakActionsProps) => {
  const {
    user, notify, stationId, items, setItems, selectedProduct, setSelectedProduct,
    scanInputInbox, setScanInputInbox, scanInputProcess, setScanInputProcess,
    scanInputAdjust, setScanInputAdjust, activeScanInput, setActiveScanInput,
    activeTab, setActiveTab, setShowActionModal, setShowPrintModal,
    setShowAdjustOrderModal, setShowRequestNewOrderModal, setShowLargeSequenceModal,
    setShowFreeLabelModal, selectedAdjustTargetOrder, adjustRequestNote, setAdjustSubmitting,
    setAdjustReason, setAdjustOrderSearch, setSelectedAdjustTargetOrder, setAdjustRequestNote,
    freeLabelTemplateName, freeLabelQuantity, freeLabelAlign, freeLabelFontSize, freeLabelText,
    setSavingFreeTemplate, setFreeLabelTemplateName, setFreeLabelText, selectedLabelId,
    availableLabels, availablePrinters, setPrinting, t
  } = props;

  const handleItemClick = (item: ProductItem) => {
    let sameSeries: ProductItem[] = [];

    if (activeTab === "inbox" && item.seriesGroupId) {
      sameSeries = inboxItems.filter(
        (seriesItem) =>
          seriesItem.seriesGroupId === item.seriesGroupId && helpers.isSeriesEligibleItem(seriesItem)
      );
    }

    // Fallback voor legacy records zonder seriesGroupId: groepeer op lot-prefix + order/item.
    if (activeTab === "inbox" && sameSeries.length <= 1) {
      const lotPrefix = helpers.getLotSeriesPrefix(item?.lotNumber);
      const orderKey = String(item?.orderId || "").trim().toUpperCase();
      const itemCodeKey = String(item?.itemCode || "").trim().toUpperCase();

      if (lotPrefix) {
        sameSeries = inboxItems.filter((seriesItem: ProductItem) => {
          if (!helpers.isSeriesEligibleItem(seriesItem)) return false;

          const candidatePrefix = helpers.getLotSeriesPrefix(seriesItem?.lotNumber);
          if (!candidatePrefix || candidatePrefix !== lotPrefix) return false;

          const candidateOrder = String(seriesItem?.orderId || "").trim().toUpperCase();
          if (orderKey && candidateOrder && candidateOrder !== orderKey) return false;

          const candidateItemCode = String(seriesItem?.itemCode || "").trim().toUpperCase();
          if (itemCodeKey && candidateItemCode && candidateItemCode !== itemCodeKey) return false;

          return true;
        });
      }
    }

    if (activeTab === "inbox" && sameSeries.length > 1) {
      const lotPrefix = helpers.getLotSeriesPrefix(item?.lotNumber);
      const orderKey = String(item?.orderId || "").trim().toUpperCase();
      const itemCodeKey = String(item?.itemCode || "").trim().toUpperCase();
      const seedSequences = sameSeries
        .map((seriesItem) => helpers.getLotSeriesSequence(seriesItem?.lotNumber))
        .filter((value): value is number => Number.isFinite(value));

      if (lotPrefix && seedSequences.length > 0) {
        const minSeq = Math.min(...seedSequences);
        const maxSeq = Math.max(...seedSequences);

        const expandedSeries = items.filter((candidate) => {
          if (!helpers.isSeriesEligibleItem(candidate)) return false;
          const candidatePrefix = helpers.getLotSeriesPrefix(candidate?.lotNumber);
          if (!candidatePrefix || candidatePrefix !== lotPrefix) return false;

          const candidateOrder = String(candidate?.orderId || "").trim().toUpperCase();
          if (orderKey && candidateOrder && candidateOrder !== orderKey) return false;

          const candidateItemCode = String(candidate?.itemCode || "").trim().toUpperCase();
          if (itemCodeKey && candidateItemCode && candidateItemCode !== itemCodeKey) return false;

          const candidateSeq = helpers.getLotSeriesSequence(candidate?.lotNumber);
          if (typeof candidateSeq !== "number" || !Number.isFinite(candidateSeq)) return false;

          return candidateSeq >= minSeq && candidateSeq <= maxSeq;
        });

        sameSeries = expandedSeries.sort((a, b) => {
          const aSeq = helpers.getLotSeriesSequence(a?.lotNumber) || 0;
          const bSeq = helpers.getLotSeriesSequence(b?.lotNumber) || 0;
          return aSeq - bSeq;
        });
      }
    }

    setBulkSeriesProducts(sameSeries.length > 1 ? sameSeries : []);
    setSelectedProduct(item);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setBulkSeriesProducts([]);
    setShowActionModal(false);
  };

  const handleOpenActionModal = () => {
    if (!selectedProduct) return;
    setShowActionModal(true);
  };

  const handleOpenAdjustOrderFromSelectedProduct = () => {
    if (!selectedProduct) return;
    setSelectedAdjustProduct(selectedProduct);
    setAdjustOrderSearch("");
    setSelectedAdjustTargetOrder(null);
    setShowAdjustOrderModal(true);
  };

  const handleOpenRequestNewOrderFromSelectedProduct = () => {
    if (!selectedProduct) return;
    setSelectedAdjustProduct(selectedProduct);
    setAdjustRequestNote("");
    setShowRequestNewOrderModal(true);
  };

  const handleReprintAdjustedOrderLabel = async (product: ProductItem, previousOrderId: string, newOrderId: string): Promise<string> => {
    const queuePrinter = await resolveQueuePrinterForPrint();
    const queuePrinterId = String(queuePrinter?.id || "").trim();
    const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
    if (!queuePrinterId) {
      throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
    }

    const templatesToPrint = resolvePreferredFlangeTemplatesForProduct(product);
    if (templatesToPrint.length === 0) {
      throw new Error("Geen flens-labeltemplate beschikbaar voor herprint na orderwijziging.");
    }

    const processedData = processLabelData(product);
    const diameter = helpers.getItemNominalDiameter(product);
    const copies = (diameter > 450 && diameter <= 700) ? 2 : 1;
    const zplChunks: string[] = [];

    for (let idx = 0; idx < templatesToPrint.length; idx++) {
      const templateToUse = templatesToPrint[idx];
      const zplCode = await renderLabelToBitmapZpl({
        template: templateToUse,
        data: processedData,
        printerDpi: mazakPrinterDpi,
        darkness: 15,
        printSpeed: 3,
        widthMm: Number(templateToUse?.width) || 90,
        heightMm: Number(templateToUse?.height) || 40,
      });

      if (!String(zplCode || "").trim()) {
        throw new Error(`Lege ZPL gegenereerd voor template ${String(templateToUse?.name || templateToUse?.id || "onbekend")}.`);
      }

      const isLastInBatch = idx === templatesToPrint.length - 1;
      zplChunks.push(helpers.applyBatchCutMode(zplCode, isLastInBatch, copies));
    }

    const batchPayload = zplChunks.join("\n");
    if (!batchPayload) {
      throw new Error("Geen geldige printpayload voor orderwijziging opgebouwd.");
    }

    const queuedJobId = await queuePrintJob(
      queuePrinterId,
      batchPayload,
      {
        description: `Mazak Herprint na orderwijziging ${previousOrderId} -> ${newOrderId}`,
        templateId: String(templatesToPrint[0]?.id || ""),
        templateName: templatesToPrint.length > 1 ? "Mazak Label Batch" : (templatesToPrint[0]?.name || "Mazak Label"),
        machineId: queueStationId,
        stationId: queueStationId,
        targetStation: queueStationId,
        targetPrinterName: queuePrinter?.name || queueStationId,
        orderId: newOrderId,
        previousOrderId,
        lotNumber: String(product?.lotNumber || product?.id || ""),
        lotNumbers: [String(product?.lotNumber || product?.id || "")].filter(Boolean),
        lotCount: 1,
        labelCount: templatesToPrint.length * copies,
        quantity: 1,
        isReprint: true,
        linkedSequenceTotal: templatesToPrint.length,
        linkedRootTemplateId: String(templatesToPrint[0]?.id || ""),
        cutMode: "last-only",
        queuedAsBatch: true,
        reason: "order-reassign",
      }
    );

    await markMazakLabelsPrinted({
      productIds: [String(product.id || product.lotNumber || "")].filter(Boolean),
      stationId,
      isReprint: true,
      source: "MazakView:adjust-order-reprint",
      actorLabel: user?.email || "Mazak Operator",
    });

    const normalizedJobId = helpers.extractQueuedJobId(queuedJobId);
    return normalizedJobId;
  };

  const handlePrintLabels = async () => {
    if (!selectedProduct || !selectedLabelId) return;

    setPrinting(true);
    
    try {
      const isReprint = activeTab === "process";
      const itemsToPrint = isBulkInboxMode ? bulkSeriesProducts : [selectedProduct];
      const templatesToPrint = effectiveTemplateChain;
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      const queuedJobIds: string[] = [];

      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      if (templatesToPrint.length === 0) {
        throw new Error("Geen geldig template geselecteerd.");
      }

      const zplChunks: string[] = [];
      const lotNumbersForBatch: string[] = [];

      for (let itemIdx = 0; itemIdx < itemsToPrint.length; itemIdx++) {
        const item = itemsToPrint[itemIdx];
        const processedData = processLabelData(item);
        lotNumbersForBatch.push(String(item?.lotNumber || "").trim());

        const diameter = helpers.getItemNominalDiameter(item);
        const copies = (diameter > 450 && diameter <= 700) ? 2 : 1;

        const itemZpls: Array<{ zpl: string; qty: number }> = [];

        for (let idx = 0; idx < templatesToPrint.length; idx++) {
          const templateToUse = templatesToPrint[idx];
          const zplCode = await renderLabelToBitmapZpl({
            template: templateToUse,
            data: processedData,
            printerDpi: mazakPrinterDpi,
            darkness: 15,
            printSpeed: 3,
            widthMm: Number(templateToUse?.width) || 90,
            heightMm: Number(templateToUse?.height) || 40,
          });

          if (!String(zplCode || "").trim()) {
            throw new Error(`Lege ZPL gegenereerd voor template ${String(templateToUse?.name || templateToUse?.id || "onbekend")}.`);
          }

          itemZpls.push({ zpl: zplCode, qty: copies });
        }
        
        // Pas de knip (cut) toe voor de hele batch: knip pas na het allerlaatste label van het allerlaatste product
        for (let i = 0; i < itemZpls.length; i++) {
          const isLastInBatch = itemIdx === itemsToPrint.length - 1 && i === itemZpls.length - 1;
          zplChunks.push(helpers.applyBatchCutMode(itemZpls[i].zpl, isLastInBatch, itemZpls[i].qty));
        }
      }

      const batchPayload = zplChunks.join("\n");
      if (!batchPayload) {
        throw new Error("Geen geldige batchpayload voor Mazak print opgebouwd.");
      }

      const queuedJobId = await queuePrintJob(
        queuePrinterId,
        batchPayload,
        {
          description: `${isReprint ? "Mazak Herprint" : "Mazak Print"} batch ${String(selectedProduct?.orderId || "-")} (${itemsToPrint.length} lot${itemsToPrint.length === 1 ? "" : "s"})`,
          templateId: String(selectedLabelId),
          templateName: templatesToPrint.length > 1 ? "Mazak Label Batch" : (templatesToPrint[0]?.name || "Mazak Label"),
          machineId: queueStationId,
          stationId: queueStationId,
          targetStation: queueStationId,
          targetPrinterName: queuePrinter?.name || queueStationId,
          orderId: selectedProduct?.orderId,
          lotNumber: lotNumbersForBatch[0] || selectedProduct?.lotNumber,
          lotNumbers: lotNumbersForBatch.filter(Boolean),
          lotCount: itemsToPrint.length,
          labelCount: totalLabelCount,
          quantity: 1, // De ZPL payload bevat al het exacte aantal labels, we sturen de hele bundel 1x door
          isReprint,
          linkedSequenceTotal: templatesToPrint.length,
          linkedRootTemplateId: String(selectedLabelId || ""),
          cutMode: "last-only",
          queuedAsBatch: true,
        }
      );

      const normalizedJobId = helpers.extractQueuedJobId(queuedJobId);
      if (!normalizedJobId) {
        throw new Error("Queue response bevat geen geldig jobId.");
      }

      const rootJobRef = doc(db, getPathString(PATHS.PRINT_QUEUE), normalizedJobId);
      const rootJobSnap = await getDoc(rootJobRef);
      if (!rootJobSnap.exists()) {
        const scopedSnap = await getDocs(
          query(
            collectionGroup(db, "items"),
            where("id", "==", normalizedJobId),
            where("_scopeType", "==", "print_queue"),
            limit(1)
          )
        );

        if (scopedSnap.empty) {
          throw new Error(`Queue job niet gevonden na aanmaak (jobId: ${normalizedJobId}).`);
        }
      }
      queuedJobIds.push(normalizedJobId);

      await markMazakLabelsPrinted({
        productIds: itemsToPrint.map((item) => item.id || item.lotNumber).filter(Boolean),
        stationId,
        isReprint,
        source: "MazakView",
        actorLabel: user?.email || "Mazak Operator",
      });

      await logActivity(
        user?.uid || "system",
        isReprint ? "REPRINT_LABELS" : "PRINT_LABELS",
        `Mazak: ${totalLabelCount} label(s) naar queue gestuurd voor ${selectedProduct.orderId} (Herprint: ${isReprint})`
      );

      setShowPrintModal(false);
      if (!isReprint) {
        setSelectedProduct(null);
        setBulkSeriesProducts([]);
        setActiveTab("process"); // Spring direct naar gereedmelden
      }
      notify(
        `${t(
          "mazak.labels_queued_success",
          "{{count}} label(s) succesvol naar de print wachtrij verstuurd!",
          { count: totalLabelCount }
        )}${queuedJobIds[0] ? ` (job: ${queuedJobIds[0]})` : ""}`
      );
    } catch (err) {
      console.error("Fout bij printen:", err);
      const message = err instanceof Error ? err.message : String(err || "Onbekende fout");
      notify(`${t("mazak.print_error", "Er is een fout opgetreden bij het printen.")}: ${message}`);
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintEmptyLabel = async () => {
    setPrinting(true);
    try {
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      await queuePrintJob(
        queuePrinterId,
        "~JK\\n^XA\\n^XZ",
        {
          description: "Leeg Label",
          machineId: queueStationId,
          stationId: queueStationId,
          targetStation: queueStationId,
          targetPrinterName: queuePrinter?.name || queueStationId,
          queuedAsBatch: true
        }
      );
      notify(t("mazak.empty_label_printed", "Leeg label wordt geprint."));
    } catch (err: unknown) {
      console.error(err);
      notify(err.message || t("mazak.print_failed", "Printen mislukt."));
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintLargeSequence = async (station: string, week: string, startLot: string, quantity: number, incremental: boolean) => {
    setPrinting(true);
    try {
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      const template: LabelTemplate = {
        id: "LARGE-SEQUENCE-100x25",
        name: "Grote Volgnummers 100x25",
        width: 100,
        height: 25,
        elements: [
          { type: "qr", x: 2, y: 3, size: 15, content: "{lotNumber}" },
          { type: "text", x: 19, y: 7, width: 80, height: 18, fontSize: 40, isBold: true, content: "{lotNumber}", maxLines: 1 }
        ]
      };

      const zplChunks: string[] = [];
      let currentSequence = BigInt(startLot);
      for (let i = 0; i < quantity; i++) {
        const lotNumberToPrint = incremental ? (currentSequence + BigInt(i)).toString().padStart(15, "0") : startLot;
        const zplCode = await renderLabelToBitmapZpl({
          template,
          data: { lotNumber: lotNumberToPrint },
          printerDpi: mazakPrinterDpi,
          darkness: 15,
          printSpeed: 3,
          widthMm: 100,
          heightMm: 25
        });
        const isLastInBatch = i === quantity - 1;
        zplChunks.push(helpers.applyBatchCutMode(zplCode, isLastInBatch, 1));
      }

      const batchPayload = zplChunks.join("\\n");
      await queuePrintJob(
        queuePrinterId,
        batchPayload,
        {
          description: `Grote volgnummers (${quantity}x)`,
          templateId: template.id,
          templateName: template.name,
          machineId: queueStationId,
          stationId: queueStationId,
          targetStation: queueStationId,
          targetPrinterName: queuePrinter?.name || queueStationId,
          labelCount: quantity,
          quantity: 1,
          queuedAsBatch: true
        }
      );

      notify(t("mazak.large_sequence_printed", "Grote volgnummers succesvol in de wachtrij geplaatst."));
      setShowLargeSequenceModal(false);
    } catch (err: unknown) {
      console.error(err);
      notify(err.message || t("mazak.print_failed", "Printen mislukt."));
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintFreeLabels = async (templateName: string, text: string, align: "left"|"center"|"right", vAlign: "top"|"center"|"bottom", fontSize: string, quantity: number) => {
    const normalizedFreeText = text.trim();
    const qty = Math.max(1, Math.min(50, Number(quantity) || 1));
    const normalizedFontSize = helpers.clampFreeLabelFontSize(fontSize);

    if (!normalizedFreeText) {
      notify(t("mazak.free_label_text_required", "Vul eerst vrije tekst in."));
      return;
    }

    setPrinting(true);
    try {
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      const labelTemplateOverride = {
        ...helpers.FREE_TEXT_LABEL_TEMPLATE,
        elements: helpers.FREE_TEXT_LABEL_TEMPLATE.elements?.map((el: LabelElement) => {
          if (el.type === 'text') {
            return {
              ...el,
              fontSize: normalizedFontSize,
              align: align,
              vAlign: vAlign,
            };
          }
          return el;
        })
      };

      const zplCode = await renderLabelToBitmapZpl({
        template: labelTemplateOverride,
        data: { text: normalizedFreeText },
        printerDpi: mazakPrinterDpi,
        darkness: 15,
        printSpeed: 3,
        widthMm: 100,
        heightMm: 25,
      });

      await queuePrintJob(
        queuePrinterId,
        helpers.applyBatchCutMode(zplCode, true, qty),
        {
          description: `Vrij label (${qty}x)`,
          templateId: helpers.FREE_TEXT_LABEL_TEMPLATE.id,
          templateName: helpers.FREE_TEXT_LABEL_TEMPLATE.name,
          machineId: queueStationId,
          stationId: queueStationId,
          targetStation: queueStationId,
          targetPrinterName: queuePrinter?.name || queueStationId,
          labelCount: qty,
          quantity: 1,
          queuedAsBatch: true
        }
      );
      notify(t("mazak.free_labels_queued", "{{count}} vrije labels in wachtrij geplaatst.", { count: qty }));
      setShowFreeLabelModal(false);
    } catch (err) {
      console.error("Fout bij printen vrije labels:", err);
      const message = err instanceof Error ? err.message : String(err || "Onbekende fout");
      notify(`${t("mazak.print_error", "Er is een fout opgetreden bij het printen.")}: ${message}`);
    } finally {
      setPrinting(false);
    }
  };

  const handleSaveFreeLabelTemplate = async (templateName: string, text: string, align: "left"|"center"|"right", vAlign: "top"|"center"|"bottom", fontSize: string, quantity: number) => {
    const normalizedName = templateName.trim();
    if (!normalizedName) return;
    
    setSavingFreeTemplate(true);
    try {
      const docRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
      const newTemplate = {
        id: crypto.randomUUID(),
        name: normalizedName,
        text,
        align,
        vAlign,
        fontSize: String(fontSize),
        quantity,
        updatedAt: Date.now()
      };
      
      // Update or add
      const existing = savedFreeLabelTemplates.filter(t => t.name !== normalizedName);
      const updatedList = [newTemplate, ...existing].slice(0, 50);
      
      await updateDoc(docRef, {
        mazakFreeLabelTemplates: updatedList
      });
    } catch (err: unknown) {
      console.error("Fout bij opslaan van template:", err);
      throw err;
    } finally {
      setSavingFreeTemplate(false);
    }
  };

  const handleDeleteFreeLabelTemplate = async (templateId: string) => {
    try {
      const docRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
      const updatedList = savedFreeLabelTemplates.filter(t => t.id !== templateId);
      await updateDoc(docRef, {
        mazakFreeLabelTemplates: updatedList
      });
      notify(t("mazak.template_deleted_success", "Template verwijderd."));
    } catch (err: unknown) {
      console.error(err);
      notify(t("mazak.template_deleted_error", "Fout bij verwijderen van template."));
    }
  };

  const handleManualPrintForward = async () => {
    if (!selectedProduct) return;

    const itemsToForward = isBulkInboxMode ? bulkSeriesProducts : [selectedProduct];
    if (!itemsToForward.length) return;

    setPrinting(true);
    try {
      await markMazakLabelsPrinted({
        productIds: itemsToForward.map((item) => item.id || item.lotNumber).filter(Boolean),
        stationId,
        isReprint: false,
        source: "MazakView:manual-forward",
        actorLabel: user?.email || "Mazak Operator",
      });

      await logActivity(
        user?.uid || "system",
        "MARK_MAZAK_LABELS_MANUAL",
        `Mazak: ${itemsToForward.length} lot(s) handmatig gelabeld en doorgestuurd voor ${selectedProduct.orderId || "onbekend"}`
      );

      setSelectedProduct(null);
      setBulkSeriesProducts([]);
      setActiveTab("process");

      notify(
        t(
          "mazak.manual_labels_forwarded",
          "{{count}} lot(s) handmatig gelabeld en doorgestuurd naar Gereedmelden.",
          { count: itemsToForward.length }
        )
      );
    } catch (err) {
      console.error("Fout bij handmatig labelen/doorgaan:", err);
      notify(t("mazak.manual_label_forward_error", "Handmatig labelen/doorgaan is mislukt."));
    } finally {
      setPrinting(false);
    }
  };

  const handlePostProcessingFinish = async (status: string, data: { note?: string; reasons?: string[] }, productOverride: ProductItem | null = null) => {
    const product = productOverride || selectedProduct;
    if (!product) return;
    const productId = product.id || product.lotNumber;

    try {
      if (status === "completed") {
        await completeTrackedProduct({
          productId,
          finishType: "forward",
          fromStation: stationId,
          note: data.note || "",
          actorLabel: user?.email,
          source: "MazakView",
        });
        setActiveTab("process");
        notify(t("mazak.process_success", "Lot {{lot}} is succesvol doorgestuurd.", { lot: product.lotNumber || productId }));
        if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
          handleCloseModal();
        }
        return;
      }

      if (status === "rejected") {
        await rejectTrackedProductFinal({
          productId,
          reasons: data.reasons || [],
          note: data.note || "",
          source: "MazakView",
          actorLabel: user?.email,
        });
        setActiveTab("process");
        notify(t("mazak.reject_success", "Lot {{lot}} is definitief afgekeurd.", { lot: product.lotNumber || productId }));
        if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
          handleCloseModal();
        }
        return;
      }

      await tempRejectTrackedProduct({
        productId,
        reasons: data.reasons || [],
        note: data.note || "",
        station: stationId,
        actorLabel: user?.email || "Operator",
        source: "MazakView",
      });
      await logActivity(
        user?.uid || "system",
        "QUALITY_TEMP_REJECT",
        `Mazak afhandeling: lot ${product.lotNumber || product.id}, status temp_reject`
      );

      setActiveTab("process");
      notify(t("mazak.temp_reject_success", "Lot {{lot}} is op tijdelijke afkeur gezet.", { lot: product.lotNumber || productId }));

      if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
        handleCloseModal();
      }
    } catch (error) {
      console.error("Fout bij Mazak afronden:", error);
      notify(t("mazak.process_error", "Verwerken is mislukt. Probeer opnieuw."));
    }
  };

  const handleSubmitOrderReassign = async () => {
    const product = selectedAdjustProduct;
    const targetOrder = selectedAdjustTargetOrder;
    const reason = String(adjustReason || "").trim();
    if (!product || !targetOrder?.orderId) {
      notify(t("mazak.adjust_target_order_required", "Selecteer eerst een doelorder."));
      return;
    }
    if (!reason) {
      notify(t("mazak.adjust_reason_required", "Geef een opmerking/reden op."));
      return;
    }

    const productId = String(product.id || product.lotNumber || "").trim();
    if (!productId) {
      notify(t("mazak.adjust_product_required", "Selecteer eerst een lot/product."));
      return;
    }

    setAdjustSubmitting(true);
    try {
      const previousOrderId = String(product.orderId || "").trim();
      const nextOrderId = String(targetOrder.orderId || "").trim();
      await reassignTrackedProductOrder({
        productId,
        newOrderId: nextOrderId,
        targetOrderDocId: String(targetOrder.id || targetOrder.orderDocId || "").trim(),
        targetOrderPath: String(targetOrder.orderDocPath || "").trim(),
        reason,
        source: "MazakView:adjust-order",
        actorLabel: user?.email || "Mazak Operator",
      });

      await logActivity(
        user?.uid || "system",
        "TRACKED_PRODUCT_ORDER_REASSIGN",
        `Mazak aanpassen: lot ${product.lotNumber || productId} verplaatst van ${product.orderId || "-"} naar ${nextOrderId}`
      );

      let reprintJobId = "";
      try {
        const productForReprint = { 
          ...product, 
          item: targetOrder.item || product.item,
          itemCode: targetOrder.itemCode || product.itemCode,
          productId: targetOrder.productId || product.productId,
          extraCode: targetOrder.extraCode || product.extraCode,
          
          // Wis verouderde productvelden zodat de label-parser zuiver de nieuwe orderdata pakt
          description: targetOrder.description || "",
          itemDescription: targetOrder.itemDescription || "",
          articleDescription: targetOrder.articleDescription || "",
          specs: targetOrder.specs || null,
          pn: targetOrder.pn || null,
          dn: targetOrder.dn || null,
          diameter: targetOrder.diameter || null,
          project: targetOrder.project || "",

          orderId: nextOrderId,
          orderNumber: nextOrderId,
          Order: nextOrderId,
          order: nextOrderId,
          originalOrderId: nextOrderId,
          Productieorder: nextOrderId
        };
        reprintJobId = await handleReprintAdjustedOrderLabel(productForReprint, previousOrderId || "-", nextOrderId);
      } catch (reprintErr) {
        const reprintWarning = reprintErr instanceof Error ? reprintErr.message : String(reprintErr || "Onbekende fout");
        console.error("Herprint na orderwijziging mislukt:", reprintErr);

        if (previousOrderId && previousOrderId.toUpperCase() !== nextOrderId.toUpperCase()) {
          try {
            await reassignTrackedProductOrder({
              productId,
              newOrderId: previousOrderId,
              reason: `Rollback na mislukte label-herprint (${reason})`,
              source: "MazakView:adjust-order-rollback",
              actorLabel: user?.email || "Mazak Operator",
            });

            await logActivity(
              user?.uid || "system",
              "TRACKED_PRODUCT_ORDER_REASSIGN_ROLLBACK",
              `Mazak rollback: lot ${product.lotNumber || productId} teruggezet van ${nextOrderId} naar ${previousOrderId} na mislukte herprint`
            );

            notify(
              `${t("mazak.adjust_reassign_error", "Ordernummer wijzigen is mislukt.")} ${t("mazak.adjust_reprint_warning", "Automatische label-herprint is mislukt.")}: ${reprintWarning}. ${t("mazak.adjust_rollback_done", "Wijziging is automatisch teruggedraaid.")}`
            );
            return;
          } catch (rollbackErr) {
            const rollbackMessage = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr || "Onbekende fout");
            console.error("Rollback na mislukte herprint is ook mislukt:", rollbackErr);
            notify(
              `${t("mazak.adjust_reassign_success", "Ordernummer gewijzigd: lot {{lot}} is nu gekoppeld aan order {{order}}.", { lot: product.lotNumber || productId, order: nextOrderId })} ${t("mazak.adjust_reprint_warning", "Automatische label-herprint is mislukt.")}: ${reprintWarning}. ${t("mazak.adjust_rollback_failed", "Rollback is mislukt; handmatige correctie nodig.")}: ${rollbackMessage}`
            );
            return;
          }
        }

        notify(
          `${t("mazak.adjust_reassign_success", "Ordernummer gewijzigd: lot {{lot}} is nu gekoppeld aan order {{order}}.", { lot: product.lotNumber || productId, order: nextOrderId })} ${t("mazak.adjust_reprint_warning", "Automatische label-herprint is mislukt.")}: ${reprintWarning}`
        );
        return;
      }

      setSelectedAdjustProduct((prev) => (prev ? { ...prev, orderId: nextOrderId } : prev));
      setSelectedAdjustTargetOrder(null);
      setAdjustReason("");
      notify(
        `${t(
          "mazak.adjust_reassign_success",
          "Ordernummer gewijzigd: lot {{lot}} is nu gekoppeld aan order {{order}}.",
          { lot: product.lotNumber || productId, order: nextOrderId }
        )}${reprintJobId ? ` (${t("mazak.adjust_reprint_job", "reprint job")}: ${reprintJobId})` : ""}`
      );
    } catch (error) {
      console.error("Fout bij ordernummer wijzigen in Mazak:", error);
      const message = error instanceof Error ? error.message : String(error || "Onbekende fout");
      notify(`${t("mazak.adjust_reassign_error", "Ordernummer wijzigen is mislukt.")}: ${message}`);
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleRequestNewOrderFromPlanner = async () => {
    const product = selectedAdjustProduct;
    const reason = String(adjustReason || "").trim();
    const requestNote = String(adjustRequestNote || "").trim();

    if (!product) {
      notify(t("mazak.adjust_product_required", "Selecteer eerst een lot/product."));
      return;
    }
    if (!reason) {
      notify(t("mazak.adjust_reason_required", "Geef een opmerking/reden op."));
      return;
    }

    const lotNumber = String(product.lotNumber || product.id || "onbekend");
    const currentOrder = String(product.orderId || "onbekend");
    const productType = String(product.item || product.itemCode || "onbekend");

    setAdjustSubmitting(true);
    try {
      await createProductionMessages({
        messages: [
          {
            from: user?.email || "Mazak Operator",
            senderId: user?.uid || "system",
            subject: `Nieuw ordernummer nodig voor lot ${lotNumber}`,
            content: [
              "Mazak Aanpassen: product verkeerd geboord en moet omgeboekt worden.",
              `Lotnummer: ${lotNumber}`,
              `Huidig ordernummer: ${currentOrder}`,
              `Type: ${productType}`,
              `Reden: ${reason}`,
              requestNote ? `Extra opmerking: ${requestNote}` : null,
            ].filter(Boolean).join("\n"),
            title: `Nieuw ordernummer nodig (${lotNumber})`,
            message: `Lot ${lotNumber} (${productType}) wacht op nieuw ordernummer. Reden: ${reason}`,
            priority: "high",
            type: "warning",
            source: "MazakView",
            targetRoles: ["teamleader", "planner", "admin"],
            targetGroup: "TEAMLEADERS_AND_PLANNERS",
            broadcastToAll: true,
            relatedLot: lotNumber,
            metadata: {
              kind: "mazak_order_reassign_request",
              lotNumber,
              currentOrderId: currentOrder,
              productType,
              reason,
              note: requestNote || null,
              station: stationId,
            },
          },
        ],
        source: "MazakView",
        actorLabel: user?.email || "Mazak Operator",
      });

      await logActivity(
        user?.uid || "system",
        "MAZAK_REASSIGN_REQUEST_NEW_ORDER",
        `Mazak aanpassen: nieuw ordernummer aangevraagd voor lot ${lotNumber} (huidig order ${currentOrder})`
      );

      setAdjustRequestNote("");
      notify(
        t(
          "mazak.adjust_request_sent",
          "Verzoek verstuurd naar Teamleader/Planner. Dit product blijft geparkeerd tot een nieuw ordernummer beschikbaar is."
        )
      );
      setShowRequestNewOrderModal(false);
    } catch (error) {
      console.error("Fout bij aanvragen nieuw ordernummer:", error);
      const message = error instanceof Error ? error.message : String(error || "Onbekende fout");
      notify(`${t("mazak.adjust_request_error", "Versturen van verzoek is mislukt.")}: ${message}`);
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleScan = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    const code = activeScanInput.trim().toUpperCase();
    if (!code) return;

    if (activeTab === "planning" || activeTab === "free") {
      setActiveScanInput("");
      return;
    }

    if (code === QR_CODE_OK_CONFIRMATION && selectedProduct) {
      if (activeTab === "inbox") {
        notify(t("mazak.must_print_before_approve", "Dit item moet eerst geprint worden voordat het goedgekeurd kan worden."));
        setActiveScanInput("");
        return;
      }
      setActiveScanInput("");
      await handlePostProcessingFinish("completed", { note: "Goedgekeurd via QR Scan" }, selectedProduct);
      return;
    }

    const listToSearch = activeTab === "inbox"
      ? inboxItems
      : activeTab === "process"
        ? processItems
        : adjustCandidates;
    const found = listToSearch.find(
      (item) =>
        String(item.lotNumber || "").toLowerCase() === code.toLowerCase() ||
        String(item.orderId || "").toLowerCase() === code.toLowerCase()
    );

    if (found) {
      if (activeTab === "adjust") {
        setSelectedAdjustProduct(found);
        setAdjustSearch(code);
      } else {
        handleItemClick(found);
      }
      setActiveScanInput("");
      if (activeTab === "process") {
        setTimeout(() => {
          setShowActionModal(true);
        }, 0);
      }
    } else {
      notify(t("lossen.item_not_found", "Item {{code}} niet gevonden", { code }));
      setActiveScanInput("");
      setSelectedProduct(null);
    }

    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  };

  const handleSelectTab = (tab: MazakTab) => {
    setActiveTab(tab);
    setSelectedProduct(null);
    setSelectedPlanningOrder(null);
    setBulkSeriesProducts([]);
  };

  return {
    handleItemClick,
    handleCloseModal,
    handleOpenActionModal,
    handleOpenAdjustOrderFromSelectedProduct,
    handleOpenRequestNewOrderFromSelectedProduct,
    handleReprintAdjustedOrderLabel,
    handlePrintLabels,
    handlePrintEmptyLabel,
    handlePrintLargeSequence,
    handlePrintFreeLabels,
    handleSaveFreeLabelTemplate,
    handleDeleteFreeLabelTemplate,
    handleManualPrintForward,
    handlePostProcessingFinish,
    handleSubmitOrderReassign,
    handleRequestNewOrderFromPlanner,
    handleScan,
    handleSelectTab
  };
};
