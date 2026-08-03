import React from "react";
import { useTranslation } from "react-i18next";
import { History, ExternalLink, ShieldCheck, Server } from "lucide-react";
import { appId } from "../../config/firebase";
import { buildAuditLogCloudLoggingUrl } from "../../utils/cloudLoggingUrl";

const AdminLogView = () => {
  const { t } = useTranslation();

  const handleOpenCloudLogging = () => {
    const url = buildAuditLogCloudLoggingUrl(appId);
    window.open(url, "_blank");
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 animate-in fade-in duration-500 text-left overflow-hidden">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 p-8 flex flex-col md:flex-row justify-between items-center shrink-0 shadow-sm gap-6">
        <div className="flex items-center gap-6 text-left">
          <div className="p-4 bg-slate-900 text-white rounded-[20px] shadow-lg">
            <History size={28} />
          </div>
          <div className="text-left">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              {t('common.activity', 'Activiteit')} <span className="text-blue-600">{t('common.audit', 'Audit')}</span>
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-500" /> Google Cloud Logging
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 border-l border-slate-200 pl-3">
                {t('common.isoCompliant', 'ISO 27001 Compliant')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="bg-white p-12 rounded-[40px] shadow-xl border border-slate-100 max-w-2xl w-full text-center">
          <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-[30px] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <Server size={48} strokeWidth={1.5} />
          </div>
          
          <h3 className="text-2xl font-black text-slate-800 mb-4 tracking-tight">
            Enterprise Audit Logging
          </h3>
          
          <p className="text-slate-500 font-medium mb-8 max-w-lg mx-auto leading-relaxed">
            Om te voldoen aan ISO 9001 en ISO 27001 richtlijnen, en om onnodige databasekosten te voorkomen, worden alle audit logs veilig weggeschreven naar <strong className="text-slate-700">Google Cloud Logging</strong>. Deze logs zijn onwijzigbaar en op schaal doorzoekbaar.
          </p>

          <button
            onClick={handleOpenCloudLogging}
            className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.1em] hover:bg-blue-600 transition-all shadow-xl hover:shadow-blue-500/20 active:scale-95"
          >
            <span>Open Cloud Logging</span>
            <ExternalLink size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
          
          <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Tamper-evident logs (Immutable)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogView;
