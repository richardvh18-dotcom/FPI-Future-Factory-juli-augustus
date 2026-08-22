import React from "react";
import { useTranslation } from "react-i18next";
import { PlayCircle, Printer, RefreshCw, QrCode, Layers, X, Keyboard, Activity, FileText, AlertTriangle, CheckCircle2, Loader2, Database, Cpu } from "lucide-react";
import { useProductionStart } from "./useProductionStart";
import LabelVisualPreview from "../../../printer/LabelVisualPreview";
import InternalQrImage from "../../../../utils/InternalQrImage";

export const PreviewPane = ({ state }: { state: Exclude<ReturnType<typeof useProductionStart>, null> }) => {
  const { order, isOpen, onClose, onStartInitiated, onStart, onOpenProductInfo, stationId, existingProducts, addOperation, updateOperation, removeOperation, mode, setMode, lotNumber, setLotNumber, stringCount, setStringCount, labelCount, setLabelCount, manualLotInput, setManualLotInput, selectedTemplateIds, setSelectedTemplateIds, manualOrderInput, setManualOrderInput, assignedOperators, setAssignedOperators, operatorInput, setOperatorInput, previewLotIndex, setPreviewLotIndex, orderInputRef, lotInputRef, manualLotAutoStartTimeoutRef, lotRefreshRunIdRef, lastLotInputAtRef, previousLotInputRef, scannerLikeLotInputRef, lastResetKeyRef, orderValidated, setOrderValidated, orderError, setOrderError, selectedLabelId, setSelectedLabelId, previewZoom, setPreviewZoom, location, savedPrinters, setSavedPrinters, generalSettings, setGeneralSettings, dynamicPrintRules, setDynamicPrintRules, toolingMolds, setToolingMolds, relatedItemCodes, setRelatedItemCodes, printConfig, setPrintConfig, containerRef, previewAreaRef, counterPermissionWarnedRef, lotExistsCacheRef, isCheckingLot, setIsCheckingLot, isAutoLotRefreshing, setIsAutoLotRefreshing, lotError, setLotError, isStarting, setIsStarting, robotPosition, setRobotPosition, manualMinimumSeq, setManualMinimumSeq, manualPoolHint, setManualPoolHint, isManualMode, shouldAutoFocusInputs, flangeSeriesInfo, isFlangeOrder, normalizedStation, normalizedStationNoPrefix, isBh11OrBh15Station, isBh12Station, isSleevelessCoupler, hasFlangeIndicator, shouldUseFlangeLabelFlow, sanitizePositiveIntInput, normalizePositiveIntInput, printerHasStation, resolveTargetPrinter, resolveTargetPrinterAsync, productForPreview, matchedOperatorPrintRule, availableLabels, selectableLabels, checkLotNumberExists, getHighestSequenceForBaseLot, consumeRecycledSequence, claimAutoLotRange, claimAutoLotRangeWithoutCounter, updateCounterOnStart, handleManualOrderChange, isLotMachineValidationExempt, validateLotMachineCode, handleManualLotChange, canStartManual, canStartAuto, handleStartProduction, handleManualLotKeyDown, selectedOperatorName, showPreviewPane, normalizedStationId, supportsStringLotBatch, previewStringCount, stringLotPreview, shouldShowStringLotPreview, isCompactAutoLayout, currentPreviewLot, activePreviewData, selectedLabel } = state;
  const { t } = useTranslation();

  return (
    <>
        {/* RECHTS: DESIGN PREVIEW & PRINT ACTIE */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 bg-slate-900 p-6 flex flex-col items-center justify-between relative overflow-hidden text-left"
        >
          <div className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 text-left">
            <Activity size={12} className="text-emerald-500" /> {t("productionStartModal.labels.labelPreview", "Etiket preview")}
          </div>

          <div ref={previewAreaRef} className="flex-1 flex flex-col items-center justify-center w-full min-h-0 py-4">
            {mode === "manual" && (!manualLotInput || !manualOrderInput) ? (
              <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] text-xs uppercase font-black tracking-widest italic">
                {t("productionStartModal.labels.fillOrderAndLot")}
              </div>
            ) : (
              selectedLabel ? (
                <div className="flex flex-col items-center gap-4">
                  <LabelVisualPreview
                    label={selectedLabel as unknown}
                    data={activePreviewData}
                    zoom={previewZoom}
                    className="shadow-[0_0_100px_rgba(0,0,0,0.8)] relative transition-all duration-500 origin-center border-2 border-white/10"
                  />
                  {previewStringCount > 1 && (
                    <div className="flex items-center gap-3 bg-black/40 border border-white/10 px-4 py-2 rounded-xl text-xs text-white z-10">
                      <button
                        type="button"
                        onClick={() => setPreviewLotIndex(prev => Math.max(0, prev - 1))}
                        disabled={previewLotIndex === 0}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                      >
                        &larr; {t("common.previous", "Vorige")}
                      </button>
                      <span className="font-bold font-mono text-[11px] tracking-wide text-slate-300">
                        Label {previewLotIndex + 1} / {previewStringCount} ({String(currentPreviewLot).slice(-4)})
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewLotIndex(prev => Math.min(previewStringCount - 1, prev + 1))}
                        disabled={previewLotIndex >= previewStringCount - 1}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                      >
                        {t("common.next", "Volgende")} &rarr;
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] animate-pulse text-xs uppercase font-black tracking-widest italic">
                  {t("productionStartModal.labels.loadingDesign")}
                </div>
              )
            )}
          </div>

          {shouldShowStringLotPreview && (
            <div className="w-full max-w-2xl bg-black/25 border border-white/10 rounded-2xl p-4 mb-3 text-left">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">
                  {t("productionStartModal.labels.stringLotPreview", "String lot-preview (BH11/BH12)")}
                </p>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  {stringLotPreview.valid
                    ? t("productionStartModal.labels.stringLotRowsSummary", { count: stringLotPreview.rows.length })
                    : t("productionStartModal.labels.waitingForValidStartLot")}
                </p>
              </div>

              {stringLotPreview.valid ? (
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                  {stringLotPreview.rows.map((lotRow, idx) => (
                    <div key={lotRow} className="flex items-center gap-3 bg-white/95 rounded-xl px-3 py-2 border border-slate-200">
                      <span className="text-[10px] font-black text-slate-500 w-6">{idx + 1}.</span>
                      <div className="w-8 h-8 rounded border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        <InternalQrImage
                          value={lotRow}
                          size={96}
                          alt="Lot QR"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <span className="text-xs font-black tracking-wider text-slate-900">{lotRow}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-200">
                    <span className="text-[10px] font-black text-emerald-700 w-6">{stringLotPreview.rows.length + 1}.</span>
                    <div className="w-8 h-8 rounded border border-emerald-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                      <InternalQrImage
                        value={isManualMode ? (manualOrderInput || order.orderId) : order.orderId}
                        size={96}
                        alt="Order QR"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-xs font-black tracking-wider text-emerald-900">
                      {t("productionStartModal.labels.order", "Order")} {isManualMode ? (manualOrderInput || order.orderId) : order.orderId}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] font-bold text-amber-200">
                  {t("productionStartModal.labels.noValidStartLotForPreview")}
                </p>
              )}
            </div>
          )}

          {/* --- AUTO LOT NUMBER EDITOR --- */}
          {mode !== "manual" && lotNumber && lotNumber.length >= 11 && (
            <div className="w-full max-w-sm bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md mb-2 flex flex-col gap-3 animate-in slide-in-from-bottom-6 duration-700 text-center">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                <QrCode size={12} className="text-cyan-400" />
                Aanpasbaar Lotnummer
              </span>
              <div className="flex items-center justify-center gap-1 font-mono text-lg font-black text-white">
                <span className="text-slate-400">{lotNumber.slice(0, 4)}</span>
                <input 
                  key={`week-${lotNumber}`}
                  type="text" 
                  defaultValue={lotNumber.slice(4, 6)}
                  onBlur={(e) => {
                    const val = e.target.value.replace(/\D/g, '').padStart(2, '0').slice(-2);
                    e.target.value = val;
                    const baseLot = lotNumber.slice(0, 4) + val + lotNumber.slice(6, 11);
                    const weekSuffix = lotNumber.slice(2, 4) + val;
                    (async () => {
                      setIsCheckingLot(true);
                      try {
                        const highestSeq = await getHighestSequenceForBaseLot(baseLot, stationId, weekSuffix);
                        let counter = highestSeq + 1;
                        let candidateLot = `${baseLot}${String(counter).padStart(4, '0')}`;
                        while (await checkLotNumberExists(candidateLot)) {
                          counter++;
                          candidateLot = `${baseLot}${String(counter).padStart(4, '0')}`;
                          if (counter > 9999) break;
                        }
                        setLotNumber(candidateLot);
                        setLotError("");
                      } catch (err) {
                        console.error("Fout bij ophalen volgnummer voor gewijzigde week:", err);
                        const fallbackLot = baseLot + lotNumber.slice(11);
                        setLotNumber(fallbackLot);
                        const exists = await checkLotNumberExists(fallbackLot);
                        setLotError(exists ? "Dit lotnummer is al in gebruik." : "");
                      } finally {
                        setIsCheckingLot(false);
                      }
                    })();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className={`w-8 text-center bg-white/10 border-b-2 outline-none focus:bg-white/20 px-0.5 rounded-t ${lotError ? "border-red-500 text-red-400" : "border-cyan-500 text-cyan-300"}`}
                  maxLength={2}
                />
                <span className="text-slate-400">{lotNumber.slice(6, 11)}</span>
                <input 
                  key={`seq-${lotNumber}`}
                  type="text" 
                  defaultValue={lotNumber.slice(11).padStart(4, '0').slice(-4)}
                  onBlur={(e) => {
                    const val = e.target.value.replace(/\D/g, '').padStart(4, '0').slice(-4);
                    e.target.value = val;
                    const newLot = lotNumber.slice(0, 11) + val;
                    setLotNumber(newLot);
                    (async () => {
                      setIsCheckingLot(true);
                      const exists = await checkLotNumberExists(newLot);
                      setLotError(exists ? "Dit lotnummer is al in gebruik." : "");
                      setIsCheckingLot(false);
                    })();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className={`w-14 text-center bg-white/10 border-b-2 outline-none focus:bg-white/20 px-0.5 rounded-t ${lotError ? "border-red-500 text-red-400" : "border-cyan-500 text-cyan-300"}`}
                  maxLength={4}
                />
              </div>
              <p className="text-[8px] text-slate-500 text-center font-bold uppercase tracking-tighter opacity-50">
                Pas de week of het volgnummer aan indien nodig
              </p>
              {lotError && (
                <p className="text-xs font-bold text-red-400 text-center px-2 animate-in slide-in-from-top-1">
                  {lotError}
                </p>
              )}
            </div>
          )}

        </div>
    </>
  );
};
