// @ts-nocheck
import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  TrendingUp,
  Clock,
  Users,
  Package,
  Activity,
  Upload,
  Download,
  Filter,
  BarChart3,
  LineChart,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Box,
  Factory,
  Target,
  Zap,
} from "lucide-react";
import { collection, query, getDocs, limit, doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getArchiveItemsPath, PATHS } from "../../config/dbPaths";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useNotifications } from '../../contexts/NotificationContext';
import { fetchScopedEfficiencyHours } from "../../utils/efficiencyScopedReader";
import { executeAtpsOccupancyExport, getAtpsExportMonitor, previewAtpsOccupancyExport } from "../../services/planningSecurityService";
import AdminReportsCategorySelection from "./AdminReportsCategorySelection";

type AnyRecord = Record<string, unknown>;
type LeadTimeRow = { station: string; orderId: string; hours: number };
type FirestoreSnapshotLike = { docs?: Array<{ id?: string; data?: () => AnyRecord; }> };
type FirestoreDbLike = typeof db;
type ReportItem = AnyRecord & {
  id?: string;
  timestamps?: AnyRecord;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  machine?: string;
  originMachine?: string;
  lastStation?: string;
  orderId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  date?: unknown;
  timestamp?: unknown;
  department?: unknown;
  originalDepartment?: unknown;
  [key: string]: unknown;
};

const asPath = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((segment) => String(segment)) : [];

const toRows = (snap: FirestoreSnapshotLike | null | undefined): ReportItem[] =>
  Array.isArray(snap?.docs)
    ? snap.docs.map((d) => ({ id: d?.id, ...((d?.data?.() as AnyRecord) || {}) })) as ReportItem[]
    : [];

const asRecord = (value: unknown): AnyRecord => (value && typeof value === "object" ? value as AnyRecord : {});

const asString = (value: unknown): string => String(value ?? "");

const asBoolean = (value: unknown): boolean => Boolean(value);

const asNumber = (value: unknown): number => Number(value ?? 0);

const getNestedRecord = (value: unknown): AnyRecord => {
  if (!value || typeof value !== "object") return {};
  return value as AnyRecord;
};

const getTimestampDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getCollectionRef = (dbRef: FirestoreDbLike, pathLike: unknown): ReturnType<typeof collection> | null => {
  const path = asPath(pathLike);
  if (!path.length) return null;
  return collection(dbRef, ...path);
};

const getDocRef = (dbRef: FirestoreDbLike, pathLike: unknown): ReturnType<typeof doc> | null => {
  const path = asPath(pathLike);
  if (path.length < 2) return null;
  return doc(dbRef, ...path);
};

const REPORT_TRACKING_READ_LIMIT = 1200;
const REPORT_OCCUPANCY_READ_LIMIT = 1200;
const REPORT_ARCHIVE_READ_LIMIT = 1500;

import { DataSourceBadge, ReportHeaderActions } from "./reports/AdminReportsHeader";
import { AdminReportsFilters } from "./reports/AdminReportsFilters";



/**
 * AdminReportsView - Centrale Rapportage Module
 * Biedt diverse rapportages voor productie, kwaliteit, efficiency en prestaties
 */
