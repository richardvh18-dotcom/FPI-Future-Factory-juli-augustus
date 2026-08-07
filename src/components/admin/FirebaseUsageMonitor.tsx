import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Loader2, Activity, Database, Zap, Globe, AlertTriangle, AlertCircle, RefreshCw } from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";

type UsageData = {
  firestoreReads: number;
  firestoreWrites: number;
  functionInvocations: number;
  hostingRequests: number;
};

type UsageResponse = {
  status: string;
  projectId: string;
  timestamp: string;
  usage: {
    last24Hours: UsageData;
  };
  message: string;
};

export default function FirebaseUsageMonitor() {
  const { t } = useTranslation();
  const { role } = useAdminAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(1);
  const [data, setData] = useState<UsageResponse | null>(null);

  const fetchUsageData = async () => {
    if (role !== "admin") {
      setError(t('firebaseUsage.notAdmin', 'Alleen beheerders hebben toegang tot deze module.'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const functions = getFunctions(undefined, "europe-west1"); // Ensure region matches your init
      const getUsage = httpsCallable<{ periodDays?: number }, UsageResponse>(functions, 'getFirebaseUsageAndCosts');
      const response = await getUsage({ periodDays });
      setData(response.data);
    } catch (err: any) {
      console.error("Error fetching usage:", err);
      if (err?.code === "functions/permission-denied") {
        setError(t('firebaseUsage.permissionDenied', 'Toegang geweigerd. Zorg ervoor dat het Firebase Service Account de juiste IAM rollen (Monitoring Viewer) heeft op GCP.'));
      } else {
        setError(err.message || t('firebaseUsage.error', 'Er is een fout opgetreden bij het ophalen van het gebruik.'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageData();
  }, [role, periodDays]);

  const StatCard = ({ title, value, icon: Icon, colorClass, cost }: { title: string; value: number; icon: any; colorClass: string; cost?: string }) => (
    <div className={`p-6 rounded-3xl border-2 bg-white flex items-center gap-4 shadow-sm hover:shadow-md transition-all ${colorClass}`}>
      <div className="p-4 rounded-2xl bg-white shadow-sm shrink-0">
        <Icon size={28} className={colorClass.replace('border-', 'text-').split(' ')[0]} />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-black text-slate-800 tracking-tight">{value.toLocaleString('nl-NL')}</p>
        {cost && <p className="text-xs font-bold text-emerald-600 mt-1">{cost}</p>}
      </div>
    </div>
  );

  const formatCost = (cost: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cost);

  const calculateReadCost = (reads: number) => {
    // ~$0.034 per 100k reads after free tier (which is 50k per day, but we ignore free tier for simplicity in gross estimate, or use it roughly)
    const cost = Math.max(0, (reads - 50000 * periodDays)) * (0.034 / 100000);
    return formatCost(cost);
  };

  const calculateWriteCost = (writes: number) => {
    // ~$0.103 per 100k writes after free tier (20k per day)
    const cost = Math.max(0, (writes - 20000 * periodDays)) * (0.103 / 100000);
    return formatCost(cost);
  };

  const calculateFunctionCost = (invocations: number) => {
    // ~$0.36 per 1M invocations
    const cost = invocations * (0.36 / 1000000);
    return formatCost(cost);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-8 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tight flex items-center gap-3">
            <Activity className="text-indigo-600" size={32} />
            {t('firebaseUsage.title', 'Firebase Gebruik')}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1">
            {t('firebaseUsage.subtitle', 'Live integratie met Google Cloud Monitoring API.')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="bg-white border-2 border-slate-200 text-slate-700 px-4 py-3 rounded-2xl font-bold uppercase tracking-wider text-xs outline-none focus:border-indigo-400 transition-all cursor-pointer"
          >
            <option value={1}>{t('firebaseUsage.24h', 'Laatste 24 uur')}</option>
            <option value={7}>{t('firebaseUsage.7d', 'Laatste 7 dagen')}</option>
            <option value={30}>{t('firebaseUsage.30d', 'Laatste 30 dagen')}</option>
          </select>
          <button
            onClick={fetchUsageData}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-md transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span className="hidden sm:inline">{t('common.refresh', 'Vernieuwen')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-200 p-6 rounded-3xl flex items-start gap-4 text-red-800">
          <AlertTriangle size={24} className="shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-lg">{t('common.error', 'Fout')}</h3>
            <p className="text-sm mt-1">{error}</p>
            <p className="text-xs mt-3 opacity-80 italic">
              * Controleer of je Service Account de 'Monitoring Viewer' rol heeft in de IAM console van GCP.
            </p>
          </div>
        </div>
      )}

      {loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4">
          <Loader2 size={48} className="animate-spin text-indigo-400" />
          <p className="font-bold uppercase tracking-widest text-xs italic">
            {t('firebaseUsage.loading', 'Metrics ophalen via GCP...')}
          </p>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="Firestore Reads" 
              value={data.usage.last24Hours.firestoreReads} 
              icon={Database} 
              colorClass="border-blue-200"
              cost={calculateReadCost(data.usage.last24Hours.firestoreReads)}
            />
            <StatCard 
              title="Firestore Writes" 
              value={data.usage.last24Hours.firestoreWrites} 
              icon={Database} 
              colorClass="border-emerald-200"
              cost={calculateWriteCost(data.usage.last24Hours.firestoreWrites)}
            />
            <StatCard 
              title="Function Calls" 
              value={data.usage.last24Hours.functionInvocations} 
              icon={Zap} 
              colorClass="border-amber-200"
              cost={calculateFunctionCost(data.usage.last24Hours.functionInvocations)}
            />
            <StatCard 
              title="Hosting Requests" 
              value={data.usage.last24Hours.hostingRequests} 
              icon={Globe} 
              colorClass="border-purple-200"
              cost="~ € 0,00" 
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 p-6 rounded-3xl flex items-start gap-4 text-blue-800">
            <AlertCircle size={24} className="shrink-0 mt-1" />
            <div>
              <h3 className="font-bold">{t('firebaseUsage.infoTitle', 'Over deze statistieken')}</h3>
              <p className="text-sm mt-1">
                {t('firebaseUsage.infoDesc', 'Deze data toont de activiteit van de geselecteerde periode. Actuele kosten in euro\'s zijn via de API met 24-48 uur vertraagd. Voor live financiële overzichten raden wij aan de BigQuery Billing Export te activeren binnen Google Cloud.')}
              </p>
              <p className="text-xs mt-2 font-mono bg-blue-100 px-2 py-1 rounded inline-block">
                Project ID: {data.projectId}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
