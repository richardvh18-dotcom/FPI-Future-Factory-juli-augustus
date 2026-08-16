import React from "react";
import { Zap, Upload, Activity, Loader2, FileSpreadsheet, FileText } from "lucide-react";

type DataSourceBadgeProps = {
  t: (key: string, fallback?: string) => string;
  usePilotReadData: boolean;
};

export const DataSourceBadge = ({ t, usePilotReadData }: DataSourceBadgeProps) => (
  <div className={`mb-4 inline-flex items-center rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest ${usePilotReadData ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-slate-100 text-slate-700"}`}>
    {t("adminReportsView.dataSource", "Databron")}: {usePilotReadData ? t("adminReportsView.pilotDbReadOnly", "Pilot DB (Read Only)") : t("adminReportsView.currentDb", "Huidige DB")}
  </div>
);

type ReportHeaderActionsProps = {
  t: (key: string, fallback?: string) => string;
  atpsPreviewLoading: boolean;
  atpsLiveLoading: boolean;
  atpsMonitorLoading: boolean;
  canExport: boolean;
  onRunAtpsDryRunPreview: () => void;
  onRunAtpsLiveExport: () => void;
  onRefreshAtpsMonitor: () => void;
  onExportToCSV: () => void;
  onExportToExcel: () => void;
  onExportToPDF: () => void;
};

export const ReportHeaderActions = ({
  t,
  atpsPreviewLoading,
  atpsLiveLoading,
  atpsMonitorLoading,
  canExport,
  onRunAtpsDryRunPreview,
  onRunAtpsLiveExport,
  onRefreshAtpsMonitor,
  onExportToCSV,
  onExportToExcel,
  onExportToPDF,
}: ReportHeaderActionsProps) => (
  <div className="flex items-center gap-2">
    <button
      onClick={onRunAtpsDryRunPreview}
      disabled={true}
      className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold opacity-60 cursor-not-allowed transition-colors flex items-center gap-2"
      title="ATPS export is tijdelijk uitgeschakeld"
    >
      <Zap size={16} /> {t("adminReportsView.atpsDryRun", "ATPS Dry-run")}
    </button>
    <button
      onClick={onRunAtpsLiveExport}
      disabled={true}
      className="px-4 py-2 bg-rose-50 text-rose-700 rounded-xl text-sm font-bold opacity-60 cursor-not-allowed transition-colors flex items-center gap-2"
      title="ATPS export is tijdelijk uitgeschakeld"
    >
      <Upload size={16} /> {t("adminReportsView.atpsLive", "ATPS Live")}
    </button>
    <button
      onClick={onRefreshAtpsMonitor}
      disabled={atpsMonitorLoading}
      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Ververs ATPS monitor"
    >
      {atpsMonitorLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />} {t("adminReportsView.monitor", "Monitor")}
    </button>
    <button
      onClick={onExportToCSV}
      disabled={!canExport}
      className="px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FileSpreadsheet size={16} /> CSV
    </button>
    <button
      onClick={onExportToExcel}
      disabled={!canExport}
      className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FileSpreadsheet size={16} /> Excel
    </button>
    <button
      onClick={onExportToPDF}
      disabled={!canExport}
      className="px-4 py-2 bg-red-50 text-red-700 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FileText size={16} /> PDF
    </button>
  </div>
);
