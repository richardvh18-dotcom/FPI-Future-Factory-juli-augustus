import React from "react";
import { Filter, Loader2 } from "lucide-react";

type AnyRecord = Record<string, unknown>;

type AdminReportsFiltersProps = {
  t: (key: string, fallback?: string) => string;
  dateRange: string;
  setDateRange: (val: string) => void;
  selectedReport: AnyRecord | null;
  filters: unknown;
  setFilters: () => void;
  loading: boolean;
  generateReportData: () => void;
  isDepartmentScopedReport: (id: string) => boolean;
  productionDepartmentFilter: string;
  setProductionDepartmentFilter: (val: string) => void;
  factoryDepartmentMeta: unknown;
  offeredDepartmentFilter: string;
  setOfferedDepartmentFilter: (val: string) => void;
  offeredWorkstationFilter: string;
  setOfferedWorkstationFilter: (val: string) => void;
  reportData: AnyRecord | null;
  getDepartmentDisplayLabel: (deptKey: unknown) => string;
};

export const AdminReportsFilters = ({
  t,
  dateRange,
  setDateRange,
  selectedReport,
  filters,
  setFilters,
  loading,
  generateReportData,
  isDepartmentScopedReport,
  productionDepartmentFilter,
  setProductionDepartmentFilter,
  factoryDepartmentMeta,
  offeredDepartmentFilter,
  setOfferedDepartmentFilter,
  offeredWorkstationFilter,
  setOfferedWorkstationFilter,
  reportData,
  getDepartmentDisplayLabel,
}: AdminReportsFiltersProps) => {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <select
        value={dateRange}
        onChange={(e) => setDateRange(e.target.value)}
        className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
      >
        <option value="today">{t("adminReportsView.today", "Vandaag")}</option>
        <option value="week">{t("adminReportsView.thisWeek", "Deze Week")}</option>
        <option value="month">{t("adminReportsView.thisMonth", "Deze Maand")}</option>
        <option value="custom">{t("adminReportsView.customPeriod", "Custom Periode")}</option>
      </select>

      {selectedReport?.id !== "offered_totals" && (
        <select
          value={filters.station}
          onChange={(e) => setFilters({ ...filters, station: e.target.value })}
          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
        >
          <option value="ALL">{t("adminReportsView.allWorkstations", "Alle Werkstations")}</option>
          <option value="BH11">{t("adminReportsView.stationBh11", "BH11")}</option>
          <option value="BH16">{t("adminReportsView.stationBh16", "BH16")}</option>
          <option value="BH18">{t("adminReportsView.stationBh18", "BH18")}</option>
          <option value="BH31">{t("adminReportsView.stationBh31", "BH31")}</option>
          <option value="BM01">{t("adminReportsView.stationBm01", "BM01")}</option>
        </select>
      )}

      <button
        onClick={() => generateReportData()}
        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
        {loading ? t("common.loading", "Laden...") : t("adminReportsView.generateReport", "Genereer Rapport")}
      </button>

      {selectedReport?.id && isDepartmentScopedReport(selectedReport.id) && (
        <select
          value={productionDepartmentFilter}
          onChange={(e) => setProductionDepartmentFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
        >
          <option value="ALL">{t("adminReportsView.allDepartments", "Alle Afdelingen")}</option>
          {factoryDepartmentMeta.byLabelList
            .map((d: AnyRecord) => d.label)
            .sort((a: string, b: string) => a.localeCompare(b))
            .map((label: string) => (
              <option key={label} value={label}>{label}</option>
            ))}
        </select>
      )}

      {selectedReport?.id === "offered_totals" && (
        <>
          <select
            value={offeredDepartmentFilter}
            onChange={(e) => {
              setOfferedDepartmentFilter(e.target.value);
              setOfferedWorkstationFilter("ALL");
            }}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">{t("adminReportsView.allDepartments", "Alle Afdelingen")}</option>
            {(reportData?.availableDepartments || []).map((dept: string) => (
              <option key={dept} value={dept}>{getDepartmentDisplayLabel(dept)}</option>
            ))}
          </select>

          <select
            value={offeredWorkstationFilter}
            onChange={(e) => setOfferedWorkstationFilter(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">{t("adminReportsView.allWorkstations", "Alle Werkstations")}</option>
            {(reportData?.availableWorkstations || []).map((station: string) => (
              <option key={station} value={station}>{station}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
};
