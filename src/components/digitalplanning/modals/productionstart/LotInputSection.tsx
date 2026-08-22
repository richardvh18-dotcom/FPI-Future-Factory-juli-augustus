import React from "react";
import { useTranslation } from "react-i18next";
import {
  PlayCircle, Printer, RefreshCw, QrCode, Layers, X, Keyboard, Activity, FileText, AlertTriangle, CheckCircle2, Loader2, Database, Cpu
} from "lucide-react";
import { useProductionStart } from "./useProductionStart";

export const LotInputSection = ({ state }: { state: Exclude<ReturnType<typeof useProductionStart>, null> }) => {
  const { order, isOpen, onClose, onStartInitiated, onStart, onOpenProductInfo, stationId, existingProducts, addOperation, updateOperation, removeOperation, mode, setMode, lotNumber, setLotNumber, stringCount, setStringCount, labelCount, setLabelCount, manualLotInput, setManualLotInput, selectedTemplateIds, setSelectedTemplateIds, manualOrderInput, setManualOrderInput, assignedOperators, setAssignedOperators, operatorInput, setOperatorInput, previewLotIndex, setPreviewLotIndex, orderInputRef, lotInputRef, manualLotAutoStartTimeoutRef, lotRefreshRunIdRef, lastLotInputAtRef, previousLotInputRef, scannerLikeLotInputRef, lastResetKeyRef, orderValidated, setOrderValidated, orderError, setOrderError, selectedLabelId, setSelectedLabelId, previewZoom, setPreviewZoom, location, savedPrinters, setSavedPrinters, generalSettings, setGeneralSettings, dynamicPrintRules, setDynamicPrintRules, toolingMolds, setToolingMolds, relatedItemCodes, setRelatedItemCodes, printConfig, setPrintConfig, containerRef, previewAreaRef, counterPermissionWarnedRef, lotExistsCacheRef, isCheckingLot, setIsCheckingLot, isAutoLotRefreshing, setIsAutoLotRefreshing, lotError, setLotError, isStarting, setIsStarting, robotPosition, setRobotPosition, manualMinimumSeq, setManualMinimumSeq, manualPoolHint, setManualPoolHint, isManualMode, shouldAutoFocusInputs, flangeSeriesInfo, isFlangeOrder, normalizedStation, normalizedStationNoPrefix, isBh11OrBh15Station, isBh12Station, isSleevelessCoupler, hasFlangeIndicator, shouldUseFlangeLabelFlow, sanitizePositiveIntInput, normalizePositiveIntInput, printerHasStation, resolveTargetPrinter, resolveTargetPrinterAsync, productForPreview, matchedOperatorPrintRule, availableLabels, selectableLabels, checkLotNumberExists, getHighestSequenceForBaseLot, consumeRecycledSequence, claimAutoLotRange, claimAutoLotRangeWithoutCounter, updateCounterOnStart, handleManualOrderChange, isLotMachineValidationExempt, validateLotMachineCode, handleManualLotChange, canStartManual, canStartAuto, handleStartProduction, handleManualLotKeyDown, selectedOperatorName, showPreviewPane, normalizedStationId, supportsStringLotBatch, previewStringCount, stringLotPreview, shouldShowStringLotPreview, isCompactAutoLayout, currentPreviewLot, activePreviewData } = state;
  const { t } = useTranslation();

  return (
    <div className={`${isCompactAutoLayout ? "space-y-2" : "space-y-3"} animate-in slide-in-from-top-2 text-left`}>
                <div className={`bg-slate-900 ${isCompactAutoLayout ? "p-3" : "p-4"} rounded-2xl text-center shadow-xl border border-white/5 relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 p-3 opacity-5">
                    <QrCode size={48} />
                  </div>
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.3em] block mb-1.5">
                    {t("productionStartModal.labels.currentLotNumber", "Huidig lotnummer")}
                  </span>
                  <div className="flex justify-center items-center gap-2">
                    <div className={`text-2xl font-mono font-black ${lotError ? 'text-red-400' : 'text-white'} italic tracking-tighter`}>
                      {lotNumber || t("productionStartModal.labels.loading")}
                    </div>
                    {isAutoLotRefreshing && <Loader2 className="animate-spin text-white/50" size={16} />}
                  </div>
                  {lotError && <p className="text-red-400 text-xs mt-2 font-bold">{lotError}</p>}
                </div>
                {mode !== "qc_steekproef" && (
                  <div className={`${isCompactAutoLayout ? "space-y-0.5" : "space-y-1"} text-left`}>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    {t("productionStartModal.labels.totalQuantity", "Totaal aantal")}
                  </label>
                  <div className={`flex items-center gap-3 bg-white ${isCompactAutoLayout ? "p-2.5" : "p-3"} rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm`}>
                    <Layers size={18} className="text-blue-500" />
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      enterKeyHint="done"
                      min="1"
                      value={stringCount}
                      onChange={(e) => setStringCount(sanitizePositiveIntInput(e.target.value))}
                      onBlur={() => setStringCount((prev) => normalizePositiveIntInput(prev))}
                      className="w-full font-black text-slate-800 outline-none text-lg"
                    />
                  </div>
                  {isFlangeOrder && (
                    <p className="text-[10px] font-bold text-emerald-700 mt-1 ml-1">
                      {`Mal ${String(
                        flangeSeriesInfo?.matchedTooling?.name ||
                        flangeSeriesInfo?.matchedTooling?.itemCode ||
                        flangeSeriesInfo?.matchedRule?.matcher ||
                        t("productionStartModal.labels.defaultTooling")
                      )} • ${String(stringCount)} stuks`}
                    </p>
                  )}
                </div>
                )}
                {!isFlangeOrder && mode !== "qc_steekproef" && (
                  <div className={`${isCompactAutoLayout ? "space-y-0.5" : "space-y-1"} text-left`}>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                      {t("productionStartModal.labels.labelsToPrint", "Aantal labels printen")}
                    </label>
                    <div className={`flex items-center gap-3 bg-white ${isCompactAutoLayout ? "p-2.5" : "p-3"} rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm`}>
                      <Printer size={18} className="text-blue-500" />
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        enterKeyHint="done"
                        min="1"
                        value={labelCount}
                        onChange={(e) => setLabelCount(sanitizePositiveIntInput(e.target.value))}
                        onBlur={() => setLabelCount((prev) => normalizePositiveIntInput(prev))}
                        className="w-full font-black text-slate-800 outline-none text-lg"
                      />
                    </div>
                  </div>
                )}
                {isFlangeOrder && (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold">
                    {t("productionStartModal.labels.flangePrintLater", "Voor flenzen worden bij start geen labels geprint. Labelprint gebeurt later bij Mazak.")}
                  </div>
                )}
              </div>
  );
};
