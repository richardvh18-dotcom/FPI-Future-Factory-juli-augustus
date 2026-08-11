import React, { useState, useEffect } from 'react';
import { X, Clock, Loader2, AlertCircle, Package } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { PATHS, getPathString } from '../../../config/dbPaths';
import { format } from 'date-fns';
import { fetchOrderActivityLogs } from '../../../services/planningSecurityService';

type OrderHistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
};

type ActivityLog = {
  id: string;
  action: string;
  details: string | Record<string, any>;
  actor: string;
  timestamp: Date | null;
  type: 'admin' | 'production';
};

const OrderHistoryModal = ({ isOpen, onClose, orderId }: OrderHistoryModalProps) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !orderId) return;

    const parseSafeDate = (val: any): Date | null => {
      if (!val) return null;
      try {
        if (typeof val.toDate === 'function') return val.toDate();
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      } catch {
        return null;
      }
    };

    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const fetchedLogs: ActivityLog[] = [];

        // 1. Haal administratieve logs op via Google Cloud Logging
        try {
          const res = await fetchOrderActivityLogs({ orderId });
          if (res.logs && Array.isArray(res.logs)) {
            res.logs.forEach((log: any) => {
              let actor = log.actor && log.actor !== 'system' ? log.actor : 'Systeem';
              let detailsObj = log.details;
              
              if (typeof log.details === 'string') {
                 try { detailsObj = JSON.parse(log.details); } catch {}
              }
              
              if (detailsObj && typeof detailsObj === 'object') {
                 if (detailsObj.actorLabel) actor = detailsObj.actorLabel;
                 else if (detailsObj.userEmail) actor = detailsObj.userEmail;
                 else if (detailsObj.operator) actor = detailsObj.operator;
              }

              let ts = log.timestamp;
              if (ts && typeof ts === 'object' && ts.seconds) {
                 ts = new Date(Number(ts.seconds) * 1000);
              }

              fetchedLogs.push({
                id: log.id,
                action: log.action || 'ONBEKEND',
                details: log.details,
                actor: actor,
                timestamp: parseSafeDate(ts),
                type: 'admin'
              });
            });
          }
        } catch (adminErr) {
          console.error("Fout bij ophalen admin logs:", adminErr);
          setError("Kon Cloud Logging admin logs niet ophalen. Misschien ontbreken permissies.");
        }

        // 2. Haal productie-logs op via tracked_products
        try {
          const trackingRef = collection(db, getPathString(PATHS.TRACKING as string[]));
          const q = query(trackingRef, where('orderId', '==', orderId));
          const snapshot = await getDocs(q);

          snapshot.forEach((doc) => {
            const product = doc.data();
            const history = product.history || [];
            
            history.forEach((step: any, index: number) => {
              const logDate = parseSafeDate(step.timestamp) || parseSafeDate(step.time);

              fetchedLogs.push({
                id: `${doc.id}-step-${index}`,
                action: step.action || step.currentStep || 'Productie Stap',
                details: {
                  message: `Lot ${product.lotNumber || '?'}: ${step.details || step.station || 'bewerking gereed'}`
                },
                actor: step.operatorName || step.operator || step.user || 'Systeem',
                timestamp: logDate,
                type: 'production'
              });
            });
          });
        } catch (prodErr) {
          console.error("Fout bij ophalen productie logs:", prodErr);
        }

        // Sorteer alles op datum aflopend (nieuwste eerst)
        fetchedLogs.sort((a, b) => {
          if (!a.timestamp) return 1;
          if (!b.timestamp) return -1;
          return b.timestamp.getTime() - a.timestamp.getTime();
        });

        setLogs(fetchedLogs);
      } catch (err: unknown) {
        console.error('Fout bij ophalen geschiedenis:', err);
        if (!error) {
           setError('Fout: ' + (err instanceof Error ? err.message : String(err)));
        }
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-200/50 rounded-full text-slate-600">
              <Clock size={20} />
            </div>
            <h3 className="font-bold text-slate-800">Order Geschiedenis: {orderId}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 size={32} className="animate-spin mb-4" />
              <p>Geschiedenis laden (Logs & Productie)...</p>
            </div>
          ) : error && logs.length === 0 ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3">
              <AlertCircle size={20} />
              <p>{error}</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-100 shadow-sm">
              <Clock size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Geen geschiedenis gevonden voor deze order.</p>
              <p className="text-sm mt-1">Zowel administratieve wijzigingen als geproduceerde producten worden hier weergegeven.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {error && (
                 <div className="p-3 mb-2 text-sm bg-amber-50 text-amber-700 rounded-lg flex items-center gap-2">
                   <AlertCircle size={16} />
                   <p>{error}</p>
                 </div>
              )}
              {logs.map((log) => (
                <div key={log.id} className={`bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-2 ${log.type === 'production' ? 'border-blue-100' : 'border-slate-100'}`}>
                  <div className="flex justify-between items-start">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md uppercase tracking-wider ${log.type === 'production' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                      {log.type === 'production' ? <Package size={14} /> : null}
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                      {log.timestamp ? format(log.timestamp, 'dd MMM yyyy HH:mm') : '-'}
                    </span>
                  </div>
                  
                  <div className="text-sm text-slate-700 font-medium">
                    {(() => {
                      let dataObj = null;
                      if (typeof log.details === 'string') {
                         try {
                           dataObj = JSON.parse(log.details);
                         } catch {
                           return <p>{log.details}</p>;
                         }
                      } else if (log.details && typeof log.details === 'object') {
                         dataObj = log.details;
                      }

                      if (dataObj) {
                         if (dataObj.message) return <p>{dataObj.message}</p>;
                         
                         const lines = [];
                         if (dataObj.reason) lines.push(`Reden: ${dataObj.reason}`);
                         if (dataObj.details) lines.push(String(dataObj.details));
                         if (dataObj.previousPriority && dataObj.newPriority) {
                            lines.push(`Prioriteit aangepast: ${dataObj.previousPriority} ➔ ${dataObj.newPriority}`);
                         }
                         if (dataObj.previousHoldStatus !== undefined && dataObj.newHoldStatus !== undefined) {
                            lines.push(`On-Hold status aangepast: ${dataObj.previousHoldStatus ? 'Ja' : 'Nee'} ➔ ${dataObj.newHoldStatus ? 'Ja' : 'Nee'}`);
                         }
                         
                         if (lines.length > 0) {
                           return (
                             <div className="flex flex-col gap-1">
                               {lines.map((line, i) => <p key={i}>{line}</p>)}
                             </div>
                           );
                         }

                         // Fallback voor onbekende objecten (verberg onnodige IDs)
                         const safeEntries = Object.entries(dataObj).filter(([k, v]) => 
                            k !== 'productId' && k !== 'orderId' && k !== 'source' && k !== 'actorLabel' && k !== 'actorRole' && v !== null && v !== undefined
                         );
                         
                         if (safeEntries.length > 0) {
                           return (
                             <ul className="list-disc pl-4 space-y-1 text-slate-600 font-normal">
                               {safeEntries.map(([k, v]) => (
                                 <li key={k}><span className="font-semibold">{k}:</span> {String(v)}</li>
                               ))}
                             </ul>
                           );
                         }
                      }
                      
                      return <p></p>;
                    })()}
                  </div>
                  
                  <div className="text-xs text-slate-400 mt-1 flex gap-2">
                    <span>Door: {log.actor}</span>
                    {log.type === 'admin' && typeof log.details === 'object' && log.details?.source && (
                      <span className="text-slate-300">| Bron: {log.details.source}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderHistoryModal;
