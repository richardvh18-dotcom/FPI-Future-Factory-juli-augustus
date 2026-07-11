import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Calendar, ChevronRight, Printer } from "lucide-react";
import { format, subDays, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { ProductRecord } from "./bm01Types";

interface BM01NahardingTabProps {
    nahardingBatchProducts: ProductRecord[];
    latestNahardingBatchLabel: string | null;
    isNahardingBatchProcessing: boolean;
    handleNahardingBatchComplete: () => void;
    viewMode: string;
    setViewMode: (mode: string) => void;
    nahardingPrintList: ProductRecord[];
    lastNahardingResetAt: string | null;
    setLastNahardingResetAt: (date: string | null) => void;
    selectedDate: Date;
    setSelectedDate: React.Dispatch<React.SetStateAction<Date>>;
    setShowPrintModal: (show: boolean) => void;
    nahardingProducts: ProductRecord[];
}

const BM01NahardingTab: React.FC<BM01NahardingTabProps> = ({
    nahardingBatchProducts,
    latestNahardingBatchLabel,
    isNahardingBatchProcessing,
    handleNahardingBatchComplete,
    viewMode,
    setViewMode,
    nahardingPrintList,
    lastNahardingResetAt,
    setLastNahardingResetAt,
    selectedDate,
    setSelectedDate,
    setShowPrintModal,
    nahardingProducts,
}) => {
    const { t } = useTranslation();

    return (
        <div className="h-full flex flex-col p-4 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col justify-between shadow-sm">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">{t('bm01.nahardingBatch', 'Naharding Batch')}</p>
                        <p className="text-sm font-bold text-slate-700 mt-1">
                            {t("bm01.naharding_batch_desc", "Meld in 1x alle Naharding lots gereed zodra de oven is geleegd.")}
                        </p>
                        {latestNahardingBatchLabel && (
                            <p className="mt-3 text-[11px] font-bold text-amber-800">
                                {t("bm01.naharding_batch_date", "Laatst aangeboden batch: {{date}}", { date: latestNahardingBatchLabel })}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleNahardingBatchComplete}
                        disabled={isNahardingBatchProcessing || nahardingBatchProducts.length === 0}
                        className={`mt-4 w-full px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                            isNahardingBatchProcessing || nahardingBatchProducts.length === 0
                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                : "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 shadow-sm"
                        }`}
                    >
                        {isNahardingBatchProcessing
                            ? t("bm01.naharding_batch_processing", "Batch wordt verwerkt...")
                            : t("bm01.naharding_batch_button", "Batch Naharding gereedmelden ({{count}})", { count: nahardingBatchProducts.length })}
                    </button>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 flex flex-col justify-between shadow-sm">
                    <div>
                        <div className="flex justify-between items-start gap-2">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">{t('bm01.printLabels', 'Print Labels')}</p>
                                <p className="text-sm font-bold text-slate-700 mt-1">
                                    {t('bm01.printLabelsHelp', 'Print het QR-overzicht voor de Naharding batch van een specifieke dag of week.')}
                                </p>
                            </div>
                            <div className="flex bg-white p-0.5 rounded-lg border border-blue-100 shadow-sm shrink-0">
                                <button 
                                    onClick={() => setViewMode("export")}
                                    className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === "export" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                                >
                                    {t('bm01.export', 'Per Export')}
                                </button>
                                <button 
                                    onClick={() => setViewMode("day")}
                                    className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === "day" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                                >
                                    {t('bm01.day', 'Dag')}
                                </button>
                                <button 
                                    onClick={() => setViewMode("week")}
                                    className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === "week" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                                >
                                    {t('bm01.week', 'Week')}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-end mt-4">
                            <p className="text-xs font-bold text-blue-800 bg-blue-100/50 px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm">
                                {t('bm01.lotCount', 'Aantal lots')}: <span className="font-black text-lg ml-1">{nahardingPrintList.length}</span>
                            </p>
                            {viewMode === "export" ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase">
                                        {lastNahardingResetAt 
                                            ? `${t('bm01.lastPrint', 'Reset')}: ${format(new Date(lastNahardingResetAt), "HH:mm")}`
                                            : t('bm01.noPrintYet', 'Geen reset')}
                                    </span>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const nowStr = new Date().toISOString();
                                            localStorage.setItem("last_naharding_reset_at", nowStr);
                                            setLastNahardingResetAt(nowStr);
                                        }}
                                        className="px-2 py-1 bg-slate-200 hover:bg-slate-300 border border-slate-300 rounded-lg text-[8px] font-black uppercase tracking-wider text-slate-700 transition-colors"
                                    >
                                        Reset view
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center bg-white p-1.5 rounded-xl shadow-md border-2 border-blue-200 shrink-0">
                                    <button onClick={() => setSelectedDate(d => viewMode === 'day' ? subDays(d, 1) : subDays(d, 7))} className="p-2 hover:bg-blue-50 rounded-lg text-slate-500 hover:text-blue-700 transition-colors">
                                        <ChevronLeft size={18} />
                                    </button>
                                    <div 
                                        className="flex items-center px-4 cursor-pointer select-none min-w-[120px] justify-center"
                                        onDoubleClick={() => setSelectedDate(new Date())}
                                        title={t('bm01.doubleClickForToday', 'Dubbelklik voor vandaag')}
                                    >
                                        <Calendar size={14} className="text-blue-500 mr-2 inline-block" />
                                        <span className="font-black text-slate-800 text-xs uppercase tracking-wider">
                                            {viewMode === 'day' 
                                                ? format(selectedDate, "d MMM", { locale: nl })
                                                : `Week ${format(selectedDate, "w")}`
                                            }
                                        </span>
                                    </div>
                                    <button onClick={() => setSelectedDate(d => viewMode === 'day' ? addDays(d, 1) : addDays(d, 7))} className="p-2 hover:bg-blue-50 rounded-lg text-slate-500 hover:text-blue-700 transition-colors">
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowPrintModal(true)}
                        disabled={nahardingPrintList.length === 0}
                        className={`mt-4 w-full px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all shadow-sm flex items-center justify-center gap-2 ${
                            nahardingPrintList.length === 0 
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                            : "bg-white hover:bg-blue-100 text-blue-700 border-blue-300"
                        }`}
                    >
                        <Printer size={16} className="inline-block mr-2 -mt-0.5" />
                        <span>{t('bm01.qrPrintOverview', 'QR Print Overzicht')}</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
                {nahardingBatchProducts.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center opacity-60">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                            {nahardingProducts.length === 0
                                ? t("bm01.naharding_batch_none_total", "Geen lots op Naharding station gevonden.")
                                : t("bm01.naharding_batch_none", "{{total}} lots op Naharding, maar geen batch-datum bepaald.", { total: nahardingProducts.length })}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {nahardingBatchProducts.map((item) => (
                            <div key={item.id || item.lotNumber} className="rounded-xl border border-slate-200 p-3">
                                <p className="text-sm font-black text-slate-800">{item.lotNumber || item.id}</p>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
                                    {item.orderId || "-"} | {item.item || item.itemCode || "-"}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BM01NahardingTab;
