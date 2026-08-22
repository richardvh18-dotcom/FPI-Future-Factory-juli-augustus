import React from "react";
import { useTranslation } from "react-i18next";
import {
  PlayCircle, Printer, RefreshCw, QrCode, Layers, X, Keyboard, Activity, FileText, AlertTriangle, CheckCircle2, Loader2, Database, Cpu
} from "lucide-react";
import { useProductionStart } from "./useProductionStart";

export const OrderInfoCard = ({ state }: { state: Exclude<ReturnType<typeof useProductionStart>, null> }) => {
  const { order, isOpen, onClose, onStartInitiated, onStart, onOpenProductInfo, stationId, existingProducts, addOperation, updateOperation, removeOperation, mode, setMode, lotNumber, setLotNumber, stringCount, setStringCount, labelCount, setLabelCount, manualLotInput, setManualLotInput, selectedTemplateIds, setSelectedTemplateIds, manualOrderInput, setManualOrderInput, assignedOperators, setAssignedOperators, operatorInput, setOperatorInput, previewLotIndex, setPreviewLotIndex, orderInputRef, lotInputRef, manualLotAutoStartTimeoutRef, lotRefreshRunIdRef, lastLotInputAtRef, previousLotInputRef, scannerLikeLotInputRef, lastResetKeyRef, orderValidated, setOrderValidated, orderError, setOrderError, selectedLabelId, setSelectedLabelId, previewZoom, setPreviewZoom, location, savedPrinters, setSavedPrinters, generalSettings, setGeneralSettings, dynamicPrintRules, setDynamicPrintRules, toolingMolds, setToolingMolds, relatedItemCodes, setRelatedItemCodes, printConfig, setPrintConfig, containerRef, previewAreaRef, counterPermissionWarnedRef, lotExistsCacheRef, isCheckingLot, setIsCheckingLot, isAutoLotRefreshing, setIsAutoLotRefreshing, lotError, setLotError, isStarting, setIsStarting, robotPosition, setRobotPosition, manualMinimumSeq, setManualMinimumSeq, manualPoolHint, setManualPoolHint, isManualMode, shouldAutoFocusInputs, flangeSeriesInfo, isFlangeOrder, normalizedStation, normalizedStationNoPrefix, isBh11OrBh15Station, isBh12Station, isSleevelessCoupler, hasFlangeIndicator, shouldUseFlangeLabelFlow, sanitizePositiveIntInput, normalizePositiveIntInput, printerHasStation, resolveTargetPrinter, resolveTargetPrinterAsync, productForPreview, matchedOperatorPrintRule, availableLabels, selectableLabels, checkLotNumberExists, getHighestSequenceForBaseLot, consumeRecycledSequence, claimAutoLotRange, claimAutoLotRangeWithoutCounter, updateCounterOnStart, handleManualOrderChange, isLotMachineValidationExempt, validateLotMachineCode, handleManualLotChange, canStartManual, canStartAuto, handleStartProduction, handleManualLotKeyDown, selectedOperatorName, showPreviewPane, normalizedStationId, supportsStringLotBatch, previewStringCount, stringLotPreview, shouldShowStringLotPreview, isCompactAutoLayout, currentPreviewLot, activePreviewData } = state;
  const { t } = useTranslation();

  return (
    <div className={`bg-white ${isCompactAutoLayout ? "p-3" : "p-4"} rounded-2xl border-2 border-slate-100 shadow-sm text-left`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1.5 bg-slate-900 text-white rounded-lg">
                  <FileText size={14} />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {t("productionStartModal.labels.workOrder", "Werkorder")}
                </span>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none italic">
                {order.orderId}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 mt-1.5 truncate uppercase">
                {order.item}
              </p>
              {order.drawing && (
                <div className="mt-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t("productionStartModal.labels.drawing", "Tekening")}</span>
                  
                  <p className="text-xs font-bold text-slate-700">{order.drawing}</p>
                </div>
              )}
              {order.notes && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t("productionStartModal.labels.poTextNotes", "PO-tekst / opmerkingen")}</span>
                  <p className="text-xs font-medium text-slate-600 italic mt-1 max-h-20 overflow-y-auto pr-1 leading-snug break-words custom-scrollbar">
                    {order.notes}
                  </p>
                </div>
              )}
            </div>
  );
};
