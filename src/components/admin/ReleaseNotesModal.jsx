import React, { useState, useEffect } from 'react';
import { X, Rocket, Star, Wrench, Zap } from 'lucide-react';

/**
 * ReleaseNotesModal V1.0
 * Toont updates aan de gebruiker na een nieuwe deployment naar Vercel.
 * 
 * HOE TE GEBRUIKEN:
 * 1. Importeer dit component in je hoofd-layout (bijv. App.jsx of MainLayout.jsx)
 * 2. Plaats <ReleaseNotesModal /> ergens in de render tree (bovenin).
 * 3. Voor elke push naar Vercel: Update const CURRENT_VERSION en pas de RELEASE_NOTES aan.
 */

// ⚠️ BELANGRIJK: Verander dit nummer voor elke push naar productie!
const CURRENT_VERSION = "2026.02.09.3"; 

const RELEASE_NOTES = {
  title: "Systeem Update: Intelligence & Control",
  intro: "Deze update introduceert geavanceerde AI-analyse, efficiency tracking en versterkt het gebruikersbeheer.",
  changes: [
    { 
      type: 'new', 
      title: "Efficiency Tracking", 
      desc: "Monitor real-time prestaties door werkelijke productietijden te vergelijken met standaarden." 
    },
    { 
      type: 'new', 
      title: "AI Document Center", 
      desc: "Upload handleidingen en rapporten voor automatische AI-analyse en doorzoekbaarheid." 
    },
    { 
      type: 'improvement', 
      title: "Product Manager V6.2", 
      desc: "Vernieuwde catalogus met verificatie-workflow en matrix-validatie voor foutloze invoer." 
    },
    { 
      type: 'fix', 
      title: "Security & Root Sync", 
      desc: "Volledige migratie naar beveiligde root-paden en opschoning van API-keys." 
    }
  ]
};

const ReleaseNotesModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check in localStorage of deze versie al gezien is
    const lastSeenVersion = localStorage.getItem('mes_release_version');
    
    // Als de opgeslagen versie niet gelijk is aan de huidige versie, toon popup
    if (lastSeenVersion !== CURRENT_VERSION) {
      // Kleine vertraging zodat de app eerst rustig kan laden
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    // Sla op dat de gebruiker deze versie heeft gezien
    localStorage.setItem('mes_release_version', CURRENT_VERSION);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-white/20">
        
        {/* Header Sectie */}
        <div className="bg-slate-900 p-8 text-white relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 p-6 opacity-10 rotate-12">
            <Rocket size={120} />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-blue-600 text-white text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest shadow-lg shadow-blue-900/50">
                Nieuwe Versie
              </span>
              <span className="text-slate-400 text-[10px] font-mono font-bold">
                v{CURRENT_VERSION}
              </span>
            </div>
            
            <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none mb-2">
              {RELEASE_NOTES.title}
            </h2>
            <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-[90%]">
              {RELEASE_NOTES.intro}
            </p>
          </div>

          <button 
            onClick={handleClose}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white/70 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Lijst met wijzigingen */}
        <div className="p-8 space-y-4 bg-slate-50/50 overflow-y-auto max-h-[50vh] custom-scrollbar">
          {RELEASE_NOTES.changes.map((item, idx) => (
            <div key={idx} className="bg-white p-4 rounded-[25px] border border-slate-100 shadow-sm flex gap-4 items-start group hover:border-blue-200 transition-all">
              <div className={`p-3 rounded-2xl shrink-0 ${
                item.type === 'new' ? 'bg-emerald-100 text-emerald-600' :
                item.type === 'fix' ? 'bg-rose-100 text-rose-600' :
                'bg-blue-100 text-blue-600'
              }`}>
                {item.type === 'new' ? <Star size={18} /> :
                 item.type === 'fix' ? <Wrench size={18} /> :
                 <Zap size={18} />}
              </div>
              <div>
                <span className={`text-[9px] font-black uppercase tracking-widest block mb-1 ${
                  item.type === 'new' ? 'text-emerald-600' :
                  item.type === 'fix' ? 'text-rose-600' :
                  'text-blue-600'
                }`}>
                  {item.type === 'new' ? 'Nieuwe Functie' :
                   item.type === 'fix' ? 'Bug Opgelost' :
                   'Verbetering'}
                </span>
                <h4 className="text-sm font-black text-slate-800 mb-1 leading-tight">
                  {item.title}
                </h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actie */}
        <div className="p-6 bg-white border-t border-slate-100 shrink-0">
          <button
            onClick={handleClose}
            className="w-full py-4 bg-slate-900 hover:bg-blue-600 text-white rounded-[20px] font-black uppercase text-xs tracking-[0.2em] transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
          >
            <Rocket size={16} />
            Start Applicatie
          </button>
        </div>

      </div>
    </div>
  );
};

export default ReleaseNotesModal;