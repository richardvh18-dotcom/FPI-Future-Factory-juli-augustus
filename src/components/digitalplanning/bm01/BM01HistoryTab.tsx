import React from "react";
import { useTranslation } from "react-i18next";
import { 
    ChevronLeft, 
    Calendar, 
    ChevronRight, 
    Download, 
    Printer, 
    CheckCircle2, 
    FileText 
} from "lucide-react";
import { format, subDays, addDays, startOfISOWeek, endOfISOWeek, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import { ProductRecord } from "./bm01Types";

interface BM01HistoryTabProps {
    completedProducts: ProductRecord[];
    selectedDate: Date;
    setSelectedDate: React.Dispatch<React.SetStateAction<Date>>;
    viewMode: string;
    setViewMode: (mode: string) => void;
    handleExport: () => void;
    setShowPrintModal: (show: boolean) => void;
    setViewingDossier: (item: ProductRecord) => void;
    toDateFromMixed: (val: unknown) => Date | null;
}

const BM01HistoryTab: React.FC<BM01HistoryTabProps> = ({
    completedProducts,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    handleExport,
    setShowPrintModal,
    setViewingDossier,
    toDateFromMixed,
}) => {
    const { t } = useTranslation();

    return (
        <div className="h-full flex flex-col p-3 w-full">
            {/* Datum Navigatie */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-2 mb-3">
                <div className="flex items-center bg-white p-1.5 rounded-xl shadow-md border-2 border-slate-200 scale-95 sm:scale-100">
                    <button onClick={() => setSelectedDate(d => viewMode === 'day' ? subDays(d, 1) : subDays(d, 7))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-800">
                        <ChevronLeft size={20} />
                    </button>
                    <div 
                        className="flex items-center gap-2 px-4 min-w-[200px] justify-center cursor-pointer hover:bg-slate-50 rounded-lg transition-colors select-none"
                        onDoubleClick={() => setSelectedDate(new Date())}
                        title={t('bm01.reset_date_tooltip', 'Dubbelklik om naar vandaag te gaan')}
                    >
                        <Calendar size={18} className="text-emerald-500" />
                        <span className="font-black text-slate-800 uppercase tracking-wider text-xs">
                            {viewMode === 'day' 
                                ? format(selectedDate, "EEEE d MMMM", { locale: nl })
                                : `Week ${format(selectedDate, "w")} (${format(startOfISOWeek(selectedDate), "d MMM")} - ${format(endOfISOWeek(selectedDate), "d MMM")})`
                            }
                        </span>
                    </div>
                    <button onClick={() => setSelectedDate(d => viewMode === 'day' ? addDays(d, 1) : addDays(d, 7))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-800">
                        <ChevronRight size={20} />
                    </button>
                </div>
                
                <div className="flex gap-1.5 scale-95 sm:scale-100">
                    <div className="flex bg-white p-0.5 rounded-lg border border-slate-100 shadow-sm">
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

                    <button 
                        onClick={handleExport}
                        className="p-2 bg-white hover:bg-emerald-50 text-emerald-600 border border-slate-100 rounded-lg transition-colors shadow-sm"
                        title={t('bm01.exportCsv', 'Export CSV')}
                    >
                        <Download size={18} />
                    </button>
                    
                    <button 
                        onClick={() => setShowPrintModal(true)}
                        className="p-2 bg-white hover:bg-blue-50 text-blue-600 border border-slate-100 rounded-lg transition-colors shadow-sm"
                        title={t('bm01.print_list', 'Print Lijst')}
                    >
                        <Printer size={18} />
                    </button>
                </div>
            </div>

            <div className="text-center mb-3">
                <div className="inline-block bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 shadow-sm">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                        {t('bm01.foundLotsInPeriod', 'Gevonden lots in deze periode')}: <span className="text-emerald-600 font-black text-xl ml-2">{completedProducts.length}</span>
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                {completedProducts.length === 0 ? (
                    <div className="text-center py-20 opacity-40">
                        <CheckCircle2 size={64} className="mx-auto mb-4 text-slate-300" />
                        <p className="font-black uppercase tracking-widest text-slate-400">{t('bm01.no_offered_items', 'Geen items aangeboden')}</p>
                    </div>
                ) : (
                    completedProducts.map(item => (
                        <div key={item.id} className="bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm flex justify-between items-center opacity-75 hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-5">
                                <div className="p-4 rounded-2xl shrink-0 bg-emerald-50 text-emerald-600">
                                    <CheckCircle2 size={24} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-black text-lg text-slate-800 tracking-tight">{item.lotNumber}</h4>
                                        <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border border-slate-200">
                                            {item.orderId}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-bold uppercase truncate">{item.item}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-emerald-600 font-bold uppercase">
                                            {t('bm01.reportedReadyAt', 'Gereedgemeld om')} {item.timestamps?.finished ? format(toDateFromMixed(item.timestamps.finished) || new Date(), "HH:mm") : "--:--"}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewingDossier(item);
                                            }}
                                            className="ml-4 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
                                        >
                                            <FileText size={12} /> {t('bm01.dossier', 'Dossier')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default BM01HistoryTab;
