// @ts-nocheck
import React from 'react';
import { Calendar, Clock, Building2 } from 'lucide-react';

type TimeTrackingViewHeaderProps = {
  t: (key: string, fallback?: string) => string;
  periodMode: string;
  setPeriodMode: (value: string) => void;
  dayInputValue: string;
  weekInputValue: string;
  monthInputValue: string;
  handleDayChange: (value: string) => void;
  handleMonthChange: (value: string) => void;
  handleWeekChange: (value: string) => void;
  navigatePrevious: () => void;
  navigateNext: () => void;
  jumpToToday: () => void;
  selectedDate: Date;
  selectedDepartment: string;
  setSelectedDepartment: (value: string) => void;
  departments: string[];
  selectedMachine: string;
  setSelectedMachine: (value: string) => void;
  machineOptions: string[];
  filterStatus: string;
  setFilterStatus: (value: string) => void;
};

const TimeTrackingViewHeader = ({
  t,
  periodMode,
  setPeriodMode,
  dayInputValue,
  weekInputValue,
  monthInputValue,
  handleDayChange,
  handleMonthChange,
  handleWeekChange,
  navigatePrevious,
  navigateNext,
  jumpToToday,
  selectedDate,
  selectedDepartment,
  setSelectedDepartment,
  departments,
  selectedMachine,
  setSelectedMachine,
  machineOptions,
  filterStatus,
  setFilterStatus,
}: TimeTrackingViewHeaderProps) => {
  const formatDateLabel = () => {
    if (periodMode === 'day') return selectedDate.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (periodMode === 'month') return selectedDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
    return `Week ${selectedDate.getWeek?.() ?? '0'} - ${selectedDate.getFullYear()}`;
  };

  return (
    <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800">{t('timeTrackingView.title', 'Time Tracking')}</h1>
          <p className="text-sm text-slate-600 mt-1">{t('timeTrackingView.subtitle', 'Vergelijk daadwerkelijke vs geplande tijd per order')}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-600" />
            <div className="flex items-center gap-2">
              <button onClick={() => setPeriodMode('day')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === 'day' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {t('timeTrackingView.day', 'Dag')}
              </button>
              <button onClick={() => setPeriodMode('week')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === 'week' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {t('timeTrackingView.week', 'Week')}
              </button>
              <button onClick={() => setPeriodMode('month')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === 'month' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {t('timeTrackingView.month', 'Maand')}
              </button>
            </div>

            {periodMode === 'day' && <input type="date" value={dayInputValue} onChange={(e) => handleDayChange(e.target.value)} className="px-2 py-1.5 rounded-md border-2 border-slate-200 text-xs font-bold text-slate-700 bg-white" />}
            {periodMode === 'week' && <input type="week" value={weekInputValue} onChange={(e) => handleWeekChange(e.target.value)} className="px-2 py-1.5 rounded-md border-2 border-slate-200 text-xs font-bold text-slate-700 bg-white" />}
            {periodMode === 'month' && <input type="month" value={monthInputValue} onChange={(e) => handleMonthChange(e.target.value)} className="px-2 py-1.5 rounded-md border-2 border-slate-200 text-xs font-bold text-slate-700 bg-white" />}

            <button onClick={navigatePrevious} className="px-2 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">{t('timeTrackingView.previous', 'Vorige')}</button>
            <span className="text-sm font-bold text-slate-700 min-w-[180px] text-center">{formatDateLabel()}</span>
            <button onClick={navigateNext} className="px-2 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">{t('timeTrackingView.next', 'Volgende')}</button>
            <button onClick={jumpToToday} className="px-2 py-1.5 rounded-md bg-blue-500 text-white text-xs font-bold">{t('timeTrackingView.today', 'Vandaag')}</button>
          </div>

          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-slate-600" />
            <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)} className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-sm font-bold">
              {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Clock size={16} className="text-slate-600" />
            <select value={selectedMachine} onChange={(e) => setSelectedMachine(e.target.value)} className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-sm font-bold">
              <option value="ALLES">{t('timeTrackingView.allMachines', 'Alle Machines')}</option>
              {machineOptions.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
            </select>
          </div>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-sm font-bold">
            <option value="all">{t('timeTrackingView.allStatuses', 'Alle status')}</option>
            <option value="in_behandeling">{t('timeTrackingView.inTreatment', 'In behandeling')}</option>
            <option value="gereed">{t('timeTrackingView.readyIncludingArchive', 'Gereed (incl. archief)')}</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default TimeTrackingViewHeader;