import { useAdminReports } from "../../hooks/useAdminReports";
const AdminReportsView = () => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const {
    readDb,
    readPaths,
    usePilotReadData,
    getArchiveItemsPathForSource,
    selectedCategory,
    setSelectedCategory,
    selectedReport,
    setSelectedReport,
    dateRange,
    setDateRange,
    customStartDate,
    customEndDate,
    filters,
    setFilters,
    loading,
    setLoading,
    reportData,
    setReportData,
    offeredDepartmentFilter,
    setOfferedDepartmentFilter,
    offeredWorkstationFilter,
    setOfferedWorkstationFilter,
    offeredKpiFilter,
    setOfferedKpiFilter,
    productionDepartmentFilter,
    setProductionDepartmentFilter,
    factoryDepartments,
    setFactoryDepartments,
    kpiPopup,
    setKpiPopup,
    measurementDetailMode,
    setMeasurementDetailMode,
    measurementWeekOffset,
    setMeasurementWeekOffset,
    measurementLotNumberSearch,
    setMeasurementLotNumberSearch,
    atpsPreviewLoading,
    setAtpsPreviewLoading,
    atpsLiveLoading,
    setAtpsLiveLoading,
    atpsMonitorLoading,
    setAtpsMonitorLoading,
    atpsPreviewLast,
    setAtpsPreviewLast,
    atpsMonitor,
    setAtpsMonitor,
    runAtpsDryRunPreview,
    runAtpsLiveExport,
    runAtpsDryRunPreviewLegacy,
    refreshAtpsMonitor,
    runAtpsLiveExportLegacy,
    factoryDepartmentMeta,
    reportCategories,
    getDateRange,
    getItemDate,
    getDepartmentLabel,
    getDepartmentDisplayLabel,
    getWorkstationLabel,
    isDepartmentScopedReport,
    openKpiPopup,
    closeKpiPopup,
    formatHoursAsHM,
    getMeasurementDetailDateRange,
    isCompletedAtInspection,
    isOfferedToInspection,
    isProducedButNotOffered,
    fetchTrackingProductsInRange,
    fetchProductionData,
    fetchProductionOutputData,
    fetchLeadTimeData,
    fetchOrderCompletionData,
    fetchWipStatusData,
    fetchQualityData,
    fetchEfficiencyData,
    fetchPersonnelData,
    fetchWorkedHoursData,
    fetchTempRejectData,
    fetchMeasurementsData,
    fetchOfferedTotalsData,
    generateReportData,
    buildExportFilename,
    downloadBlob,
    exportToPDF,
    exportToExcel,
    exportToCSV,
    sourceBadge,
    canExport,
    activeReport
  } = useAdminReports(t);
  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto">
          {sourceBadge}
          <button
            onClick={() => setSelectedReport(null)}
            className="mb-4 px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            {t("adminReportsView.backToReports", "← Terug naar rapporten")}
          </button>
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                {activeReport.title}
              </h2>
              <p className="text-sm text-slate-500">{activeReport.description}</p>
            </div>

            <ReportHeaderActions
              t={t}
              atpsPreviewLoading={atpsPreviewLoading}
              atpsLiveLoading={atpsLiveLoading}
              atpsMonitorLoading={atpsMonitorLoading}
              canExport={canExport}
              onRunAtpsDryRunPreview={runAtpsDryRunPreview}
              onRunAtpsLiveExport={runAtpsLiveExport}
              onRefreshAtpsMonitor={refreshAtpsMonitor}
              onExportToCSV={exportToCSV}
              onExportToExcel={exportToExcel}
              onExportToPDF={exportToPDF}
            />
          </div>

          <AdminReportsFilters
            t={t}
            dateRange={dateRange}
            setDateRange={setDateRange}
            selectedReport={selectedReport}
            filters={filters}
            setFilters={setFilters}
            loading={loading}
            generateReportData={generateReportData}
            isDepartmentScopedReport={isDepartmentScopedReport}
            productionDepartmentFilter={productionDepartmentFilter}
            setProductionDepartmentFilter={setProductionDepartmentFilter}
            factoryDepartmentMeta={factoryDepartmentMeta}
            offeredDepartmentFilter={offeredDepartmentFilter}
            setOfferedDepartmentFilter={setOfferedDepartmentFilter}
            offeredWorkstationFilter={offeredWorkstationFilter}
            setOfferedWorkstationFilter={setOfferedWorkstationFilter}
            reportData={reportData}
            getDepartmentDisplayLabel={getDepartmentDisplayLabel}
          />
        </div>
      </div>

      {/* Report Content */}
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          {atpsPreviewLast && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <span className="font-black uppercase tracking-wider">{t("adminReportsView.atpsDryRun", "ATPS Dry-run")}</span>
              <span className="ml-2">
                mode: {String(atpsPreviewLast.mode || "passive")} | records: {Number(atpsPreviewLast?.totals?.count || 0)} | uren: {Number(atpsPreviewLast?.totals?.hoursWorked || 0)}
              </span>
            </div>
          )}

          {atpsMonitor && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
              <div className="font-black uppercase tracking-wider text-slate-800 mb-1">{t("adminReportsView.atpsMonitor", "ATPS Monitor")}</div>
              <div className="flex flex-wrap gap-4">
                <span>{t("adminReportsView.pendingRetries", "Pending retries")}: <strong>{Number(atpsMonitor?.retryQueue?.pendingCount || 0)}</strong></span>
                <span>{t("adminReportsView.failedRetries", "Failed retries")}: <strong>{Number(atpsMonitor?.retryQueue?.failedCount || 0)}</strong></span>
                <span>{t("adminReportsView.latestLiveRun", "Laatste live run")}: <strong>{String(atpsMonitor?.runs?.[0]?.status || "-")}</strong></span>
                <span>{t("adminReportsView.latestPreviewRun", "Laatste preview run")}: <strong>{String(atpsMonitor?.previewRuns?.[0]?.status || "-")}</strong></span>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p className="text-sm text-slate-500 font-bold">{t("adminReportsView.reportGenerating", "Rapport wordt gegenereerd...")}</p>
            </div>
          ) : reportData ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <button
                  type="button"
                  onClick={() => selectedReport?.id === "offered_totals" && openKpiPopup("COMPLETED")}
                  className={`p-6 bg-white rounded-2xl border shadow-sm text-left w-full ${selectedReport?.id === "offered_totals" ? "hover:border-blue-300 transition-colors" : "border-slate-200"} ${selectedReport?.id === "offered_totals" && offeredKpiFilter === "COMPLETED" ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">
                      {selectedReport?.id === "offered_totals" ? t("adminReportsView.reportedReadyTotal", "Gereedgemeld Totaal") : t("adminReportsView.total", "Totaal")}
                    </span>
                    {reportData.summary.change !== undefined && (
                      <div className={`px-2 py-1 rounded-lg text-xs font-bold ${reportData.summary.trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {reportData.summary.trend === 'up' ? '↑' : '↓'} {Math.abs(reportData.summary.change)}%
                      </div>
                    )}
                  </div>
                  <div className="text-4xl font-black text-slate-800">{reportData.summary.total.toLocaleString()}</div>
                </button>

                {selectedReport?.id === "offered_totals" && reportData.summary.offeredTotal !== undefined && (
                  <button
                    type="button"
                    onClick={() => openKpiPopup("OFFERED")}
                    className={`p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border text-left w-full hover:border-emerald-300 transition-colors ${offeredKpiFilter === "OFFERED" ? "border-emerald-500 ring-2 ring-emerald-100" : "border-emerald-200"}`}
                  >
                    <span className="text-xs font-bold text-emerald-700 uppercase block mb-2">{t("adminReportsView.totalOffered", "Totaal Aangeboden")}</span>
                    <div className="text-4xl font-black text-emerald-900">
                      {reportData.summary.offeredTotal.toLocaleString()}
                    </div>
                  </button>
                )}

                {/* Conditionally show FTR for quality reports */}
                {reportData.summary.ftrPercentage !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl border border-green-200">
                    <span className="text-xs font-bold text-green-700 uppercase block mb-2">{t("adminReportsView.firstTimeRight", "First Time Right")}</span>
                    <div className="text-4xl font-black text-green-900">
                      {reportData.summary.ftrPercentage}%
                    </div>
                  </div>
                )}

                {/* Show completed count for production reports */}
                {reportData.summary.completed !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border border-blue-200">
                    <span className="text-xs font-bold text-blue-700 uppercase block mb-2">{t("adminReportsView.completed", "Voltooid")}</span>
                    <div className="text-4xl font-black text-blue-900">
                      {reportData.summary.completed.toLocaleString()}
                    </div>
                  </div>
                )}

                {selectedReport?.id === "offered_totals" && reportData.summary.producedNotOfferedTotal !== undefined && (
                  <button
                    type="button"
                    onClick={() => openKpiPopup("PRODUCED_NOT_OFFERED")}
                    className={`p-6 bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border text-left w-full hover:border-amber-300 transition-colors ${offeredKpiFilter === "PRODUCED_NOT_OFFERED" ? "border-amber-500 ring-2 ring-amber-100" : "border-amber-200"}`}
                  >
                    <span className="text-xs font-bold text-amber-700 uppercase block mb-2">{t("adminReportsView.producedNotOffered", "Geproduceerd, Niet Aangeboden")}</span>
                    <div className="text-4xl font-black text-amber-900">
                      {reportData.summary.producedNotOfferedTotal.toLocaleString()}
                    </div>
                  </button>
                )}

                {selectedReport?.id === "offered_totals" && reportData.summary.departmentsWithOutput !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl border border-indigo-200">
                    <span className="text-xs font-bold text-indigo-700 uppercase block mb-2">{t("adminReportsView.departmentsWithOutput", "Afdelingen Met Output")}</span>
                    <div className="text-4xl font-black text-indigo-900">
                      {reportData.summary.departmentsWithOutput.toLocaleString()}
                    </div>
                  </div>
                )}

                {selectedReport?.id === "offered_totals" && reportData.summary.workstationsWithOutput !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-sky-50 to-sky-100 rounded-2xl border border-sky-200">
                    <span className="text-xs font-bold text-sky-700 uppercase block mb-2">{t("adminReportsView.workstationsWithOutput", "Werkstations Met Output")}</span>
                    <div className="text-4xl font-black text-sky-900">
                      {reportData.summary.workstationsWithOutput.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Show rejected count */}
                {reportData.summary.rejected !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl border border-red-200">
                    <span className="text-xs font-bold text-red-700 uppercase block mb-2">{t("adminReportsView.rejected", "Afgekeurd")}</span>
                    <div className="text-4xl font-black text-red-900">
                      {reportData.summary.rejected.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Fallback cards */}
                {!reportData.summary.ftrPercentage && !reportData.summary.completed && (
                  <>
                <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border border-blue-200">
                  <span className="text-xs font-bold text-blue-700 uppercase block mb-2">{t("adminReportsView.averagePerDay", "Gemiddelde per Dag")}</span>
                  <div className="text-4xl font-black text-blue-900">
                    {Math.round(reportData.summary.total / 7).toLocaleString()}
                  </div>
                </div>

                <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl border border-purple-200">
                  <span className="text-xs font-bold text-purple-700 uppercase block mb-2">{t("adminReportsView.activeStations", "Stations Actief")}</span>
                  <div className="text-4xl font-black text-purple-900">{reportData.chartData.length}</div>
                </div>
                  </>
                )}
              </div>

              {/* Chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-6">
                  {selectedReport?.id === "offered_totals" ? t("adminReportsView.reportedReadyByDepartment", "Gereedgemeld per Afdeling") : t("adminReportsView.overviewPerWorkstation", "Overzicht per Werkstation")}
                </h3>
                {selectedReport?.id === "offered_totals" && (
                  <p className="text-xs text-slate-500 mb-4">
                    {t("adminReportsView.activeKpiFilter", "Actieve KPI-filter")}: {offeredKpiFilter === "COMPLETED" ? t("adminReportsView.reportedReady", "Gereedgemeld") : offeredKpiFilter === "OFFERED" ? t("adminReportsView.offered", "Aangeboden") : offeredKpiFilter === "PRODUCED_NOT_OFFERED" ? t("adminReportsView.producedNotOfferedLower", "Geproduceerd, niet aangeboden") : t("common.all", "Alles")}
                  </p>
                )}
                <div className="space-y-3">
                  {(selectedReport?.id === "offered_totals" && offeredKpiFilter === "PRODUCED_NOT_OFFERED"
                    ? (reportData.departmentOverview || []).map((d: AnyRecord) => ({ label: getDepartmentDisplayLabel(d.department), value: d.producedNotOffered }))
                    : (reportData.chartData || []).map((d: AnyRecord) => ({ label: getDepartmentDisplayLabel(d.label), value: d.value }))
                  ).map((item: AnyRecord, index: number, arr: AnyRecord[]) => {
                    const maxValue = Math.max(1, ...arr.map((d: AnyRecord) => d.value));
                    const percentage = (item.value / maxValue) * 100;
                    
                    return (
                      <div key={index} className="flex items-center gap-4">
                        <div
                          className="w-36 shrink-0 text-sm font-black text-slate-700 truncate"
                          title={item.label}
                        >
                          {item.label}
                        </div>
                        <div className="flex-1 min-w-0 bg-slate-100 rounded-full h-8 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-full flex items-center justify-end px-3 transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          >
                            <span className="text-white text-xs font-bold">{item.value}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedReport?.id === "offered_totals" && Array.isArray(reportData.departmentOverview) && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-200">
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                      Afdelingsoverzicht Gereedmelding
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Afdeling
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Gereedgemeld (Eindinspectie)
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Geproduceerd, Nog Niet Aangeboden
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {reportData.departmentOverview
                          .filter((dept) => {
                            if (offeredKpiFilter === "COMPLETED") return dept.completedAtInspection > 0;
                            if (offeredKpiFilter === "PRODUCED_NOT_OFFERED") return dept.producedNotOffered > 0;
                            return true;
                          })
                          .map((dept) => (
                          <tr key={dept.department} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-sm font-semibold text-slate-800">{getDepartmentDisplayLabel(dept.department)}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{dept.completedAtInspection.toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{dept.producedNotOffered.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedReport?.id === "offered_totals" && Array.isArray(reportData.stationOverview) && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-200">
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                      Werkstation Overzicht
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Werkstation
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Gereedgemeld
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Geproduceerd, Nog Niet Aangeboden
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {reportData.stationOverview
                          .filter((station) => {
                            if (offeredKpiFilter === "COMPLETED") return station.completedAtInspection > 0;
                            if (offeredKpiFilter === "PRODUCED_NOT_OFFERED") return station.producedNotOffered > 0;
                            return true;
                          })
                          .map((station) => (
                            <tr key={station.workstation} className="hover:bg-slate-50">
                              <td className="px-6 py-4 text-sm font-semibold text-slate-800">{station.workstation}</td>
                              <td className="px-6 py-4 text-sm text-slate-700">{station.completedAtInspection.toLocaleString()}</td>
                              <td className="px-6 py-4 text-sm text-slate-700">{station.producedNotOffered.toLocaleString()}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedReport?.id === "offered_totals" && kpiPopup.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
                  <div className="bg-white w-full max-w-6xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                          {kpiPopup.type === "COMPLETED" && t("adminReportsView.kpiDetailReportedReady", "KPI Detail: Gereedgemeld")}
                          {kpiPopup.type === "OFFERED" && t("adminReportsView.kpiDetailOffered", "KPI Detail: Aangeboden")}
                          {kpiPopup.type === "PRODUCED_NOT_OFFERED" && t("adminReportsView.kpiDetailProducedNotOffered", "KPI Detail: Geproduceerd, Niet Aangeboden")}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">{t("adminReportsView.perDepartmentAndWorkstationInCurrentPeriod", "Per afdeling en per werkstation binnen de huidige periode/filters.")}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeKpiPopup}
                        className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200"
                      >
                        {t("common.close", "Sluiten")}
                      </button>
                    </div>

                    <div className="p-6 overflow-auto space-y-6">
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200">
                          <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">{t("adminReportsView.perDepartment", "Per Afdeling")}</h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">{t("adminReportsView.department", "Afdeling")}</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">{t("adminReportsView.amount", "Aantal")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {(reportData.departmentOverview || [])
                                .map((dept: AnyRecord) => ({
                                  label: getDepartmentDisplayLabel(dept.department),
                                  value:
                                    kpiPopup.type === "COMPLETED"
                                      ? dept.completedAtInspection
                                      : kpiPopup.type === "OFFERED"
                                      ? (dept.offeredToInspection || 0)
                                      : dept.producedNotOffered,
                                }))
                                .filter((row: AnyRecord) => row.value > 0)
                                .sort((a: AnyRecord, b: AnyRecord) => b.value - a.value)
                                .map((row: AnyRecord) => (
                                  <tr key={`popup-dept-${row.label}`} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">{row.label}</td>
                                    <td className="px-6 py-4 text-sm text-slate-700">{row.value.toLocaleString()}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200">
                          <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">{t("adminReportsView.perWorkstation", "Per Werkstation")}</h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">{t("adminReportsView.workstation", "Werkstation")}</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">{t("adminReportsView.amount", "Aantal")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {(reportData.stationOverview || [])
                                .map((station: AnyRecord) => ({
                                  label: station.workstation,
                                  value:
                                    kpiPopup.type === "COMPLETED"
                                      ? station.completedAtInspection
                                      : kpiPopup.type === "OFFERED"
                                      ? (station.offeredToInspection || 0)
                                      : station.producedNotOffered,
                                }))
                                .filter((row: AnyRecord) => row.value > 0)
                                .sort((a: AnyRecord, b: AnyRecord) => b.value - a.value)
                                .map((row: AnyRecord) => (
                                  <tr key={`popup-station-${row.label}`} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">{row.label}</td>
                                    <td className="px-6 py-4 text-sm text-slate-700">{row.value.toLocaleString()}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedReport?.id === "offered_totals" && Array.isArray(reportData.timelineData) && reportData.timelineData.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-6">
                    Aangeboden Trend (Dag/Week)
                  </h3>
                  <div className="space-y-3">
                    {reportData.timelineData.map((item: AnyRecord, index: number) => {
                      const maxValue = Math.max(1, ...reportData.timelineData.map((d: AnyRecord) => d.value));
                      const percentage = (item.value / maxValue) * 100;

                      return (
                        <div key={`timeline-${index}`} className="flex items-center gap-4">
                          <div
                            className="w-36 shrink-0 text-sm font-black text-slate-700 truncate"
                            title={item.label}
                          >
                            {item.label}
                          </div>
                          <div className="flex-1 min-w-0 bg-slate-100 rounded-full h-8 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full flex items-center justify-end px-3 transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            >
                              <span className="text-white text-xs font-bold">{item.value}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Details Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                    Gedetailleerd Overzicht
                  </h3>
                  {selectedReport?.id === "product_measurements" && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <select
                        value={measurementDetailMode}
                        onChange={(e) => {
                          const mode = e.target.value;
                          setMeasurementDetailMode(mode);
                          if (mode !== "browse_week") setMeasurementWeekOffset(0);
                        }}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                      >
                        <option value="current_week">{t("adminReportsView.currentWeek", "Huidige Week")}</option>
                        <option value="browse_week">{t("adminReportsView.browseByWeek", "Terugbladeren per Week")}</option>
                        <option value="all">{t("common.all", "Alles")}</option>
                      </select>

                      {measurementDetailMode === "browse_week" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setMeasurementWeekOffset((prev) => prev + 1)}
                            className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200"
                          >
                            ← Oudere Week
                          </button>
                          <button
                            type="button"
                            onClick={() => setMeasurementWeekOffset((prev) => Math.max(prev - 1, 0))}
                            disabled={measurementWeekOffset === 0}
                            className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Nieuwere Week →
                          </button>
                          <span className="text-xs text-slate-500 font-semibold">
                            {measurementWeekOffset === 0 ? "Deze week" : `${measurementWeekOffset} week(en) terug`}
                          </span>
                        </>
                      )}
                      <input
                        type="text"
                        placeholder={t("placeholders.adminReportsLotSearch", "Zoeken op lotnummer...")}
                        value={measurementLotNumberSearch}
                        onChange={(e) => setMeasurementLotNumberSearch(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 placeholder-slate-400"
                      />
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          {selectedReport?.id === "lead_time"
                            ? "Doorlooptijd Metric"
                            : selectedReport?.id === "order_completion"
                            ? "Order"
                            : selectedReport?.id === "wip_status"
                            ? "WIP Segment"
                            : selectedReport?.id === "production_output"
                            ? "Output Segment"
                            : "Product"}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          {selectedReport?.id === "product_measurements"
                            ? "Metingen"
                            : selectedReport?.id === "lead_time"
                            ? "Waarde"
                            : selectedReport?.id === "order_completion"
                            ? "Voortgang"
                            : "Aantal"}
                        </th>
                        {selectedReport?.id === "product_measurements" && (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                              TG
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                              Brix
                            </th>
                          </>
                        )}
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reportData.details
                        .filter((detail: AnyRecord) => {
                          if (selectedReport?.id === "product_measurements" && measurementLotNumberSearch.trim()) {
                            return detail.name.toLowerCase().includes(measurementLotNumberSearch.toLowerCase());
                          }
                          return true;
                        })
                        .map((detail: AnyRecord) => (
                        <tr key={detail.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-medium text-slate-800">{detail.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {selectedReport?.id === "product_measurements" ? (
                              <div className="space-y-1">
                                <div className="font-semibold text-slate-700">{detail.measurementSummary || "Geen meetwaarden"}</div>
                                <div className="text-xs text-slate-400">{detail.count} velden</div>
                              </div>
                            ) : (
                              detail.count
                            )}
                          </td>
                          {selectedReport?.id === "product_measurements" && (
                            <>
                              <td className="px-6 py-4 text-sm text-slate-700 font-semibold">{detail.tgValue || "-"}</td>
                              <td className="px-6 py-4 text-sm text-slate-700 font-semibold">{detail.brixValue || "-"}</td>
                            </>
                          )}
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                detail.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : detail.status === "rejected"
                                  ? "bg-red-100 text-red-700"
                                  : detail.status === "temp_reject"
                                  ? "bg-orange-100 text-orange-700"
                                  : detail.status === "active"
                                  ? "bg-blue-100 text-blue-700"
                                  : detail.status === "idle"
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {detail.status === "completed"
                                ? "Voltooid"
                                : detail.status === "rejected"
                                ? "Afgekeurd"
                                : detail.status === "temp_reject"
                                ? "Tijdelijk Afgekeurd"
                                : detail.status === "active"
                                ? "Actief"
                                : detail.status === "idle"
                                ? "Niet Actief"
                                : "In behandeling"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <FileText className="text-slate-300" size={64} />
              <p className="text-slate-500 text-sm font-bold">{t("adminReportsView.noDataAvailable", "Geen data beschikbaar")}</p>
              <button
                onClick={generateReportData}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Genereer Rapport
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminReportsView;
