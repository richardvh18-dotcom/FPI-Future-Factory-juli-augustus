import React from "react";
import { useTranslation } from "react-i18next";
import { Filter, X, Package, MapPin, Clock } from "lucide-react";
import StatusBadge from "../../digitalplanning/common/StatusBadge";
import { OrderWithProducts } from "./ShopFloorTypes";

interface OrderListViewProps {
  filteredOrders: OrderWithProducts[];
  selectedMachineFilter: string | null;
  setSelectedMachineFilter: (filter: string | null) => void;
  setSelectedOrder: (order: OrderWithProducts) => void;
}

export const OrderListView: React.FC<OrderListViewProps> = ({
  filteredOrders,
  selectedMachineFilter,
  setSelectedMachineFilter,
  setSelectedOrder,
}) => {
  const { t } = useTranslation();

  const activeOrders = filteredOrders
    .filter((o) =>
      ["in_production", "in_progress", "planned", "delegated", "pending"].includes(o.status || "")
    )
    .sort((a, b) => {
      const isActiveA = a.status === "in_production" || a.status === "in_progress";
      const isActiveB = b.status === "in_production" || b.status === "in_progress";
      if (isActiveA && !isActiveB) return -1;
      if (!isActiveA && isActiveB) return 1;
      return 0;
    });

  return (
    <>
      {selectedMachineFilter && (
        <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl mb-3 border border-blue-100 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-blue-600" />
            <span className="text-sm font-bold text-blue-800">
              Machine: {selectedMachineFilter}
            </span>
          </div>
          <button
            onClick={() => setSelectedMachineFilter(null)}
            className="p-1 bg-white rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}
      
      {activeOrders.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Package size={48} className="mx-auto mb-4 opacity-30" />
          <div className="font-bold text-sm">
            {t("planning.shopFloor.noActiveOrders", "Geen actieve orders")}
          </div>
        </div>
      ) : (
        activeOrders.map((order) => (
          <div
            key={order.id || order.orderId}
            className="bg-white rounded-2xl border-2 border-slate-200 p-4 cursor-pointer hover:border-indigo-300 transition-all active:scale-95 mb-3"
            onClick={() => setSelectedOrder(order)}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-lg font-black text-slate-800">
                  {order.orderId || order.item}
                </div>
                <div className="text-sm text-slate-600">{order.itemCode}</div>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1">
                <MapPin size={14} />
                <span className="font-bold">{order.machine}</span>
              </div>
              <div className="flex items-center gap-1">
                <Package size={14} />
                <span className="font-bold">{order.plan} stuks</span>
              </div>
              {order.estimatedHours && (
                <div className="flex items-center gap-1">
                  <Clock size={14} />
                  <span className="font-bold">{order.estimatedHours}h</span>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </>
  );
};
