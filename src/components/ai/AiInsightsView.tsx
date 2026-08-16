import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { BrainCircuit, AlertTriangle, TrendingUp, TrendingDown, Clock, Factory } from "lucide-react";

type AIInsight = {
  id: string;
  type: string;
  source: string;
  generatedAt: any;
  summary?: string;
  recommendation?: string;
  bottleneckCount?: number;
  predictions?: Array<{
    machine: string;
    day: string;
    demandHours: number;
    capacityHours: number;
    delayHours: number;
    reason: string;
  }>;
};

const AiInsightsView = () => {
  const { t } = useTranslation();
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const colRef = collection(db, getPathString(PATHS.AI_INSIGHTS));
    const q = query(colRef, orderBy("generatedAt", "desc"), limit(20));

    const unsub = onSnapshot(q, (snap) => {
      const data: AIInsight[] = [];
      snap.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as AIInsight);
      });
      setInsights(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <BrainCircuit className="animate-bounce mb-4 text-indigo-400" size={48} />
        <p className="font-medium">{t('ai.insights.loading', 'Inzichten ophalen...')}</p>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
        <BrainCircuit className="mb-4 text-slate-300" size={48} />
        <h3 className="text-lg font-bold text-slate-600 mb-2">
          {t('ai.insights.empty_title', 'Nog geen inzichten')}
        </h3>
        <p className="text-sm max-w-md">
          {t('ai.insights.empty_desc', 'De nachtelijke AI planner heeft nog geen inzichten gegenereerd. Deze draait elke nacht om 04:00 uur.')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <BrainCircuit className="text-indigo-600" size={24} />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800">
            {t('ai.insights.title', 'AI Inzichten & Bottlenecks')}
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            {t('ai.insights.subtitle', 'Automatische analyses gegenereerd door de nachtelijke AI-worker')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {insights.map((insight) => (
          <div key={insight.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${insight.bottleneckCount ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {insight.bottleneckCount ? <AlertTriangle size={18} /> : <TrendingUp size={18} />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-700 capitalize">
                    {insight.type.replace(/_/g, ' ')}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <Clock size={12} />
                    {insight.generatedAt?.toDate() ? format(insight.generatedAt.toDate(), "dd MMMM yyyy HH:mm", { locale: nl }) : 'Onbekend'}
                    <span>&bull;</span>
                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold">
                      {insight.source}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {insight.summary && (
                <div className="text-slate-700 text-sm font-medium leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {insight.summary}
                </div>
              )}

              {insight.predictions && insight.predictions.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t('ai.insights.predictions', 'Gedetecteerde Bottlenecks')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {insight.predictions.map((pred, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-amber-100 bg-amber-50/50">
                        <Factory className="text-amber-500 mt-0.5 shrink-0" size={16} />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-slate-700 text-sm">{pred.machine}</span>
                            <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md">
                              {pred.day}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed mb-2">
                            {pred.reason}
                          </p>
                          <div className="flex items-center gap-3 text-xs font-medium">
                            <span className="text-rose-600 flex items-center gap-1">
                              <TrendingDown size={12} /> Vraag: {pred.demandHours}h
                            </span>
                            <span className="text-emerald-600 flex items-center gap-1">
                              <TrendingUp size={12} /> Cap: {pred.capacityHours}h
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insight.recommendation && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3">
                  <BrainCircuit className="text-indigo-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1">
                      {t('ai.insights.recommendation', 'AI Aanbeveling')}
                    </h4>
                    <p className="text-sm font-medium text-indigo-900 leading-relaxed">
                      {insight.recommendation}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AiInsightsView;
