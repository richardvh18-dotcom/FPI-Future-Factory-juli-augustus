import React from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Clock, UserCheck, AlertTriangle, Calendar, Menu, X } from 'lucide-react';
import { useWorkstationStore } from './useWorkstationStore';

export const getShiftColor = (shift: string) => {
  switch (shift) {
    case "Ochtend": return "bg-blue-100 text-blue-700 border-blue-200";
    case "Middag": return "bg-orange-100 text-orange-700 border-orange-200";
    case "Nacht": return "bg-purple-100 text-purple-700 border-purple-200";
    default: return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

export const WorkstationHeader = ({ state }: { state: any }) => {
  const { t } = useTranslation();
  const {
    handleBack,
    selectedStation,
    WORKSTATIONS,
    stationOccupancy,
    setIsMobileMenuOpen,
    currentDate,
    isTwoKpiHeaderStation,
    stationStats,
    todoHeaderLabel,
    currentOperatorIndex,
    requiresShiftCheckin,
    checkedInOperator,
    toggleMachineStoring,
    activeDowntime,
    currentWeekInfo,
    isMobileMenuOpen,
    activeTab,
    setActiveTab,
    isWorkstationGereedTab,
    requestNotificationPermission,
    isPWA,
    showInstallInstructions
  } = state;

  return (
    <>
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="w-full px-2 sm:px-4 lg:px-8 py-1 sm:py-0">
          <div className="flex h-12 sm:h-16 items-center justify-between gap-1 sm:gap-3">
            {/* Linkerkant: Terug & Titel */}
            <div className="flex items-center shrink-0">
              <button
                onClick={handleBack}
                className="mr-1.5 sm:mr-4 px-2 py-1.5 sm:px-4 sm:py-2 bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 font-bold text-[10px] sm:text-xs uppercase tracking-wider shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{t("digitalplanning.workstation.back")}</span>
              </button>
              <span className="text-sm sm:text-xl font-black text-gray-900 italic tracking-tight truncate max-w-[60px] xs:max-w-[100px] sm:max-w-none">
                {WORKSTATIONS.find((w: any) => w.id === selectedStation)?.name ||
                  selectedStation}
              </span>
            </div>

            {/* Mobiele Info (Midden) - Zichtbaar op kleine schermen in dezelfde regel */}
            <div className="flex lg:hidden flex-1 items-center justify-end min-w-0 gap-1 sm:gap-2">
              <div className="flex items-center bg-slate-50 rounded-md border border-slate-200 p-1 min-w-0 shadow-sm">
                <div className="flex items-center gap-1 overflow-hidden mr-1">
                  {stationOccupancy.length > 0 ? (
                    <span className={`px-1 py-0.5 rounded text-[9px] font-bold uppercase border truncate ${getShiftColor(stationOccupancy[0]?.shift)}`}>
                      {stationOccupancy[0]?.operatorName.split(' ')[0]}
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400 italic hidden xs:inline-block px-1">Geen</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    useWorkstationStore.getState().setShowOperatorCheckinModal(true);
                    useWorkstationStore.getState().setOperatorBadgeInput("");
                    setIsMobileMenuOpen(false);
                  }}
                  className="shrink-0 px-1.5 py-1 rounded bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest active:scale-95 shadow-sm"
                >
                  Inlog
                </button>
              </div>

              {/* Tijd Widget Mobiel */}
              <div className="shrink-0 flex items-center justify-center px-1.5 py-1 bg-white rounded-md border border-slate-200 text-center shadow-sm">
                <p className="text-[10px] font-bold text-slate-700">
                  {currentDate.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            {/* KPI Tegels */}
            <div className="hidden lg:flex items-center gap-2 ml-2 border-l border-slate-200 pl-4">
              {!isTwoKpiHeaderStation && (
                <div className="flex flex-col items-center px-3 py-1 bg-blue-50 rounded-lg border border-blue-100 min-w-[60px]">
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest leading-none mb-0.5">{t("digitalplanning.dashboard.plan")}</span>
                  <span className="text-sm font-black text-blue-700 leading-none">{stationStats.plan}</span>
                </div>
              )}
              <div className="flex flex-col items-center px-3 py-1 bg-orange-50 rounded-lg border border-orange-100 min-w-[60px]">
                <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest leading-none mb-0.5">
                  {todoHeaderLabel}
                </span>
                <span className="text-sm font-black text-orange-700 leading-none">{stationStats.todo}</span>
              </div>
              <div className="flex flex-col items-center px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-100 min-w-[60px]">
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-0.5">{t("digitalplanning.dashboard.ready")}</span>
                <span className="text-sm font-black text-emerald-700 leading-none">{stationStats.done}</span>
              </div>
            </div>

            {/* Midden: Bezetting Info */}
            <button
              type="button"
              onClick={() => {
                useWorkstationStore.getState().setShowOperatorCheckinModal(true);
                useWorkstationStore.getState().setOperatorBadgeInput("");
              }}
              className="hidden xl:flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-sm min-w-[200px] justify-center hover:bg-slate-50 transition-colors"
              title="Klik om operator aan te melden"
            >
              <Clock className="w-4 h-4 text-slate-500" />
              {stationOccupancy.length > 0 ? (
                <div
                  key={currentOperatorIndex}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase border animate-in fade-in slide-in-from-bottom-1 duration-500 ${getShiftColor(
                    stationOccupancy[currentOperatorIndex]?.shift
                  )}`}
                  title={`${stationOccupancy[currentOperatorIndex]?.operatorName} - ${stationOccupancy[currentOperatorIndex]?.shift}`}
                >
                  {stationOccupancy[currentOperatorIndex]?.operatorName}
                </div>
              ) : (
                <span className="text-xs font-bold text-slate-400 uppercase italic">{t("digitalplanning.workstation.no_operator")}</span>
              )}
            </button>

            {requiresShiftCheckin && checkedInOperator && (
              <div className="hidden xl:flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-200 shadow-sm">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-black text-emerald-700 uppercase">{checkedInOperator.name}</span>
              </div>
            )}

            <button
              onClick={toggleMachineStoring}
              className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm transition-all active:scale-95 ${
                activeDowntime 
                  ? "bg-red-50 border-red-500 text-red-600 animate-pulse" 
                  : "bg-white border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200"
              }`}
              title={activeDowntime ? "Storing afmelden" : "Machine in storing melden"}
            >
              <AlertTriangle size={18} className={activeDowntime ? "text-red-500" : ""} />
              <span className={`text-xs font-black uppercase tracking-widest ${activeDowntime ? "text-red-600" : ""}`}>
                {activeDowntime ? "In Storing" : "Storing Melden"}
              </span>
            </button>

            {/* Rechts: Datum, Tijd & Week - helemaal rechts met flex-1 */}
            <div className="flex-1 hidden lg:flex justify-end items-center">
              <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <Calendar size={16} className="text-blue-600" />
                <div className="text-xs font-bold text-gray-700">
                  {t("common.week")} {currentWeekInfo.week} • {currentDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div className="text-xs font-mono font-bold text-blue-600 border-l border-gray-300 pl-3">
                  {currentDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Rechterkant: Mobiel Menu Button */}
            <div className="flex items-center shrink-0 ml-1">
              {/* Mobiel Hamburger Menu */}
              <div className="lg:hidden relative">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-1.5 sm:p-2 bg-gray-100 rounded-lg text-gray-600 active:bg-gray-200 shadow-sm"
                >
                  {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {isMobileMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex flex-col gap-1 z-50 animate-in slide-in-from-top-2">
                    {/* KPI Info voor mobiel */}
                    <div className={`grid ${isTwoKpiHeaderStation ? 'grid-cols-2' : 'grid-cols-3'} gap-2 mb-2`}>
                      {!isTwoKpiHeaderStation && (
                        <div className="px-2 py-2 bg-blue-50 rounded-lg border border-blue-100 text-center">
                          <span className="text-[8px] font-black text-blue-400 uppercase block">{t("digitalplanning.dashboard.plan")}</span>
                          <span className="text-xs font-black text-blue-700">{stationStats.plan}</span>
                        </div>
                      )}
                      <div className="px-2 py-2 bg-orange-50 rounded-lg border border-orange-100 text-center">
                        <span className="text-[8px] font-black text-orange-400 uppercase block">{todoHeaderLabel}</span>
                        <span className="text-xs font-black text-orange-700">{stationStats.todo}</span>
                      </div>
                      <div className="px-2 py-2 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                        <span className="text-[8px] font-black text-emerald-400 uppercase block">{t("digitalplanning.dashboard.ready")}</span>
                        <span className="text-xs font-black text-emerald-700">{stationStats.done}</span>
                      </div>
                    </div>

                    {/* Bezetting Info voor mobiel */}
                    {stationOccupancy.length > 0 && (
                      <div className="px-3 py-3 bg-slate-50 rounded-lg border border-slate-200 mb-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                          <Clock className="w-3 h-3" />
                          <span>{t("digitalplanning.workstation.scheduled_occupancy")}</span>
                        </div>
                        <div className="space-y-1.5">
                          {stationOccupancy.map((occ: any, idx: number) => (
                            <div
                              key={idx}
                              className={`px-2 py-1.5 rounded-md text-[10px] font-bold uppercase border ${getShiftColor(occ.shift)}`}
                            >
                              {occ.operatorName}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <button
                      onClick={() => {
                        setActiveTab("terminal");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "terminal"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("digitalplanning.terminal.tab_planning")}
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab("winding");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "winding"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("digitalplanning.hub.title")}
                    </button>
                    {![("BM01"), "Station BM01"].includes(
                      selectedStation
                    ) && isWorkstationGereedTab && (
                      <button
                        onClick={() => {
                          setActiveTab("lossen");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                          activeTab === "lossen"
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-500"
                        }`}
                      >
                        Gereed
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setActiveTab("efficiency");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "efficiency"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("common.efficiency")}
                    </button>
                    
                    {/* iPad/Mobile specifieke acties */}
                    <div className="h-px bg-slate-100 my-1"></div>
                    <button
                      onClick={requestNotificationPermission}
                      className="px-4 py-3 rounded-lg text-xs font-bold uppercase text-left w-full text-slate-500 hover:bg-slate-50 flex items-center gap-2"
                    >
                      🔔 Notificaties Aanzetten
                    </button>
                    {!isPWA && (
                      <button
                        onClick={showInstallInstructions}
                        className="px-4 py-3 rounded-lg text-xs font-bold uppercase text-left w-full text-slate-500 hover:bg-slate-50 flex items-center gap-2"
                      >
                        📱 App Installeren
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
