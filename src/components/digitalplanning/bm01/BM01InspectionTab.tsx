import React from "react";
import { useTranslation } from "react-i18next";
import { Package, ScanBarcode, Keyboard, X, History } from "lucide-react";
import { ProductRecord } from "./bm01Types";

interface BM01InspectionTabProps {
    bm01Products: ProductRecord[];
    selectedProduct: ProductRecord | null;
    scanInput: string;
    setScanInput: (val: string) => void;
    scannerMode: boolean;
    setScannerMode: (val: boolean) => void;
    scanInputRef: React.RefObject<HTMLInputElement | null>;
    handleScan: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    isTouchDevice: boolean;
    touchKeyboardPreferred: boolean;
    setTouchKeyboardPreferred: (val: boolean) => void;
    handleItemClick: (item: ProductRecord) => void;
    scheduleScanFocus: () => void;
}

const BM01InspectionTab: React.FC<BM01InspectionTabProps> = ({
    bm01Products,
    selectedProduct,
    scanInput,
    setScanInput,
    scannerMode,
    setScannerMode,
    scanInputRef,
    handleScan,
    isTouchDevice,
    touchKeyboardPreferred,
    setTouchKeyboardPreferred,
    handleItemClick,
    scheduleScanFocus,
}) => {
    const { t } = useTranslation();

    return (
        <div className="h-full w-full">
            <div className="h-full flex flex-col p-3 w-full overflow-y-auto custom-scrollbar">
                {/* Scan Indicator & Input */}
                <div className="shrink-0 space-y-2 mb-3 sticky top-0 bg-white py-2 z-10">
                    <div className="flex justify-between items-end">
                        {/* Indicator Label */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-lg border border-purple-100 w-fit">
                            <div className="w-2 h-2 bg-purple-500 rounded-full pulse-text-bm01"></div>
                            <span className="text-xs font-black text-purple-600 uppercase tracking-widest">
                                🔍 {t('bm01.ready_for_inspection_scan', 'Klaar voor inspectie scan')}
                            </span>
                        </div>

                        {/* Scanner Mode Toggle */}
                        <button 
                            onClick={() => setScannerMode(!scannerMode)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 font-black text-[9px] uppercase tracking-tighter transition-all ${scannerMode ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-400'}`}
                            title={scannerMode ? t('bm01.scannerModeKeyboardHidden', 'Toetsenbord verborgen (Scanner Modus)') : t('bm01.normalInput', 'Normale invoer')}
                        >
                            {scannerMode ? <ScanBarcode size={14} /> : <Keyboard size={14} />}
                            {scannerMode ? t('bm01.scanner', 'Scanner') : t('bm01.keyboard', 'Keyboard')}
                        </button>
                    </div>
                    {/* Scan Input */}
                    <div className="relative">
                        <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-500 transition-all scan-pulse-bm01" size={24} />
                        <input
                            ref={scanInputRef as any}
                            type="text"
                            autoFocus
                            value={scanInput}
                            onChange={(e) => setScanInput(e.target.value)}
                            inputMode={scannerMode && isTouchDevice && !touchKeyboardPreferred ? "none" : "text"}
                            onKeyDown={handleScan}
                            placeholder={t("placeholders.dpScanLotForInspection", "Scan lotnummer voor inspectie...")}
                            className="w-full pl-14 pr-24 py-4 bg-white border-2 border-purple-100 focus:border-purple-500 focus:ring-2 focus:ring-purple-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {scanInput ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setScanInput("");
                                        scheduleScanFocus();
                                    }}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                                    title={t("common.clear", "Wissen")}
                                >
                                    <X size={14} />
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => {
                                    setTouchKeyboardPreferred(true);
                                    requestAnimationFrame(() => {
                                        scheduleScanFocus();
                                    });
                                }}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-blue-600 hover:text-blue-700"
                                title={t("digitalplanning.terminal.keyboard", "Toetsenbord")}
                            >
                                <Keyboard size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {bm01Products.length === 0 ? (
                    <div className="text-center py-20 opacity-40">
                        <Package size={64} className="mx-auto mb-4 text-slate-300" />
                        <p className="font-black uppercase tracking-widest text-slate-400">{t('bm01.no_items_inspect')}</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {bm01Products.map((item: ProductRecord) => (
                            <div 
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className={`bg-white border rounded-[14px] p-3 shadow-sm hover:shadow-md transition-all group cursor-pointer w-full
                                    ${selectedProduct?.id === item.id ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-200' : 'border-slate-100'}`}
                            >
                                <div className="flex justify-between items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-black text-2xl text-slate-800 tracking-tight">{item.lotNumber}</h4>
                                        <span className="text-[7px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-lg font-black uppercase tracking-wider border border-slate-200 inline-block mt-0.5">
                                            {item.orderId}
                                        </span>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase truncate mt-0.5">{item.item}</p>
                                        <div className="flex items-center gap-1 mt-1">
                                            <History size={8} className="text-slate-400" />
                                            <span className="text-[7px] text-slate-400 font-bold uppercase">
                                                {t('bm01.from')}: {item.lastStation || t('common.unknown')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleItemClick(item);
                                    }}
                                    className="w-full mt-2 px-2 py-1.5 bg-purple-600 text-white rounded-lg font-black uppercase text-[8px] tracking-widest hover:bg-purple-700 transition-all shadow-md active:scale-95"
                                >
                                    {t('bm01.report_ready')}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BM01InspectionTab;
