import React from 'react';
import { Calendar, ChevronRight, Factory } from 'lucide-react';
import StatusBadge from './common/StatusBadge';

type TranslateFn = any;

type PlanningSidebarOrderCardProps = {
  order: Record<string, unknown>;
  onSelect: (order: Record<string, unknown>) => void;
  isSelected: boolean;
  isNew: boolean;
  isDelegated: boolean;
  isDelegatedStatus: boolean;
  isCancelled: boolean;
  isOnHold: boolean;
  effectiveStatus: string;
  plannedAmount: number;
  finishedAmount: number;
  cardTintClass: string;
  priorityBadge: { label: string; className: string } | null;
  orderTypeBadge: { label: string; className: string } | null;
  predictionLabel: string;
  predictionClass: string;
  orderWithPrediction: Record<string, unknown>;
  getOrderDisplayName: (order: Record<string, unknown>) => string;
  formatDeliveryDate: (order: Record<string, unknown>) => string;
  formatDateWithWeek: (value: unknown) => string;
  t: TranslateFn;
};

const PlanningSidebarOrderCard = ({
  order,
  onSelect,
  isSelected,
  isNew,
  isDelegated,
  isDelegatedStatus,
  isCancelled,
  isOnHold,
  effectiveStatus,
  plannedAmount,
  finishedAmount,
  cardTintClass,
  priorityBadge,
  orderTypeBadge,
  predictionLabel,
  predictionClass,
  orderWithPrediction,
  getOrderDisplayName,
  formatDeliveryDate,
  formatDateWithWeek,
  t,
}: PlanningSidebarOrderCardProps) => {
  return (
    <div className="px-3 py-1.5">
      <button
        onClick={() => onSelect(orderWithPrediction)}
        className={`w-full p-4 rounded-[28px] border-2 text-left transition-all duration-200 group relative overflow-hidden block
          ${
            isSelected
              ? 'bg-emerald-50 border-emerald-500 shadow-md shadow-emerald-100'
              : isCancelled
                ? 'bg-slate-50 border-slate-100 opacity-60 grayscale'
                : isOnHold
                  ? 'bg-orange-50/50 border-orange-200 opacity-80'
                  : cardTintClass
          }
        `}
      >
        {isNew && (
          <div className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-bl-lg z-10 shadow-sm">
            Nieuw
          </div>
        )}

        {priorityBadge && (
          <div className="absolute top-0 right-0 w-1.5 h-full bg-amber-500 animate-pulse" />
        )}

        <div className="flex justify-between items-start gap-2 mb-1.5">
          <div className="flex flex-col overflow-hidden min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`font-black text-sm tracking-tighter truncate ${isSelected ? 'text-emerald-800' : 'text-slate-900'}`}>
                {String((order as Record<string, unknown>).orderId || '') || t('digitalplanning.sidebar.no_id')}
              </span>
              <span className="text-[9px] font-bold text-slate-400 truncate">
                {String((order as Record<string, unknown>).itemCode || (order as Record<string, unknown>).productId || '-')}
              </span>
            </div>

            <span className={`font-bold text-xs truncate ${isSelected ? 'text-emerald-700' : 'text-slate-600'}`}>
              {getOrderDisplayName(order)}
            </span>

            {((String((order as Record<string, unknown>).extraCode || '').trim() && String((order as Record<string, unknown>).extraCode || '').trim() !== '-') || orderTypeBadge || String((order as Record<string, unknown>).project || '').trim() || priorityBadge || isDelegated) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {isDelegated && (
                  <span title={`Gedelegeerd aan ${String((order as Record<string, unknown>).delegatedTo || '')}`}>
                    <Factory size={10} className="text-purple-500" />
                  </span>
                )}
                {priorityBadge && (
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide ${priorityBadge.className}`}>
                    {priorityBadge.label}
                  </span>
                )}
                {(() => {
                  const extraCode = String((order as Record<string, unknown>).extraCode || '').trim();
                  return extraCode && extraCode !== '-' ? (
                    <span className="px-1.5 py-0.5 bg-amber-400 text-amber-900 border border-amber-500 rounded text-[8px] font-black uppercase tracking-wide">
                      {extraCode}
                    </span>
                  ) : null;
                })()}
                {orderTypeBadge && (
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide ${orderTypeBadge.className}`}>
                    {orderTypeBadge.label}
                  </span>
                )}
                {(() => {
                  const project = String((order as Record<string, unknown>).project || '').trim();
                  return project ? (
                    <span className="text-[8px] font-bold uppercase tracking-tighter text-slate-400 truncate max-w-[120px]">
                      {project}
                    </span>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          <div className="shrink-0 mt-0.5">
            {isDelegatedStatus ? (
              <span className="px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200 shadow-sm">
                Delegated
              </span>
            ) : (
              <StatusBadge status={effectiveStatus} />
            )}
          </div>
        </div>

        <div className="mb-1 rounded-xl border border-slate-100 bg-slate-50/70 p-2 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-black uppercase tracking-tighter text-blue-600">{t('planningSidebar.totalReady', 'Totaal Gereed')}</p>
            <p className="text-[8px] font-black text-blue-900 bg-blue-100/50 px-1 py-0 rounded">
              {finishedAmount} / {plannedAmount}
            </p>
          </div>

          <div className="h-px bg-slate-200 w-full opacity-50" />

          <div className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-2 text-slate-500">
              <div className="flex items-center gap-1.5">
                <Calendar size={10} className="mt-0.5 text-slate-400 shrink-0" />
                <span className="uppercase text-slate-400 text-[7px] font-bold">{t('planningSidebar.delivery', 'Lever:')}</span>
              </div>
              <span className="text-right text-[7px] font-black text-slate-700 ml-1">{formatDeliveryDate(order)}</span>
            </div>

            <div className="flex items-start justify-between gap-2 text-slate-500">
              <div className="flex items-center gap-1.5">
                <Calendar size={10} className="mt-0.5 text-slate-400 shrink-0" />
                <span className="uppercase text-slate-400 text-[7px] font-bold truncate max-w-[90px]" title={t('digitalplanning.sidebar.predicted_ready', 'Voorspelde gereeddatum')}>
                  Voorspr:
                </span>
              </div>
              <div className="min-w-0 text-right">
                <span className="block text-[7px] font-black text-slate-700">
                  {formatDateWithWeek(orderWithPrediction.predictedReadyDate)}
                </span>
                <span className={`block text-[7px] font-bold ${predictionClass}`}>
                  {predictionLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 right-4">
          <ChevronRight size={16} className={`transition-transform duration-300 ${isSelected ? 'text-emerald-500 translate-x-1' : 'text-slate-200 group-hover:text-slate-400'}`} />
        </div>
      </button>
    </div>
  );
};

export default PlanningSidebarOrderCard;
