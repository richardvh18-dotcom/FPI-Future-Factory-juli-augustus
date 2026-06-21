import React, { useMemo, FC, useState, useEffect } from 'react';
import StatusBadge from './common/StatusBadge';
import { format, differenceInDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { toDateSafe } from '../../utils/dateUtils';
import { inforSyncService, InforOrderMeta } from '../../services/inforSyncService';
import { AlertTriangle } from 'lucide-react';

interface Order {
  id?: string;
  itemCode?: string;
  productId?: string;
  week?: string | number;
  weekNumber?: string | number;
  deliveryDate?: any;
  plannedDate?: any;
  produced?: number;
  plan?: number;
  quantity?: number;
  status?: string;
  orderId?: string;
  orderNumber?: string;
  labels?: string[];
  project?: string;
  [key: string]: any;
}

interface MalOptimizationPanelProps {
  currentOrder: Order | null;
  allOrders: Order[];
  onSelectOrder?: (id?: string) => void;
}

const MalOptimizationPanel: FC<MalOptimizationPanelProps> = ({ currentOrder, allOrders, onSelectOrder }) => {
  const { t } = useTranslation();
  const [inforMeta, setInforMeta] = useState<Map<string, InforOrderMeta>>(new Map());

  const parseDateSafe = (dateInput: any): Date | null => {
    return toDateSafe(dateInput);
  };

  const getPlanningInfo = (order: Order, meta?: InforOrderMeta): string => {
    const weekRaw = String(order.week || order.weekNumber || '').trim();
    // Prioritize Infor LN delivery date if available, else fallback to standard date
    const deliveryDate = meta?.deliveryDate || parseDateSafe(order.deliveryDate || order.plannedDate);

    let weekLabel = '';
    if (weekRaw) {
      if (weekRaw.toUpperCase().includes('-W')) {
        const parts = weekRaw.toUpperCase().split('-W');
        weekLabel = t('digitalplanning.optimization.week', { week: parts[1] || weekRaw, defaultValue: 'Week {{week}}' });
      } else {
        weekLabel = t('digitalplanning.optimization.week', { week: weekRaw, defaultValue: 'Week {{week}}' });
      }
    }

    const dateLabel = deliveryDate
      ? t('digitalplanning.optimization.delivery_date', {
          date: format(deliveryDate, 'dd-MM-yyyy'),
          defaultValue: 'Leverdatum {{date}}',
        })
      : '';

    if (weekLabel && dateLabel) return `${weekLabel} • ${dateLabel}`;
    return weekLabel || dateLabel || t('digitalplanning.optimization.unknown', 'Week/leverdatum onbekend');
  };

  // Zoek orders met hetzelfde product die nog niet klaar zijn
  const rawRelatedOrders = useMemo(() => {
    if (!currentOrder || !allOrders) return [];

    const currentCode = currentOrder.itemCode || currentOrder.productId;

    return allOrders.filter((order: Order) => 
      (order.itemCode || order.productId) === currentCode && // Zelfde product
      order.id !== currentOrder.id && // Niet de huide order
      (order.produced || 0) < (order.plan || order.quantity || 0) && // Nog niet klaar
      order.status !== 'completed' && 
      order.status !== 'shipped'
    );
  }, [currentOrder, allOrders]);

  // Haal Infor LN metadata op voor de gerelateerde orders
  useEffect(() => {
    const fetchMeta = async () => {
      const orderIds = rawRelatedOrders.map(o => o.orderId || o.id || '').filter(Boolean);
      if (orderIds.length > 0) {
        const meta = await inforSyncService.fetchOrderMetadata(orderIds);
        setInforMeta(meta);
      }
    };
    fetchMeta();
  }, [rawRelatedOrders]);

  // Sorteer orders op leverdatum (Vrachtwagen-Horizon), urgentie en Spoolbouw-wacht (Pull)
  const relatedOrders = useMemo(() => {
    return [...rawRelatedOrders].sort((a, b) => {
      const metaA = inforMeta.get(a.orderId || a.id || '');
      const metaB = inforMeta.get(b.orderId || b.id || '');

      // 1. Spoolbouw wacht heeft absolute prioriteit
      if (metaA?.isSpoolbouwWaiting && !metaB?.isSpoolbouwWaiting) return -1;
      if (!metaA?.isSpoolbouwWaiting && metaB?.isSpoolbouwWaiting) return 1;

      // 2. Urgent labels / meta flags
      const isUrgentA = metaA?.isUrgent || a.labels?.includes('URGENT');
      const isUrgentB = metaB?.isUrgent || b.labels?.includes('URGENT');
      if (isUrgentA && !isUrgentB) return -1;
      if (!isUrgentA && isUrgentB) return 1;

      // 3. Sorteer op leveringsdatum (dichtstbijzijnde eerst)
      const dateA = metaA?.deliveryDate || parseDateSafe(a.deliveryDate || a.plannedDate);
      const dateB = metaB?.deliveryDate || parseDateSafe(b.deliveryDate || b.plannedDate);
      
      if (dateA && dateB) return dateA.getTime() - dateB.getTime();
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;

      return 0;
    });
  }, [rawRelatedOrders, inforMeta]);

  if (relatedOrders.length === 0) return null;

  return (
    <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 overflow-hidden animate-in fade-in slide-in-from-top-2">
      <div className="p-3 border-b border-blue-100 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/40">
        <h4 className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2 text-sm">
          <span className="text-lg">📦</span> 
          {t('digitalplanning.optimization.title', 'Optimalisatie')}
        </h4>
        <p className="text-xs text-slate-900 dark:text-slate-200 mt-1 font-medium">
          {t('digitalplanning.optimization.orders_count', {
            count: relatedOrders.length,
            product: currentOrder?.itemCode || currentOrder?.productId,
            defaultValue: 'Nog {{count}} orders voor {{product}}.',
          })}
        </p>
      </div>

      <div className="divide-y divide-blue-100 dark:divide-blue-800 max-h-48 overflow-y-auto">
        {relatedOrders.map((order: Order) => {
          const meta = inforMeta.get(order.orderId || order.id || '');
          const isSpoolbouwWaiting = meta?.isSpoolbouwWaiting;
          const isUrgent = meta?.isUrgent || order.labels?.includes('URGENT');

          return (
            <button
              key={order.id}
              onClick={() => onSelectOrder && onSelectOrder(order.id)}
              className="w-full text-left p-2 hover:bg-white dark:hover:bg-gray-800 transition-colors flex justify-between items-center group relative"
            >
              {isSpoolbouwWaiting && (
                <div className="absolute inset-y-0 left-0 w-1 bg-red-500 rounded-r animate-pulse"></div>
              )}
              <div className="pl-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {order.orderId || order.orderNumber}
                  </span>
                  <StatusBadge status={order.status} showIcon={false} />
                  {isUrgent && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase">
                      {t('digitalplanning.optimization.urgent', 'SPOED')}
                    </span>
                  )}
                  {isSpoolbouwWaiting && (
                    <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-black flex items-center gap-1 shadow-sm animate-pulse">
                      <AlertTriangle size={10} />
                      SPOOLBOUW WACHT
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {order.plan || order.quantity} {t('digitalplanning.optimization.pieces', 'stuks')} • {order.project || t('digitalplanning.optimization.internal', 'Intern')}
                </div>
                <div className={`text-[10px] font-semibold mt-0.5 ${isSpoolbouwWaiting || isUrgent ? 'text-red-600' : 'text-blue-700'}`}>
                  {getPlanningInfo(order, meta)}
                </div>
              </div>
              
              <div className="text-blue-600 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all text-xs font-bold shrink-0">
                {t('digitalplanning.optimization.view_link', 'Bekijk →')}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MalOptimizationPanel;

