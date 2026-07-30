import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Network, Save, Sparkles, Printer, Bot } from 'lucide-react';
import {
  checkGatewayPcHealth,
  enqueueGatewayPcJob,
  loadGatewayPcConfig,
  saveGatewayPcConfig,
  type GatewayPcConfig,
} from '../../services/gatewayPcService';

const DEFAULT_PORT = '3030';

export const GatewayPcAdminView = () => {
  const [config, setConfig] = useState<GatewayPcConfig | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(DEFAULT_PORT);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const init = async () => {
      const loaded = await loadGatewayPcConfig();
      setConfig(loaded);
      setHost(loaded?.host || '');
      setPort(String(loaded?.port || DEFAULT_PORT));
    };

    void init();
  }, []);

  const uiUrl = useMemo(() => {
    const normalizedHost = host.trim();
    const normalizedPort = port.trim() || DEFAULT_PORT;
    if (!normalizedHost) return '';
    return `http://${normalizedHost}:${normalizedPort}`;
  }, [host, port]);

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMessage('');

    try {
      const nextConfig = await saveGatewayPcConfig({
        host: host.trim(),
        port: Number(port || DEFAULT_PORT),
        scheme: 'http',
      });
      setConfig(nextConfig);
      setStatusMessage(`Gateway-config opgeslagen voor ${nextConfig.host}:${nextConfig.port}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Opslaan mislukt');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsChecking(true);
    setStatusMessage('');

    try {
      const health = await checkGatewayPcHealth();
      setConfig((prev) => {
        if (!prev) {
          return {
            host: '',
            port: Number(DEFAULT_PORT),
            scheme: 'http',
            updatedAt: new Date().toISOString(),
          };
        }

        return {
          ...prev,
          updatedAt: new Date().toISOString(),
        };
      });
      setStatusMessage(health.mode === 'connected' ? 'Gateway reageert op de healthcheck.' : 'Gateway reageert nog niet.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Healthcheck mislukt');
    } finally {
      setIsChecking(false);
    }
  };

  const handlePrepJob = async () => {
    setStatusMessage('');
    try {
      const id = await enqueueGatewayPcJob('print', {
        printerId: 'BH18-ZEBRA',
        source: 'admin-prep',
        note: 'Voorbereide job voor later Node.js gateway',
      });
      setStatusMessage(`Voorbereide gateway-job opgeslagen met ID ${id}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Kon geen gateway-job aanmaken');
    }
  };

  return (
    <div className="p-8 lg:p-10 max-w-5xl mx-auto space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-2xl bg-teal-100 p-3 text-teal-700">
            <Network size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">GatewayPC voorbereiden</h2>
            <p className="text-sm text-slate-600">Deze setup is alleen voor de toekomstige Node.js-gateway. De huidige WebUSB-printflow blijft intact.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4 rounded-2xl bg-slate-50 p-5 border border-slate-200">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">IP-adres van de Node.js PC</label>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="192.168.1.50"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">Poort</label>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                value={port}
                onChange={(event) => setPort(event.target.value)}
                placeholder="3030"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving || !host.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black uppercase tracking-wider text-white disabled:opacity-50"
              >
                <Save size={16} /> {isSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button
                onClick={handleTestConnection}
                disabled={isChecking}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-700"
              >
                <Sparkles size={16} /> {isChecking ? 'Checken...' : 'Test verbinding'}
              </button>
            </div>

            {statusMessage ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                {statusMessage}
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-700">
              <Printer size={16} className="text-orange-500" /> WebUSB-printing blijft actief
            </div>
            <p className="text-sm text-slate-600">
              De huidige browser-gebaseerde WebUSB-flow voor Zebra-printers wordt niet gewijzigd. Deze setup is puur voor later routeren van print- en robotjobs via de lokale Node.js-pc.
            </p>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-700">
              <Bot size={16} className="text-purple-500" /> Firebase-voorbereiding
            </div>
            <p className="text-sm text-slate-600">
              De app schrijft toekomstige gateway-jobs naar een voorbereid Firebase-pad, zodat de Node.js-pc later eenvoudig kan luisteren en verwerken.
            </p>
            {uiUrl ? (
              <a
                href={uiUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-wider text-blue-600"
              >
                Open Node.js web UI <ExternalLink size={14} />
              </a>
            ) : (
              <p className="text-sm text-slate-500">Vul eerst een IP-adres in om de web-UI-link te openen.</p>
            )}
            <button
              onClick={handlePrepJob}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-700"
            >
              <Network size={16} /> Voorbereide gateway-job aanmaken
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GatewayPcAdminView;
