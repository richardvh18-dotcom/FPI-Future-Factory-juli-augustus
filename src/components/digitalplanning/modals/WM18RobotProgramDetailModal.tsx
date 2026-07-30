import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Sliders,
  Send,
  Download,
  Copy,
  Layers,
  Clock,
  Ruler
} from 'lucide-react';
import { Wm18CatalogItem, Wm18RapidModuleOutput } from '../../../types/wm18Types';
import { generateWm18RapidCode } from '../../../services/wm18CalculationEngine';
import { getWm18CatalogItemByArticleNumber } from '../../../services/wm18ProgramCatalogService';
import { sendRobotProgramToGateway } from '../../../services/gatewayPcService';

interface WM18RobotProgramDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  articleCode: string;
  orderNumber?: string;
}

export const WM18RobotProgramDetailModal: React.FC<WM18RobotProgramDetailModalProps> = ({
  isOpen,
  onClose,
  articleCode,
  orderNumber,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<Wm18CatalogItem | null>(null);
  const [rapidCode, setRapidCode] = useState<Wm18RapidModuleOutput | null>(null);
  const [activeTab, setActiveTab] = useState<'params' | 'stn1' | 'stn2'>('params');
  const [sendingStation, setSendingStation] = useState<'STN1' | 'STN2' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !articleCode) return;
    setLoading(true);
    setStatusMessage(null);

    getWm18CatalogItemByArticleNumber(articleCode)
      .then((foundItem) => {
        setItem(foundItem);
        if (foundItem) {
          const generated = generateWm18RapidCode(foundItem);
          setRapidCode(generated);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed fetching WM18 catalog item', err);
        setLoading(false);
      });
  }, [isOpen, articleCode]);

  if (!isOpen) return null;

  const handleSendToGateway = async (station: 'STN1' | 'STN2') => {
    if (!item || !rapidCode) return;
    const codeText = station === 'STN1' ? rapidCode.stn1RapidCode : rapidCode.stn2RapidCode;
    const fileName = `Procesdata${station}.MOD`;

    setSendingStation(station);
    setStatusMessage({ type: 'info', text: t('wm18.sendingGateway', `Bezig met verzenden van ${fileName} naar Gateway PC...`) });

    try {
      await sendRobotProgramToGateway({
        programId: item.id,
        fileName,
        content: codeText,
        station,
      });
      setStatusMessage({
        type: 'success',
        text: t('wm18.sendGatewaySuccess', `${fileName} is succesvol verzonden naar de Gateway PC / Robot!`),
      });
    } catch (err) {
      console.error('Gateway dispatch failed', err);
      setStatusMessage({
        type: 'error',
        text: t('wm18.sendGatewayError', 'Verzenden naar Gateway PC mislukt. Controleer de Gateway status.'),
      });
    } finally {
      setSendingStation(null);
    }
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatusMessage({ type: 'info', text: t('wm18.copiedToClipboard', 'RAPID code is gekopieerd naar klembord!') });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Cpu size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  {t('wm18.modalTitle', 'WM18 Wikkelrobot Programma')}
                </h3>
                {orderNumber && (
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">
                    {orderNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {articleCode}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status banner */}
        {statusMessage && (
          <div
            className={`px-6 py-3 text-xs font-bold flex items-center gap-2 border-b ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-rose-950/50 border-rose-800 text-rose-300'
                : 'bg-cyan-950/50 border-cyan-800 text-cyan-300'
            }`}
          >
            {statusMessage.type === 'success' && <CheckCircle2 size={16} />}
            {statusMessage.type === 'error' && <AlertTriangle size={16} />}
            {statusMessage.type === 'info' && <Cpu size={16} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Cpu size={36} className="animate-spin text-cyan-400 mx-auto" />
              <p className="text-sm font-bold text-slate-400">
                {t('wm18.loadingProgram', 'Robotprogramma ophalen...')}
              </p>
            </div>
          ) : !item ? (
            <div className="py-12 px-6 rounded-2xl bg-rose-950/30 border border-rose-800/50 text-center space-y-3">
              <AlertTriangle size={40} className="text-rose-400 mx-auto" />
              <h4 className="text-base font-black text-rose-200 uppercase">
                {t('wm18.noProgramFoundTitle', 'Geen robotprogramma gevonden')}
              </h4>
              <p className="text-xs text-rose-300/80 max-w-md mx-auto">
                {t('wm18.noProgramFoundDesc', 'Er is nog geen robotprogramma opgeslagen of berekend voor artikel {{code}}. Importeer het WM18 rekenprogramma via het Instelcentrum.', { code: articleCode })}
              </p>
            </div>
          ) : (
            <>
              {/* Product Key Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    {t('wm18.diameter', 'Diameter (ID)')}
                  </span>
                  <span className="text-base font-black text-white">
                    {item.diameterMm} mm
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    {t('wm18.mofType', 'Mof Type / Serie')}
                  </span>
                  <span className="text-base font-black text-cyan-400">
                    {item.mofType} ({item.series})
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    {t('wm18.angle', 'Hoek / Straal')}
                  </span>
                  <span className="text-base font-black text-white">
                    {item.angleDeg}° ({item.radiusMm} mm)
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    {t('wm18.windingTime', 'Wikkeltijd')}
                  </span>
                  <span className="text-base font-black text-emerald-400 flex items-center gap-1">
                    <Clock size={14} /> {item.wikkeltijdMin} min
                  </span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex gap-2 border-b border-slate-800 pb-2">
                <button
                  onClick={() => setActiveTab('params')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'params'
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <Sliders size={14} /> {t('wm18.tabParams', 'Parameters & Coördinaten')}
                </button>
                <button
                  onClick={() => setActiveTab('stn1')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'stn1'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <Code2 size={14} /> RAPID Station 1 (ProcesdataSTN1)
                </button>
                <button
                  onClick={() => setActiveTab('stn2')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'stn2'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <Code2 size={14} /> RAPID Station 2 (ProcesdataSTN2)
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'params' && (
                <div className="space-y-6">
                  {/* Speeds & Pitches */}
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-400 mb-3 flex items-center gap-2">
                      <Layers size={14} /> {t('wm18.speedsTitle', 'Wikkelsnelheden & Spoed')}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-500 block">{t('wm18.rpm', 'Snelheid (RPM)')}:</span>
                        <span className="font-bold text-white">{item.speedsAndPitches.windingSpeedRpm} RPM ({item.speedsAndPitches.speedPercentage}%)</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">{t('wm18.gangen', 'Aantal Gangen')}:</span>
                        <span className="font-bold text-cyan-400">{item.gangenCount} gangen</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">{t('wm18.fabricMeters', 'Weefsel Benodigd')}:</span>
                        <span className="font-bold text-emerald-400">{item.fabricMeters} meter</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">{t('wm18.pitchBocht', 'Spoed Bocht')}:</span>
                        <span className="font-bold text-white">{item.speedsAndPitches.pitchBochtMm} mm</span>
                      </div>
                    </div>
                  </div>

                  {/* 6D Coördinaten Vergelijking */}
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-400 mb-3 flex items-center gap-2">
                      <Ruler size={14} /> {t('wm18.targetsTitle', '6D Ruimtelijke Coördinaten (Station 1 vs Station 2)')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Station 1 Targets */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                        <span className="text-xs font-black text-blue-400 uppercase tracking-wide block">
                          Station 1 (Links)
                        </span>
                        <div className="space-y-1.5 text-xs font-mono">
                          <div className="flex justify-between bg-slate-900 p-2 rounded-lg">
                            <span className="text-slate-400">Pos1 (Mof 1):</span>
                            <span className="text-white">X:{item.stn1Targets.pos1.x} Y:{item.stn1Targets.pos1.y} Z:{item.stn1Targets.pos1.z}</span>
                          </div>
                          <div className="flex justify-between bg-slate-900 p-2 rounded-lg">
                            <span className="text-slate-400">Pos2 (Start Bocht):</span>
                            <span className="text-white">Z:{item.stn1Targets.pos2.z}</span>
                          </div>
                          <div className="flex justify-between bg-slate-900 p-2 rounded-lg">
                            <span className="text-slate-400">Pos3 (Eind Bocht):</span>
                            <span className="text-white">Z:{item.stn1Targets.pos3.z}</span>
                          </div>
                          <div className="flex justify-between bg-slate-900 p-2 rounded-lg">
                            <span className="text-slate-400">Pos4 (Mof 2):</span>
                            <span className="text-white">Z:{item.stn1Targets.pos4.z}</span>
                          </div>
                        </div>
                      </div>

                      {/* Station 2 Targets */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                        <span className="text-xs font-black text-purple-400 uppercase tracking-wide block">
                          Station 2 (Rechts)
                        </span>
                        <div className="space-y-1.5 text-xs font-mono">
                          <div className="flex justify-between bg-slate-900 p-2 rounded-lg">
                            <span className="text-slate-400">Pos1 (Mof 1):</span>
                            <span className="text-white">X:{item.stn2Targets.pos1.x} Y:{item.stn2Targets.pos1.y} Z:{item.stn2Targets.pos1.z}</span>
                          </div>
                          <div className="flex justify-between bg-slate-900 p-2 rounded-lg">
                            <span className="text-slate-400">Pos2 (Start Bocht):</span>
                            <span className="text-white">Z:{item.stn2Targets.pos2.z}</span>
                          </div>
                          <div className="flex justify-between bg-slate-900 p-2 rounded-lg">
                            <span className="text-slate-400">Pos3 (Eind Bocht):</span>
                            <span className="text-white">Z:{item.stn2Targets.pos3.z}</span>
                          </div>
                          <div className="flex justify-between bg-slate-900 p-2 rounded-lg">
                            <span className="text-slate-400">Pos4 (Mof 2):</span>
                            <span className="text-white">Z:{item.stn2Targets.pos4.z}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* RAPID Code STN1 */}
              {activeTab === 'stn1' && rapidCode && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-mono">ProcesdataSTN1.MOD</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopyCode(rapidCode.stn1RapidCode)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <Copy size={13} /> {t('common.copy', 'Kopieer')}
                      </button>
                      <button
                        onClick={() => handleSendToGateway('STN1')}
                        disabled={sendingStation === 'STN1'}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-lg flex items-center gap-1.5 text-white transition-colors"
                      >
                        <Send size={13} /> {t('wm18.sendToRobot', 'Stuur naar Station 1 Robot')}
                      </button>
                    </div>
                  </div>
                  <pre className="bg-slate-950 p-4 rounded-2xl text-xs font-mono text-cyan-300 overflow-x-auto border border-slate-800 max-h-[350px]">
                    {rapidCode.stn1RapidCode}
                  </pre>
                </div>
              )}

              {/* RAPID Code STN2 */}
              {activeTab === 'stn2' && rapidCode && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-mono">ProcesdataSTN2.MOD</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopyCode(rapidCode.stn2RapidCode)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <Copy size={13} /> {t('common.copy', 'Kopieer')}
                      </button>
                      <button
                        onClick={() => handleSendToGateway('STN2')}
                        disabled={sendingStation === 'STN2'}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-xs font-bold rounded-lg flex items-center gap-1.5 text-white transition-colors"
                      >
                        <Send size={13} /> {t('wm18.sendToRobot', 'Stuur naar Station 2 Robot')}
                      </button>
                    </div>
                  </div>
                  <pre className="bg-slate-950 p-4 rounded-2xl text-xs font-mono text-purple-300 overflow-x-auto border border-slate-800 max-h-[350px]">
                    {rapidCode.stn2RapidCode}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors"
          >
            {t('common.close', 'Sluiten')}
          </button>
        </div>
      </div>
    </div>
  );
};
