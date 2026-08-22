import React from "react";
import { useTranslation } from "react-i18next";
import { PlayCircle, Printer, RefreshCw, QrCode, Layers, X, Keyboard, Activity, FileText, AlertTriangle, CheckCircle2, Loader2, Database, Cpu } from "lucide-react";
import { useProductionStart, isBh18Station } from "./useProductionStart";
import LabelVisualPreview from "../../../printer/LabelVisualPreview";
import InternalQrImage from "../../../../utils/InternalQrImage";

export const ConfigPanel = ({ state }: { state: Exclude<ReturnType<typeof useProductionStart>, null> }) => {
  const { order, isOpen, onClose, onStartInitiated, onStart, onOpenProductInfo, stationId, existingProducts, addOperation, updateOperation, removeOperation, mode, setMode, lotNumber, setLotNumber, stringCount, setStringCount, labelCount, setLabelCount, manualLotInput, setManualLotInput, selectedTemplateIds, setSelectedTemplateIds, manualOrderInput, setManualOrderInput, assignedOperators, setAssignedOperators, operatorInput, setOperatorInput, previewLotIndex, setPreviewLotIndex, orderInputRef, lotInputRef, manualLotAutoStartTimeoutRef, lotRefreshRunIdRef, lastLotInputAtRef, previousLotInputRef, scannerLikeLotInputRef, lastResetKeyRef, orderValidated, setOrderValidated, orderError, setOrderError, selectedLabelId, setSelectedLabelId, previewZoom, setPreviewZoom, location, savedPrinters, setSavedPrinters, generalSettings, setGeneralSettings, dynamicPrintRules, setDynamicPrintRules, toolingMolds, setToolingMolds, relatedItemCodes, setRelatedItemCodes, printConfig, setPrintConfig, containerRef, previewAreaRef, counterPermissionWarnedRef, lotExistsCacheRef, isCheckingLot, setIsCheckingLot, isAutoLotRefreshing, setIsAutoLotRefreshing, lotError, setLotError, isStarting, setIsStarting, robotPosition, setRobotPosition, manualMinimumSeq, setManualMinimumSeq, manualPoolHint, setManualPoolHint, isManualMode, shouldAutoFocusInputs, flangeSeriesInfo, isFlangeOrder, normalizedStation, normalizedStationNoPrefix, isBh11OrBh15Station, isBh12Station, isSleevelessCoupler, hasFlangeIndicator, shouldUseFlangeLabelFlow, sanitizePositiveIntInput, normalizePositiveIntInput, printerHasStation, resolveTargetPrinter, resolveTargetPrinterAsync, productForPreview, matchedOperatorPrintRule, availableLabels, selectableLabels, checkLotNumberExists, getHighestSequenceForBaseLot, consumeRecycledSequence, claimAutoLotRange, claimAutoLotRangeWithoutCounter, updateCounterOnStart, handleManualOrderChange, isLotMachineValidationExempt, validateLotMachineCode, handleManualLotChange, canStartManual, canStartAuto, handleStartProduction, handleManualLotKeyDown, selectedOperatorName, showPreviewPane, normalizedStationId, supportsStringLotBatch, previewStringCount, stringLotPreview, shouldShowStringLotPreview, isCompactAutoLayout, currentPreviewLot, activePreviewData, loadingLabels } = state;
  const { t } = useTranslation();

  return (
    <>
        {/* LINKS: CONFIGURATIE */}
        <div className={`${showPreviewPane ? "w-full lg:w-5/12 xl:w-1/3" : "w-full"} ${isCompactAutoLayout ? "p-3 lg:p-4" : "p-4"} ${showPreviewPane ? "border-b lg:border-b-0 lg:border-r" : ""} border-slate-100 flex flex-col bg-slate-50/50 overflow-y-auto custom-scrollbar`}>
          <div className="flex justify-between items-start mb-4">
            <div className="text-left">
              <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
                {mode === "qc_steekproef" ? "QC Steekproef" : t("productionStartModal.title", "Order starten")}
              </h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 text-left italic">
                {stationId}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className={`${isCompactAutoLayout ? "space-y-2.5" : "space-y-4"} flex-1 text-left`}>
            {/* Dossier info kaart */}
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

            {/* Operator Selection */}
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

            {/* BH18 Wikkelrobot Positie Selectie (Station 1 / Station 2) */}
            {isBh18Station(stationId) && (
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
            )}

            {/* Mode switcher */}
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setMode("auto")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "auto"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <RefreshCw size={12} /> {t("productionStartModal.labels.auto", "Auto")}
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "manual"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <Keyboard size={12} /> Manueel
              </button>
              <button
                onClick={() => setMode("qc_steekproef")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "qc_steekproef"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <Activity size={12} /> QC Steekproef
              </button>
            </div>

            {/* Lot invoer sectie */}
            {(mode === "auto" || mode === "qc_steekproef") ? (
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
            ) : (
              <div className="space-y-3 animate-in slide-in-from-top-2 text-left">
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    {t("productionStartModal.labels.amountInString", "Aantal in string")}
                  </label>
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm">
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
                      {t("productionStartModal.labels.moldMatchActive", {
                        tooling: flangeSeriesInfo?.matchedTooling?.name || flangeSeriesInfo?.matchedTooling?.itemCode || flangeSeriesInfo?.matchedRule?.matcher || t("productionStartModal.labels.defaultTooling"),
                        count: flangeSeriesInfo?.cavityCount || 1,
                      })}
                    </p>
                  )}
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    {t("productionStartModal.labels.orderNumberScanOrFill", "Ordernummer (scannen of invullen)")}
                  </label>
                  <div className="relative">
                    <input
                      ref={orderInputRef}
                      type="text"
                      enterKeyHint="done"
                      value={manualOrderInput}
                      onChange={handleManualOrderChange}
                      placeholder={order?.orderId || "N2000000"}
                      className={`w-full p-3 bg-white border-2 rounded-2xl font-mono text-lg font-black uppercase outline-none shadow-sm text-center placeholder:text-slate-300 ${
                        orderError 
                          ? "border-red-500 focus:border-red-600 text-red-600" 
                          : orderValidated
                          ? "border-emerald-500 focus:border-emerald-600 text-emerald-600"
                          : "border-slate-100 focus:border-blue-600 text-slate-800"
                      }`}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {orderError ? (
                        <AlertTriangle className="text-red-500" size={20} />
                      ) : orderValidated ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : null}
                    </div>
                  </div>
                  {orderError && (
                    <p className="text-xs font-bold text-red-500 mt-1 pl-2">{orderError}</p>
                  )}
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    {t("productionStartModal.labels.lotNumberScanOrFill", "Lotnummer (scannen of invullen)")}
                  </label>
                  <div className="relative">
                    <input
                      ref={lotInputRef}
                      type="text"
                      value={manualLotInput}
                      onChange={handleManualLotChange}
                      onKeyDown={handleManualLotKeyDown}
                      placeholder={t("productionStartModal.placeholders.manualLot")}
                      disabled={!orderValidated}
                      className={`w-full p-3 bg-white border-2 rounded-2xl font-mono text-xl font-black uppercase outline-none shadow-sm text-center placeholder:text-slate-300 ${
                        lotError 
                          ? "border-red-500 focus:border-red-600 text-red-600" 
                          : !lotError && manualLotInput.trim().length === 15
                          ? "border-emerald-500 focus:border-emerald-600 text-slate-800"
                          : "border-slate-100 focus:border-blue-600 text-slate-800"
                      } ${!orderValidated ? 'opacity-50 cursor-not-allowed' : ''}`}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCheckingLot ? (
                        <Loader2 className="animate-spin text-blue-500" size={20} />
                      ) : lotError ? (
                        <AlertTriangle className="text-red-500" size={20} />
                      ) : manualLotInput.trim().length === 15 ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : null}
                    </div>
                  </div>
                  {lotError && (
                    <p className="text-xs font-bold text-red-500 mt-1 pl-2">{lotError}</p>
                  )}
                  {!lotError && manualMinimumSeq !== null && manualPoolHint && (
                    <p className="text-[11px] font-bold text-slate-500 mt-1 pl-2">{manualPoolHint}</p>
                  )}
                </div>
              </div>
            )}

            {/* Label selectie */}
            {!isManualMode && !isFlangeOrder && <div className={`${isCompactAutoLayout ? "pt-2" : "pt-3"} border-t border-slate-200 text-left`}>
              <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5 ml-2 flex items-center gap-2">
                {t("productionStartModal.labels.labelFormat", "Labelformaat")}
              </label>
              {loadingLabels ? (
                <div className="p-3 text-center text-xs text-slate-400 italic flex items-center justify-start gap-2">
                  <Loader2 size={14} className="animate-spin" /> {t("productionStartModal.labels.loadingLabels")}
                </div>
              ) : selectableLabels.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  <span>{t("productionStartModal.labels.noSuitableLabels")}</span>
                </div>
              ) : (
                selectedTemplateIds.length > 1 ? (
                  <div className="space-y-1">
                    {selectedTemplateIds.map(id => {
                      const template = availableLabels.find(l => l.id === id);
                      return (
                        <div key={id} className="text-xs font-bold text-slate-700 bg-white p-2 rounded border border-slate-200 shadow-sm">
                          {template ? `${template.name} (${template.width}x${template.height}mm)` : id}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="relative group">
                  <select
                    value={selectedLabelId || ""}
                    onChange={(e) => {
                      setSelectedLabelId(e.target.value);
                      setSelectedTemplateIds([e.target.value]);
                    }}
                    className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-blue-600 shadow-sm appearance-none cursor-pointer group-hover:border-slate-300"
                  >
                    {selectableLabels.map((l) => (
                      <option key={String(l.id)} value={String(l.id)}>
                        {String(l.name || "Label")} ({String(l.width || "?")}x{String(l.height || "?")}mm)
                      </option>
                    ))}
                  </select>
                  <Printer
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
                )
              )}
            </div>}
          </div>

          <div className={`${isCompactAutoLayout ? "mt-3 pt-3" : "mt-4 pt-4"} border-t border-slate-200 flex gap-3`}>
            <button
              onClick={onClose}
              className={`flex-1 ${isCompactAutoLayout ? "py-3.5" : "py-5"} bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all`}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleStartProduction}
              disabled={
                isStarting ||
                (isManualMode && !canStartManual) ||
                (!isManualMode && !canStartAuto)
              }
              className={`flex-[2] ${isCompactAutoLayout ? "py-3.5" : "py-5"} rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95 ${
                mode === "qc_steekproef"
                  ? "bg-orange-500 text-white hover:bg-orange-400 shadow-orange-600/50"
                  : isManualMode && canStartManual
                  ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/50 animate-pulse"
                  : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              }`}
            >
              {isCheckingLot || isStarting ? <Loader2 className="animate-spin" size={20} /> : <PlayCircle size={20} />} 
              {isStarting ? t("productionStartModal.labels.starting") : mode === "qc_steekproef" ? "Steekproef nemen" : (selectedOperatorName ? t("productionStartModal.labels.startWithOperator", { operator: operatorInput }) : t("productionStartModal.labels.startOrder"))}
            </button>
          </div>
        </div>


    </>
  );
};
