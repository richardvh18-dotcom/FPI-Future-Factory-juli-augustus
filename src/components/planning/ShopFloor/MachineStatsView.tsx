import React from "react";
import { useTranslation } from "react-i18next";
import { Filter, MapPin, UserCheck, PlayCircle, XCircle, AlertTriangle, Package, Activity, Clock } from "lucide-react";
import { MachineStat, OrderWithProducts } from "./ShopFloorTypes";

interface MachineStatsViewProps {
  filteredMachines: MachineStat[];
  roleKey: string;
  setSelectedMachineDetail: (machine: MachineStat) => void;
  setSelectedMachineFilter: (filter: string) => void;
  setActiveView: (view: string) => void;
  setSelectedOrder: (order: OrderWithProducts) => void;
}

export const MachineStatsView: React.FC<MachineStatsViewProps> = ({
  filteredMachines,
  roleKey,
  setSelectedMachineDetail,
  setSelectedMachineFilter,
  setActiveView,
  setSelectedOrder,
}) => {
  const { t } = useTranslation();

  if (filteredMachines.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Filter size={48} className="mx-auto mb-4 opacity-30" />
        <div className="font-bold text-sm">
          {t("planning.shopFloor.noMachinesFound", "Geen machines gevonden")}
        </div>
      </div>
    );
  }

  return (
    <>
      {filteredMachines.map((machine) => (
        <div
          key={machine.id}
          onClick={() => {
            if (["teamleader", "planner", "admin"].includes(roleKey)) {
              setSelectedMachineDetail(machine);
            } else {
              setSelectedMachineFilter(String(machine.machine || ""));
              setActiveView("orders");
            }
          }}
          className={`bg-white rounded-2xl border-2 p-4 transition-all cursor-pointer ${
            machine.hasIssues
              ? "border-red-200 shadow-lg"
              : machine.isActive
              ? "border-emerald-200"
              : "border-slate-100 hover:border-blue-300"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={16} className="text-indigo-600" />
                <div className="text-lg font-black text-slate-800">{machine.machine}</div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-slate-600 font-bold">
                <UserCheck
                  size={14}
                  className={machine.operatorName ? "text-emerald-600" : "text-slate-300"}
                />
                <span className={machine.operatorName ? "text-slate-800" : "text-slate-400 italic"}>
                  {machine.operatorName || t("planning.shopFloor.noOperator", "Geen operator")}
                </span>
              </div>
            </div>
            <div
              className={`px-3 py-1 rounded-lg text-xs font-bold ${
                machine.status === "issue"
                  ? "bg-red-100 text-red-700"
                  : machine.status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {machine.status === "issue"
                ? t("planning.shopFloor.issueStatus", "🔴 Issue")
                : machine.status === "active"
                ? t("planning.shopFloor.activeStatus", "🟢 Actief")
                : t("planning.shopFloor.idleStatus", "⚪ Idle")}
            </div>
          </div>

          {machine.activeOrder && (
            <div
              className="bg-blue-50 rounded-xl p-3 mb-3 cursor-pointer hover:bg-blue-100 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (machine.activeOrder) setSelectedOrder(machine.activeOrder as OrderWithProducts);
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <PlayCircle size={14} className="text-blue-600" />
                <div className="text-xs font-bold text-blue-900">
                  {t("planning.shopFloor.inProduction", "In Productie")}
                </div>
              </div>
              <div className="text-sm font-black text-slate-800">
                {String(machine.activeOrder.orderId || machine.activeOrder.item)}
              </div>
              {!!machine.activeOrder.plan && (
                <div className="text-xs text-slate-600 mt-1">
                  {t("planning.shopFloor.quantityPieces", "{{count}} stuks", {
                    count: Number(machine.activeOrder.plan),
                  })}
                </div>
              )}
            </div>
          )}

          {machine.hasIssues && (
            <div className="space-y-2">
              {machine.downtimeCount > 0 && (
                <div className="flex items-center gap-2 text-orange-700 bg-orange-50 px-3 py-2 rounded-lg">
                  <XCircle size={16} />
                  <span className="text-xs font-bold">
                    {t("planning.shopFloor.downtimeReports", "{{count}} stilstand meldingen", {
                      count: machine.downtimeCount,
                    })}
                  </span>
                </div>
              )}
              {machine.defectCount > 0 && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertTriangle size={16} />
                  <span className="text-xs font-bold">
                    {t("planning.shopFloor.qualityIssues", "{{count}} kwaliteit issues", {
                      count: machine.defectCount,
                    })}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMachineFilter(String(machine.machine || ""));
                setActiveView("orders");
              }}
              className="flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors"
            >
              <Package size={14} />
              <span className="text-xs font-bold">
                {t("planning.shopFloor.ordersCount", "{{count}} orders", {
                  count: machine.ordersCount,
                })}
              </span>
            </button>
            <div className="flex items-center gap-1 text-slate-600">
              <Activity size={14} />
              <span className="text-xs font-bold">
                {t("planning.shopFloor.activeCount", "{{count}} actief", {
                  count: machine.activeProductsCount,
                })}
              </span>
            </div>
            {machine.hoursPerWeek && (
              <div className="flex items-center gap-1 text-slate-600">
                <Clock size={14} />
                <span className="text-xs font-bold">{machine.hoursPerWeek}h/week</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
};
