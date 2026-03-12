import React, { useState, useEffect, useMemo } from 'react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { db, auth } from '../../config/firebase'; // Zorg dat auth hier geïmporteerd is
import { collection, onSnapshot, orderBy, query, doc, updateDoc, deleteDoc, where, serverTimestamp, getDocs, limit } from 'firebase/firestore';
import { PATHS } from '../../config/dbPaths';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle, Printer, Usb, Play, Server, ArrowLeft, Layers, Power, Zap, Search, Hash, RotateCcw, FileText, Eye, X } from 'lucide-react';
import { printRawUsb, isUsbDirectSupported } from './usbPrintService';
import { generateZPL } from '../../utils/zplHelper';
import { processLabelData, resolveLabelContent, applyLabelLogic, getQRCodeUrl, getBarcodeUrl } from '../../utils/labelHelpers';

const PIXELS_PER_MM = 3.78;

const StatusBadge = ({ status }) => {
  const config = {
    pending: { icon: <Loader2 className="animate-spin text-yellow-500" size={16} />, text: 'Wachtend', color: 'bg-yellow-100 text-yellow-800' },
    printing: { icon: <RefreshCw className="animate-spin text-blue-500" size={16} />, text: 'Printen', color: 'bg-blue-100 text-blue-800' },
    completed: { icon: <CheckCircle className="text-green-500" size={16} />, text: 'Voltooid', color: 'bg-green-100 text-green-800' },
    error: { icon: <AlertTriangle className="text-red-500" size={16} />, text: 'Fout', color: 'bg-red-100 text-red-800' },
  };
  const current = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${current.color}`}>
      {current.icon}
      {current.text}
    </span>
  );
};

const LabelVisualPreview = ({ label, data, zoom = 1 }) => {
  if (!label) return <div className="w-48 h-32 bg-slate-200 flex items-center justify-center text-xs text-slate-400 italic">Geen template</div>;

  return (
    <div
      className="bg-white shadow-lg relative overflow-hidden border"
      style={{
        width: `${label.width * PIXELS_PER_MM * zoom}px`,
        height: `${label.height * PIXELS_PER_MM * zoom}px`,
      }}
    >
      {label.elements?.map((el, index) => {
        const resolved = resolveLabelContent(el, data);
        const displayContent = resolved.content;
        const baseStyle = {
          position: "absolute",
          left: `${el.x * PIXELS_PER_MM * zoom}px`,
          top: `${el.y * PIXELS_PER_MM * zoom}px`,
          width: el.width
            ? `${el.width * PIXELS_PER_MM * zoom}px`
            : "auto",
          height: el.height
            ? `${el.height * PIXELS_PER_MM * zoom}px`
            : "auto",
          color: "black",
          transform: `rotate(${el.rotation || 0}deg)`,
          transformOrigin: "top left",
          overflow: "hidden",
          textAlign: "left",
        };

        if (el.type === "text")
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                fontSize: `${el.fontSize * zoom}px`,
                fontWeight: el.isBold ? "900" : "normal",
                fontFamily: el.fontFamily || "Arial, sans-serif",
                textAlign: el.align || "left",
                whiteSpace: "nowrap",
                lineHeight: "1",
              }}
            >
              {displayContent}
            </div>
          );

        if (el.type === "line")
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${el.width * PIXELS_PER_MM * zoom}px`,
                height: `${el.height * PIXELS_PER_MM * zoom}px`,
                backgroundColor: "black",
              }}
            />
          );

        if (el.type === "box")
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${el.width * PIXELS_PER_MM * zoom}px`,
                height: `${el.height * PIXELS_PER_MM * zoom}px`,
                border: `${(el.thickness || 1) * PIXELS_PER_MM * zoom}px solid black`,
                boxSizing: "border-box",
              }}
            />
          );
        
        if (el.type === "qr" || el.type === "barcode")
          return (
             <div key={index} style={{
                 ...baseStyle, 
                 width: `${(el.width || 20) * PIXELS_PER_MM * zoom}px`, 
                 height: `${(el.height || 20) * PIXELS_PER_MM * zoom}px`,
                 background: "#f8fafc",
                 border: "1px solid #cbd5e1",
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
             }}>
                {el.type === 'barcode' ? (
                    <img 
                        src={getBarcodeUrl(displayContent)} 
                        alt="code" 
                        style={{ width: "80%", height: "80%", objectFit: "fill" }} 
                    />
                ) : (
                    <img 
                        src={getQRCodeUrl(displayContent)} 
                        alt="code" 
                        style={{ width: "80%", height: "80%", objectFit: "contain" }} 
                    />
                )}
             </div>
          );

        return null;
      })}
    </div>
  );
};

const PrintQueueAdminView = () => {
  const { role } = useAdminAuth();
  const canManage = ['admin', 'teamleader', 'planner'].includes(role);

  const [printJobs, setPrintJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState([]);
  const [usbDevice, setUsbDevice] = useState(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  
  // Nieuwe state voor navigatie en reprint
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'station'
  const [selectedStation, setSelectedStation] = useState(null);
  const [reprintSearch, setReprintSearch] = useState('');
  const [reprintResult, setReprintResult] = useState(null);
  const [labelTemplates, setLabelTemplates] = useState([]);
  const [labelRules, setLabelRules] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState('');
  const [previewJob, setPreviewJob] = useState(null);
  const [previewSize, setPreviewSize] = useState("4x6"); // Default Labelary size

  useEffect(() => {
    if (previewJob?.metadata?.width && previewJob?.metadata?.height) {
        // Convert mm to inches (approx) for Labelary API
        const w = Math.round(previewJob.metadata.width / 25.4);
        const h = Math.round(previewJob.metadata.height / 25.4);
        setPreviewSize(`${w}x${h}`);
    }
  }, [previewJob]);

  useEffect(() => {
    // 1. Probeer automatisch te verbinden met een eerder gekozen USB printer
    const restoreUsbConnection = async () => {
      if (!isUsbDirectSupported()) return;
      
      const savedVendor = localStorage.getItem('usb_printer_vendor');
      const savedProduct = localStorage.getItem('usb_printer_product');
      
      if (savedVendor && savedProduct) {
        try {
          const devices = await navigator.usb.getDevices();
          const match = devices.find(d => 
            d.vendorId === parseInt(savedVendor) && 
            d.productId === parseInt(savedProduct)
          );
          if (match) {
            setUsbDevice(match);
          }
        } catch (err) {
          console.warn("Kon USB printer niet automatisch herstellen:", err);
        }
      }
    };
    restoreUsbConnection();

    // Printers ophalen
    const unsubPrinters = onSnapshot(collection(db, ...PATHS.PRINTERS), (snapshot) => {
      setPrinters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Haal label templates op voor reprint
    const templatesRef = collection(db, ...PATHS.LABEL_TEMPLATES);
    const unsubTemplates = onSnapshot(templatesRef, (snap) => {
      setLabelTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Haal label logic op
    const logicRef = collection(db, ...PATHS.LABEL_LOGIC);
    const unsubLogic = onSnapshot(logicRef, (snap) => {
      setLabelRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const q = query(collection(db, ...PATHS.PRINT_QUEUE), orderBy('createdAt', 'desc'));
    const unsubscribeJobs = onSnapshot(q, (snapshot) => {
      setPrintJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Error fetching print jobs:", err);
      setLoading(false);
    });

    return () => {
      unsubPrinters();
      unsubscribeJobs();
      unsubTemplates();
      unsubLogic();
    };
  }, []);

  // Auto-print logica
  useEffect(() => {
    if (!autoPrint || !usbDevice || isProcessing || !selectedStation) return;

    const pendingJobs = printJobs.filter(j =>
      (j.metadata?.stationId === selectedStation || j.metadata?.targetPrinterName === selectedStation) &&
      j.status === 'pending'
    );

    if (pendingJobs.length > 0) {
      const processQueue = async () => {
        setIsProcessing(true);
        for (const job of pendingJobs) {
          try {
            await handlePrintJob(job);
          } catch (e) {
            console.error(`Auto-print failed for ${job.id}:`, e);
            setAutoPrint(false);
            setError(`Auto-print gestopt. Fout bij printen taak ${job.id}: ${e.message}`);
            break;
          }
        }
        setIsProcessing(false);
      };
      processQueue();
    }
  }, [printJobs, autoPrint, usbDevice, isProcessing, selectedStation]);

  const filteredJobs = useMemo(() => {
    let jobs = printJobs;
    
    // Filter op station als er een geselecteerd is
    if (selectedStation) {
      jobs = jobs.filter(j => j.metadata?.stationId === selectedStation || j.metadata?.targetPrinterName === selectedStation);
    } else if (role !== 'admin') {
      // Standaard filter voor niet-admins
      const allowedPrinterIds = printers.map(p => p.id);
      jobs = jobs.filter(job => allowedPrinterIds.includes(job.printerId));
    }
    
    return jobs;
  }, [printJobs, printers, role, selectedStation]);

  const stationGroups = useMemo(() => {
    const groups = new Set();
    printers.forEach(p => {
      if (p.linkedStations && Array.isArray(p.linkedStations)) {
        p.linkedStations.forEach(s => groups.add(s));
      }
    });
    return Array.from(groups).sort();
  }, [printers]);

  const handleConnectUsb = async () => {
    setError('');
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(device);
      // Sla de printer op voor de volgende keer
      localStorage.setItem('usb_printer_vendor', device.vendorId);
      localStorage.setItem('usb_printer_product', device.productId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePrintJob = async (job) => {
    if (!usbDevice) throw new Error("Geen USB printer verbonden.");
    await updateDoc(doc(db, ...PATHS.PRINT_QUEUE, job.id), { status: 'printing', processedAt: serverTimestamp() });
    try {
      await printRawUsb(usbDevice, job.zpl);
      await updateDoc(doc(db, ...PATHS.PRINT_QUEUE, job.id), { status: 'completed', printedAt: serverTimestamp() });
    } catch (e) {
      await updateDoc(doc(db, ...PATHS.PRINT_QUEUE, job.id), { status: 'error', error: e.message });
      throw e;
    }
  };

  const handleReprint = async (jobId) => {
    if (!window.confirm("Weet u zeker dat u deze taak opnieuw wilt printen?")) return;
    const jobRef = doc(db, ...PATHS.PRINT_QUEUE, jobId);
    await updateDoc(jobRef, { 
      status: 'pending', 
      retries: (printJobs.find(j => j.id === jobId)?.retries || 0) + 1,
      reprintedAt: serverTimestamp(),
      reprintedBy: {
        uid: auth.currentUser?.uid,
        email: auth.currentUser?.email
      }
    });
  };

  const handleDelete = async (jobId) => {
    if (!window.confirm("Weet u zeker dat u deze taak permanent wilt verwijderen?")) return;
    const jobRef = doc(db, ...PATHS.PRINT_QUEUE, jobId);
    await deleteDoc(jobRef);
  };

  const handleSearchProduct = async (e) => {
    e.preventDefault();
    if (!reprintSearch.trim()) return;
    
    setIsSearching(true);
    setReprintResult(null);
    setError('');

    try {
      const trackingRef = collection(db, ...PATHS.TRACKING);
      const q = query(trackingRef, where("lotNumber", "==", reprintSearch.trim()), limit(1));
      const snap = await getDocs(q);

      if (!snap.empty) {
        setReprintResult({ id: snap.docs[0].id, ...snap.docs[0].data(), source: 'active' });
        if (!selectedLabelId && labelTemplates.length > 0) {
            const defaultTpl = labelTemplates.find(t => t.name.toLowerCase().includes("standaard")) || labelTemplates[0];
            setSelectedLabelId(defaultTpl.id);
        }
      } else {
        const currentYear = new Date().getFullYear();
        const archiveRef = collection(db, "future-factory", "production", "archive", String(currentYear), "items");
        const qArch = query(archiveRef, where("lotNumber", "==", reprintSearch.trim()), limit(1));
        const snapArch = await getDocs(qArch);
        
        if (!snapArch.empty) {
          setReprintResult({ id: snapArch.docs[0].id, ...snapArch.docs[0].data(), source: 'archive' });
          if (!selectedLabelId && labelTemplates.length > 0) {
             setSelectedLabelId(labelTemplates[0].id);
          }
        } else {
          setError("Lotnummer niet gevonden.");
        }
      }
    } catch (err) {
      console.error(err);
      setError("Fout bij zoeken: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const reprintPreviewData = useMemo(() => {
    if (!reprintResult) return {};
    const baseData = processLabelData({
      ...reprintResult,
      orderNumber: reprintResult.orderId,
      productId: reprintResult.itemCode,
      description: reprintResult.item
    });
    return applyLabelLogic(baseData, labelRules);
  }, [reprintResult, labelRules]);

  const selectedLabelTemplate = useMemo(() => labelTemplates.find(t => t.id === selectedLabelId), [labelTemplates, selectedLabelId]);

  const handleReprintLabel = async (type) => {
    if (!reprintResult || !usbDevice) {
      setError("Geen product gevonden of geen printer verbonden.");
      return;
    }

    setIsProcessing(true);
    try {
      let zpl = "";
      
      if (type === 'simple') {
        zpl = `^XA
