import React from "react";
import { useTranslation } from "react-i18next";
import {
  PlayCircle, Printer, RefreshCw, QrCode, Layers, X, Keyboard, Activity, FileText, AlertTriangle, CheckCircle2, Loader2, Database, Cpu
} from "lucide-react";
import { useProductionStart } from "./useProductionStart";

export const RobotPositionSelection = ({ state }: { state: Exclude<ReturnType<typeof useProductionStart>, null> }) => {
  const { order, isOpen, onClose, onStartInitiated, onStart, onOpenProductInfo, stationId, existingProducts, addOperation, updateOperation, removeOperation, mode, setMode, lotNumber, setLotNumber, stringCount, setStringCount, labelCount, setLabelCount, manualLotInput, setManualLotInput, selectedTemplateIds, setSelectedTemplateIds, manualOrderInput, setManualOrderInput, assignedOperators, setAssignedOperators, operatorInput, setOperatorInput, previewLotIndex, setPreviewLotIndex, orderInputRef, lotInputRef, manualLotAutoStartTimeoutRef, lotRefreshRunIdRef, lastLotInputAtRef, previousLotInputRef, scannerLikeLotInputRef, lastResetKeyRef, orderValidated, setOrderValidated, orderError, setOrderError, selectedLabelId, setSelectedLabelId, previewZoom, setPreviewZoom, location, savedPrinters, setSavedPrinters, generalSettings, setGeneralSettings, dynamicPrintRules, setDynamicPrintRules, toolingMolds, setToolingMolds, relatedItemCodes, setRelatedItemCodes, printConfig, setPrintConfig, containerRef, previewAreaRef, counterPermissionWarnedRef, lotExistsCacheRef, isCheckingLot, setIsCheckingLot, isAutoLotRefreshing, setIsAutoLotRefreshing, lotError, setLotError, isStarting, setIsStarting, robotPosition, setRobotPosition, manualMinimumSeq, setManualMinimumSeq, manualPoolHint, setManualPoolHint, isManualMode, shouldAutoFocusInputs, flangeSeriesInfo, isFlangeOrder, normalizedStation, normalizedStationNoPrefix, isBh11OrBh15Station, isBh12Station, isSleevelessCoupler, hasFlangeIndicator, shouldUseFlangeLabelFlow, sanitizePositiveIntInput, normalizePositiveIntInput, printerHasStation, resolveTargetPrinter, resolveTargetPrinterAsync, productForPreview, matchedOperatorPrintRule, availableLabels, selectableLabels, checkLotNumberExists, getHighestSequenceForBaseLot, consumeRecycledSequence, claimAutoLotRange, claimAutoLotRangeWithoutCounter, updateCounterOnStart, handleManualOrderChange, isLotMachineValidationExempt, validateLotMachineCode, handleManualLotChange, canStartManual, canStartAuto, handleStartProduction, handleManualLotKeyDown, selectedOperatorName, showPreviewPane, normalizedStationId, supportsStringLotBatch, previewStringCount, stringLotPreview, shouldShowStringLotPreview, isCompactAutoLayout, currentPreviewLot, activePreviewData } = state;
  const { t } = useTranslation();

  return (
    <div className="p-3 bg-cyan-950/10 border-2 border-cyan-500/30 rounded-2xl space-y-1.5 text-left shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-cyan-600 text-white rounded-md">
                    <Cpu size={12} />
                  </div>
                  <span className="text-[9px] font-black text-cyan-700 uppercase tracking-widest">
                    {t("productionStartModal.robotPositionTitle", "Wikkelrobot Positie (BH18)")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setRobotPosition(1)}
                    className={`py-2 px-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border ${
                      robotPosition === 1
                        ? "bg-cyan-600 text-white border-cyan-500 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${robotPosition === 1 ? "bg-white" : "bg-slate-300"}`} />
                    {t("productionStartModal.pos1", "Positie 1 (STN1)")}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRobotPosition(2)}
                    className={`py-2 px-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border ${
                      robotPosition === 2
                        ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${robotPosition === 2 ? "bg-white" : "bg-slate-300"}`} />
                    {t("productionStartModal.pos2", "Positie 2 (STN2)")}
                  </button>
                </div>
              </div>
  );
};
