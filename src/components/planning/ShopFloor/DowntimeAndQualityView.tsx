import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { DowntimeReport, DefectReport } from "./ShopFloorTypes";

interface DowntimeViewProps {
  downtimeReports: DowntimeReport[];
  resolveDowntime: (id: string) => void;
}

export const DowntimeView: React.FC<DowntimeViewProps> = ({
  downtimeReports,
  resolveDowntime,
}) => {
  const { t } = useTranslation();
  const activeReports = downtimeReports.filter((d) => d.status === "active");

  if (activeReports.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <CheckCircle size={48} className="mx-auto mb-4 text-emerald-300" />
        <div className="font-bold text-sm">
          {t("planning.shopFloor.noActiveDowntimeReports", "Geen actieve stilstand meldingen")}
        </div>
      </div>
    );
  }

  return (
    <>
      {activeReports.map((downtime) => (
        <div key={downtime.id} className="bg-white rounded-2xl border-2 border-orange-200 p-4 mb-3">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="text-orange-600" size={20} />
                <div className="text-lg font-black text-slate-800">{downtime.machine}</div>
              </div>
              <div className="text-sm text-slate-600 font-bold">{downtime.reason}</div>
            </div>
            <div className="px-3 py-1 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">
              {downtime.estimatedMinutes || "?"} min
            </div>
          </div>

          <div className="text-xs text-slate-500 mb-3">
            {t("planning.shopFloor.reportedBy", "Gemeld door")}:{" "}
            {downtime.operatorName || t("planning.shopFloor.unknown", "Onbekend")}
          </div>

          <button
            onClick={() => resolveDowntime(downtime.id)}
            className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors"
          >
            ✅ {t("planning.shopFloor.resolved", "Opgelost")}
          </button>
        </div>
      ))}
    </>
  );
};

interface QualityViewProps {
  defectReports: DefectReport[];
  resolveDefect: (id: string) => void;
}

export const QualityView: React.FC<QualityViewProps> = ({ defectReports, resolveDefect }) => {
  const { t } = useTranslation();
  const openReports = defectReports.filter((d) => d.status === "open");

  if (openReports.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <CheckCircle size={48} className="mx-auto mb-4 text-emerald-300" />
        <div className="font-bold text-sm">
          {t("planning.shopFloor.noOpenQcIssues", "Geen openstaande QC issues")}
        </div>
      </div>
    );
  }

  return (
    <>
      {openReports.map((defect) => (
        <div key={defect.id} className="bg-white rounded-2xl border-2 border-red-200 p-4 mb-3">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="text-red-600" size={20} />
                <div className="text-lg font-black text-slate-800">{defect.machine}</div>
              </div>
              <div className="text-sm text-slate-600 font-bold">{defect.defectType}</div>
            </div>
            <div
              className={`px-3 py-1 rounded-lg text-xs font-bold ${
                defect.severity === "high"
                  ? "bg-red-500 text-white"
                  : defect.severity === "medium"
                  ? "bg-orange-100 text-orange-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {defect.severity || t("planning.shopFloor.medium", "medium")}
            </div>
          </div>

          {defect.description && (
            <div className="bg-slate-50 rounded-lg p-3 mb-3 text-sm text-slate-700">
              {defect.description}
            </div>
          )}

          <div className="text-xs text-slate-500 mb-3">
            {t("planning.shopFloor.order", "Order")}:{" "}
            {defect.orderId || t("planning.shopFloor.unknown", "Onbekend")} •{" "}
            {t("planning.shopFloor.reportedBy", "Gemeld door")}:{" "}
            {defect.operatorName || t("planning.shopFloor.unknown", "Onbekend")}
          </div>

          <button
            onClick={() => resolveDefect(defect.id)}
            className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors"
          >
            ✅ {t("planning.shopFloor.resolved", "Opgelost")}
          </button>
        </div>
      ))}
    </>
  );
};