^FO50,50^BQN,2,6^FDQA,${reprintResult.lotNumber}^FS
^FO50,200^A0N,50,50^FD${reprintResult.lotNumber}^FS
^FO50,260^A0N,30,30^FD${reprintResult.itemCode || ""}^FS
^XZ`;
      } else if (reprintResult.labelZPL) {
        zpl = reprintResult.labelZPL;
        console.log("Herdruk via opgeslagen ZPL.");
      } else {
        const template = selectedLabelTemplate || labelTemplates[0];
        if (!template) throw new Error("Geen label template beschikbaar.");

        const labelData = processLabelData({
          ...reprintResult,
          orderNumber: reprintResult.orderId,
          productId: reprintResult.itemCode,
          description: reprintResult.item
        });
        
        const processedData = applyLabelLogic(labelData, labelRules);
        zpl = await generateZPL(template, processedData);
      }

      await printRawUsb(usbDevice, zpl);
      setReprintSearch("");
      setReprintResult(null);
      alert("Label geprint!");
    } catch (err) {
      setError("Print fout: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-4">
            {viewMode === 'station' && (
              <button 
                onClick={() => { setViewMode('overview'); setSelectedStation(null); }}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
            )}
            <div>
              <h1 className="text-3xl font-bold mb-1">{selectedStation ? `Station: ${selectedStation}` : 'Print Stations'}</h1>
              <p className="text-slate-600 text-sm">Beheer printopdrachten en herprint labels.</p>
            </div>
          </div>
        </div>
        {isUsbDirectSupported() && (
          <div className="flex items-center gap-3">
            {usbDevice && (
              <button
                onClick={() => setAutoPrint(!autoPrint)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border-2 ${
                  autoPrint 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-lg animate-pulse' 
                    : 'bg-white text-slate-400 border-slate-200'
                }`}
                title="Print nieuwe opdrachten automatisch zodra ze binnenkomen"
              >
                <Zap size={16} fill={autoPrint ? "currentColor" : "none"} />
                {autoPrint ? "Auto-Print AAN" : "Auto-Print UIT"}
              </button>
            )}
            
            <button 
              onClick={handleConnectUsb}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border-2 ${
                usbDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              }`}
            >
              {usbDevice ? <Usb className="text-green-500" /> : <Usb />}
              {usbDevice ? `Verbonden: ${usbDevice.productName}` : 'Verbind USB Printer'}
            </button>
          </div>
        )}
      </div>
      
      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2"><AlertTriangle size={20}/> {error}</div>}

      {viewMode === 'overview' ? (
      <div className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {stationGroups.map(station => {
            const pendingCount = printJobs.filter(j => j.metadata?.stationId === station && j.status === 'pending').length;
            
            return (
              <button 
                key={station} 
                onClick={() => { setSelectedStation(station); setViewMode('station'); }}
                className={`p-6 rounded-2xl border-2 transition-all text-left relative group hover:-translate-y-1 ${
                  pendingCount > 0 
                    ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100' 
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <Printer className={pendingCount > 0 ? "text-blue-600" : "text-slate-400"} size={24} />
                  </div>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                </div>
                <h3 className="font-black text-xl text-slate-800 mt-4 uppercase tracking-tight">{station}</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Print Queue</p>
              </button>
            );
          })}
          
          {stationGroups.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 italic">
              Geen stations geconfigureerd. Ga naar Printer Beheer om stations te koppelen.
            </div>
          )}
        </div>
      </div>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-right-4">
          {/* REPRINT SECTION */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
              <RotateCcw size={16} /> Label Herprinten / Beschadigd
            </h3>
            <div className="flex gap-4 items-start">
              <form onSubmit={handleSearchProduct} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={reprintSearch}
                    onChange={(e) => setReprintSearch(e.target.value)}
                    placeholder="Scan of typ lotnummer..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 outline-none font-bold uppercase"
                  />
                </div>
                <button type="submit" disabled={isSearching} className="px-6 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors">
                  {isSearching ? <Loader2 className="animate-spin" /> : "Zoek"}
                </button>
              </form>
            </div>

            {reprintResult && (
              <div className="mt-4 p-6 bg-white rounded-xl border border-blue-100 shadow-sm animate-in fade-in">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                        <h4 className="font-black text-lg text-slate-800 mb-2">{reprintResult.lotNumber}</h4>
                        <div className="space-y-1 text-sm text-slate-600">
                            <p><span className="font-bold text-slate-400 w-20 inline-block">Item:</span> {reprintResult.item}</p>
                            <p><span className="font-bold text-slate-400 w-20 inline-block">Code:</span> {reprintResult.itemCode}</p>
                            <p><span className="font-bold text-slate-400 w-20 inline-block">Order:</span> {reprintResult.orderId}</p>
                        </div>
                        
                        <div className="mt-4">
                            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Template</label>
                            <select 
                                value={selectedLabelId}
                                onChange={(e) => setSelectedLabelId(e.target.value)}
                                className="w-full p-2 border rounded-lg text-sm"
                            >
                                {labelTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="border-l border-slate-100 pl-6 flex flex-col items-center justify-center bg-slate-50/50 rounded-r-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Preview</p>
                        <LabelVisualPreview label={selectedLabelTemplate} data={reprintPreviewData} />
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={() => handleReprintLabel('simple')}
                    disabled={!usbDevice || isProcessing}
                    className="px-4 py-2 bg-white border-2 border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-600 rounded-lg font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    <Hash size={14} className="inline mr-1" /> Alleen Nummer
                  </button>
                  <button 
                    onClick={() => handleReprintLabel('full')}
                    disabled={!usbDevice || isProcessing}
                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold text-xs uppercase tracking-wider transition-all shadow-md"
                  >
                    <Printer size={14} className="inline mr-1" /> Volledig Label
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* QUEUE LIST */}
          <div>
      <h2 className="text-xl font-bold mb-3">Print Taken</h2>
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-500">
          <thead className="text-xs text-slate-700 uppercase bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Beschrijving</th>
              <th scope="col" className="px-6 py-3">Printer</th>
              <th scope="col" className="px-6 py-3">Aangevraagd door</th>
              <th scope="col" className="px-6 py-3">Tijdstip</th>
              <th scope="col" className="px-6 py-3">Acties</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" className="text-center p-8"><Loader2 className="animate-spin inline-block" /></td></tr>}
            {!loading && filteredJobs.length === 0 && <tr><td colSpan="6" className="text-center p-8">De wachtrij voor uw stations is leeg.</td></tr>}
            {filteredJobs.map(job => (
              <tr key={job.id} className="bg-white border-b hover:bg-slate-50">
                <td className="px-6 py-4">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-6 py-4 font-medium text-slate-900">
                  {job.metadata?.description || job.description}
                  {job.metadata?.stationId && <span className="ml-2 text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold">{job.metadata.stationId}</span>}
                  {job.status === 'error' && <p className="text-red-600 text-xs mt-1">{job.error}</p>}
                </td>
                <td className="px-6 py-4">
                  <span className="font-bold text-slate-600 text-xs">
                    {job.metadata?.targetPrinterName || job.printerId || 'Standaard'}
                  </span>
                </td>
                <td className="px-6 py-4">{job.metadata?.requesterEmail || job.createdBy}</td>
                <td className="px-6 py-4">
                  {job.createdAt ? formatDistanceToNow(job.createdAt.toDate(), { addSuffix: true, locale: nl }) : '-'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {job.status === 'pending' && (
                      <>
                      <button onClick={() => setPreviewJob(job)} className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-full" title="Bekijk Label">
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={async () => {
                          setIsProcessing(true);
                          try { await handlePrintJob(job); } 
                          catch(e) { alert(e.message); }
                          finally { setIsProcessing(false); }
                        }} 
                        disabled={!usbDevice || isProcessing || !canManage} 
                        className="p-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" 
                        title="Nu Printen"
                      >
                        <Play size={16} />
                      </button>
                      </>
                    )}
                    <button onClick={() => handleReprint(job.id)} disabled={!canManage} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded-full disabled:opacity-50" title="Opnieuw printen">
                      <RefreshCw size={16} />
                    </button>
                    <button onClick={() => handleDelete(job.id)} disabled={!canManage} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-100 rounded-full disabled:opacity-50" title="Verwijderen">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
          </div>
        </div>
      )}

      {/* ZPL Preview Modal voor Queue Items */}
      {previewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                     <div className="flex items-center gap-3">
                        <h3 className="font-bold text-slate-800">Label Voorbeeld</h3>
                        <select 
                            value={previewSize} 
                            onChange={(e) => setPreviewSize(e.target.value)}
                            className="text-[10px] font-bold uppercase bg-white border border-slate-300 rounded-lg px-2 py-1 outline-none focus:border-blue-500"
                        >
                            <option value="4x6">4x6" (Standaard)</option>
                            <option value="4x2">4x2" (Klein/Fittings)</option>
                            <option value="4x3">4x3"</option>
                            <option value="2x1">2x1"</option>
                        </select>
                     </div>
                    <button onClick={() => setPreviewJob(null)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-8 flex justify-center bg-slate-100">
                    <img 
                         src={`http://api.labelary.com/v1/printers/8dpmm/labels/${previewSize}/0/${encodeURIComponent(previewJob.zpl)}`} 
                        alt="Label Preview" 
                        className="shadow-lg max-w-full border"
                    />
                </div>
                <div className="p-4 text-center text-xs text-slate-400">Gegenereerd via Labelary API</div>
            </div>
        </div>
      )}
    </div>
  );
};

export default PrintQueueAdminView;
