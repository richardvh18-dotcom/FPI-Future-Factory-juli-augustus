import React from "react";
import Barcode from "react-barcode";
import { QrCode, Smartphone, Settings2, Volume2, ShieldCheck, Printer, Activity, Eye } from "lucide-react";

const AdminScannerConfig = () => {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-8 -left-8 w-64 h-64 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/20 rounded-xl">
                <QrCode className="text-emerald-400" size={24} />
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight">Granit™ Ultra 2105i Scanner</h2>
            </div>
            <p className="text-slate-300 text-lg max-w-2xl mt-4 leading-relaxed">
              Scan de onderstaande configuratie-barcodes rechtstreeks vanaf dit scherm om de draadloze Honeywell Granit Ultra 2105i handscanners in te stellen voor gebruik met de MES Portal tablets.
            </p>
          </div>
          <div className="hidden lg:block bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-sm">
             <Smartphone size={48} className="text-white opacity-80 mx-auto" />
             <p className="text-xs font-semibold text-center mt-2 uppercase tracking-wider text-slate-300">Tablet Ready</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Connection Settings */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <Smartphone size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Tablet Koppeling (Bluetooth)</h3>
          </div>
          <p className="text-slate-600 text-sm mb-6">
            Koppel de scanner direct aan een tablet via Bluetooth (Non-Base BT Connection / HID). Zorg ervoor dat Bluetooth aan staat op de tablet en scan deze code.
          </p>
          <div className="flex flex-col items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <Barcode value="PAPBTH." format="CODE128" background="#f8fafc" />
            <p className="text-xs font-bold text-slate-500 mt-3 uppercase">PAPBTH. (Bluetooth HID Keyboard)</p>
          </div>
          
          <div className="mt-6 flex flex-col items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <Barcode value="BT_RMV." format="CODE128" background="#f8fafc" height={40} />
            <p className="text-xs font-bold text-slate-500 mt-3 uppercase">BT_RMV. (Verwijder huidige koppeling)</p>
          </div>
        </div>

        {/* Base Station Settings */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
              <ShieldCheck size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Basisstation (Charge Only)</h3>
          </div>
          <p className="text-slate-600 text-sm mb-6">
            Voorkom dat de scanner verbinding zoekt met het CCB23 basisstation wanneer je hem in de houder plaatst. Scan deze code zodat het station alleen laadt.
          </p>
          <div className="flex flex-col items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <Barcode value="BASCHG1." format="CODE128" background="#f8fafc" />
            <p className="text-xs font-bold text-slate-500 mt-3 uppercase">BASCHG1. (Charge Only Mode)</p>
          </div>
        </div>

        {/* Keyboard Settings */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-xl">
              <Settings2 size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Toetsenbord & Suffix</h3>
          </div>
          <p className="text-slate-600 text-sm mb-6">
            Stel de scanner zo in dat hij na elke scan automatisch een "Enter" (Carriage Return) meestuurt. Dit is vereist voor de MES Portal.
          </p>
          <div className="flex flex-col items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <Barcode value="VSUFCR." format="CODE128" background="#f8fafc" />
            <p className="text-xs font-bold text-slate-500 mt-3 uppercase">VSUFCR. (Voeg Enter/CR toe)</p>
          </div>
          
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <Barcode value="KBDCTY0." format="CODE128" background="#f8fafc" height={30} width={1.5} />
               <p className="text-xs font-bold text-slate-500 mt-2 text-center uppercase">KBDCTY0. (US Keyboard)</p>
            </div>
            <div className="flex flex-col items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <Barcode value="KBDCTY27." format="CODE128" background="#f8fafc" height={30} width={1.5} />
               <p className="text-xs font-bold text-slate-500 mt-2 text-center uppercase">KBDCTY27. (NL Keyboard)</p>
            </div>
          </div>
        </div>

        {/* Sound Settings */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
              <Volume2 size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Geluidsvoorkeuren</h3>
          </div>
          <p className="text-slate-600 text-sm mb-6">
            Pas het volume van de scan-piep aan voor de werkomgeving.
          </p>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <div className="flex-1">
                 <Barcode value="BEPLVL3." format="CODE128" background="#f8fafc" height={35} width={1.5} />
               </div>
               <p className="text-xs font-bold text-slate-500 uppercase ml-4 w-24">Volume Hoog</p>
            </div>
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <div className="flex-1">
                 <Barcode value="BEPLVL1." format="CODE128" background="#f8fafc" height={35} width={1.5} />
               </div>
               <p className="text-xs font-bold text-slate-500 uppercase ml-4 w-24">Volume Laag</p>
            </div>
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <div className="flex-1">
                 <Barcode value="BEPLVL0." format="CODE128" background="#f8fafc" height={35} width={1.5} />
               </div>
               <p className="text-xs font-bold text-slate-500 uppercase ml-4 w-24">Volume Uit</p>
            </div>
          </div>
        </div>
        
        {/* Advanced Features */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
              <Activity size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Trilsignaal (Haptic)</h3>
          </div>
          <p className="text-slate-600 text-sm mb-6">
            Zet de trilmotor aan (Haptic Feedback) bij een succesvolle scan, ideaal voor lawaaiige omgevingen.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <Barcode value="TFBGRD1." format="CODE128" background="#f8fafc" height={30} width={1.5} />
               <p className="text-xs font-bold text-slate-500 mt-2 text-center uppercase">TFBGRD1. (Trillen AAN)</p>
            </div>
            <div className="flex flex-col items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <Barcode value="TFBGRD0." format="CODE128" background="#f8fafc" height={30} width={1.5} />
               <p className="text-xs font-bold text-slate-500 mt-2 text-center uppercase">TFBGRD0. (Trillen UIT)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-teal-100 text-teal-600 rounded-xl">
              <Eye size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Hands-free Modus</h3>
          </div>
          <p className="text-slate-600 text-sm mb-6">
            Activeer 'Presentation Mode' zodat de scanner altijd aan staat als hij in de houder staat (zonder de trekker in te drukken).
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <Barcode value="TRGMOD3." format="CODE128" background="#f8fafc" height={30} width={1.5} />
               <p className="text-xs font-bold text-slate-500 mt-2 text-center uppercase">TRGMOD3. (Hands-free AAN)</p>
            </div>
            <div className="flex flex-col items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <Barcode value="TRGMOD0." format="CODE128" background="#f8fafc" height={30} width={1.5} />
               <p className="text-xs font-bold text-slate-500 mt-2 text-center uppercase">TRGMOD0. (Handmatig)</p>
            </div>
          </div>
        </div>
        
        {/* Reset */}
        <div className="md:col-span-2 bg-slate-100 rounded-3xl p-6 border border-slate-200 flex flex-col md:flex-row items-center justify-between">
           <div>
             <h3 className="text-lg font-bold text-slate-800">Fabrieksinstellingen herstellen</h3>
             <p className="text-slate-600 text-sm">Hiermee wis je alle huidige instellingen en koppelingen.</p>
           </div>
           <div className="mt-4 md:mt-0 flex flex-col items-center bg-white p-4 rounded-2xl shadow-sm">
              <Barcode value="DEFALT." format="CODE128" background="#ffffff" height={40} />
           </div>
        </div>

      </div>
    </div>
  );
};

export default AdminScannerConfig;
