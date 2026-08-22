import React from "react";
import { useTranslation } from "react-i18next";
import {
  PlayCircle, Printer, RefreshCw, QrCode, Layers, X, Keyboard, Activity, FileText, AlertTriangle, CheckCircle2, Loader2, Database, Cpu
} from "lucide-react";
import { useProductionStart } from "./useProductionStart";

export const OperatorSelection = ({ state }: { state: Exclude<ReturnType<typeof useProductionStart>, null> }) => {
  const { order, isOpen, onClose, onStartInitiated, onStart, onOpenProductInfo, stationId, existingProducts, addOperation, updateOperation, removeOperation, mode, setMode, lotNumber, setLotNumber, stringCount, setStringCount, labelCount, setLabelCount, manualLotInput, setManualLotInput, selectedTemplateIds, setSelectedTemplateIds, manualOrderInput, setManualOrderInput, assignedOperators, setAssignedOperators, operatorInput, setOperatorInput, previewLotIndex, setPreviewLotIndex, orderInputRef, lotInputRef, manualLotAutoStartTimeoutRef, lotRefreshRunIdRef, lastLotInputAtRef, previousLotInputRef, scannerLikeLotInputRef, lastResetKeyRef, orderValidated, setOrderValidated, orderError, setOrderError, selectedLabelId, setSelectedLabelId, previewZoom, setPreviewZoom, location, savedPrinters, setSavedPrinters, generalSettings, setGeneralSettings, dynamicPrintRules, setDynamicPrintRules, toolingMolds, setToolingMolds, relatedItemCodes, setRelatedItemCodes, printConfig, setPrintConfig, containerRef, previewAreaRef, counterPermissionWarnedRef, lotExistsCacheRef, isCheckingLot, setIsCheckingLot, isAutoLotRefreshing, setIsAutoLotRefreshing, lotError, setLotError, isStarting, setIsStarting, robotPosition, setRobotPosition, manualMinimumSeq, setManualMinimumSeq, manualPoolHint, setManualPoolHint, isManualMode, shouldAutoFocusInputs, flangeSeriesInfo, isFlangeOrder, normalizedStation, normalizedStationNoPrefix, isBh11OrBh15Station, isBh12Station, isSleevelessCoupler, hasFlangeIndicator, shouldUseFlangeLabelFlow, sanitizePositiveIntInput, normalizePositiveIntInput, printerHasStation, resolveTargetPrinter, resolveTargetPrinterAsync, productForPreview, matchedOperatorPrintRule, availableLabels, selectableLabels, checkLotNumberExists, getHighestSequenceForBaseLot, consumeRecycledSequence, claimAutoLotRange, claimAutoLotRangeWithoutCounter, updateCounterOnStart, handleManualOrderChange, isLotMachineValidationExempt, validateLotMachineCode, handleManualLotChange, canStartManual, canStartAuto, handleStartProduction, handleManualLotKeyDown, selectedOperatorName, showPreviewPane, normalizedStationId, supportsStringLotBatch, previewStringCount, stringLotPreview, shouldShowStringLotPreview, isCompactAutoLayout, currentPreviewLot, activePreviewData } = state;
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                {mode === "qc_steekproef" ? "QC medewerker (Nr)" : t("productionStartModal.labels.operatorNumber", "Operator (nr)")}
              </label>
              {assignedOperators.length > 1 ? (
                <div className="relative">
                  <select
                    value={operatorInput}
                    onChange={(e) => setOperatorInput(e.target.value)}
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-600 shadow-sm appearance-none cursor-pointer"
                  >
                    <option value="">{t("productionStartModal.placeholders.chooseOperator")}</option>
                    {assignedOperators.map((op) => (
                      <option key={op.number} value={op.number}>
                        {op.number} - {op.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ▼
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={operatorInput}
                  onChange={(e) => setOperatorInput(e.target.value)}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-600 shadow-sm"
                  placeholder={t("productionStartModal.placeholders.employeeNumber")}
                />
              )}
            </div>
  );
};
