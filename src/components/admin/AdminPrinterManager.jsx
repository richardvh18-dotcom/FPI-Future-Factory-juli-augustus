import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { jsPDF } from "jspdf";
import { getISOWeek } from "date-fns";
import { 
  Printer, 
  Plus, 
  Trash2, 
  Save, 
  Wifi, 
  CheckCircle2, 
  Play,
  X,
  Scan,
  MapPin,
  Edit,
  RefreshCw,
  Usb,
  List,
  QrCode,
  Hash
} from "lucide-react";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { isUsbDirectSupported, printRawUsb } from "../printer/usbPrintService";
import PrintQueueAdminView from "../printer/PrintQueueAdminView";

const PRINTER_PROTOCOLS = ["zpl", "epl", "tspl", "escpos", "custom"];

// Helpers voor Lotnummer generatie
const getMachineCode = (station) => {
  const map = {
    'BH18': '418',
    'BA07': '417'
  };
  const clean = station?.replace(/\D/g, '') || '999';
  return map[station] || clean.padStart(3, '0');
};

const getIsoWeekAndYear = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { week: String(weekNo).padStart(2, '0'), year: String(year) };
};

const LotPrintModal = ({ onClose, stations, printers, onPrint }) => {
  const [config, setConfig] = useState({
    station: stations[0] || "",
    date: new Date().toISOString().split('T')[0],
    startSeq: 1,
    count: 1,
    mode: 'sequential', // 'sequential' | 'identical'
    printerId: printers.find(p => p.isDefault)?.id || printers[0]?.id || ""
  });

  const iso = getIsoWeekAndYear(new Date(config.date));
  const machineCode = getMachineCode(config.station);
  const previewLot = `40${iso.year.slice(-2)}${iso.week}${machineCode}40${String(config.startSeq).padStart(4, '0')}`;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-[30px] shadow-2xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Hash className="text-blue-600" /> Lotnummers Printen
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Station</label>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.station}
                onChange={e => setConfig({...config, station: e.target.value})}
              >
                {stations.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Datum (Week {iso.week})</label>
              <input 
                type="date" 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.date}
                onChange={e => setConfig({...config, date: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Start Volgnummer</label>
              <input 
                type="number" 
                min="1"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.startSeq}
                onChange={e => setConfig({...config, startSeq: parseInt(e.target.value) || 1})}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Aantal Labels</label>
              <input 
                type="number" 
                min="1"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.count}
                onChange={e => setConfig({...config, count: parseInt(e.target.value) || 1})}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-2 block">Print Modus</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 flex-1">
                <input type="radio" name="mode" checked={config.mode === 'sequential'} onChange={() => setConfig({...config, mode: 'sequential'})} />
                <span className="text-sm font-bold">Oplopend</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 flex-1">
                <input type="radio" name="mode" checked={config.mode === 'identical'} onChange={() => setConfig({...config, mode: 'identical'})} />
                <span className="text-sm font-bold">Identiek</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Printer</label>
            <select 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              value={config.printerId}
              onChange={e => setConfig({...config, printerId: e.target.value})}
            >
              {printers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
            <p className="text-xs font-bold text-blue-400 uppercase mb-1">Preview Eerste Label</p>
            <p className="text-xl font-black text-blue-700 font-mono tracking-tight">{previewLot}</p>
          </div>

          <button 
            onClick={() => onPrint(config)}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <Printer size={20} /> Start Printopdracht
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminPrinterManager = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("config"); // 'config' | 'queue'
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [availableStations, setAvailableStations] = useState([]);
  const [printerStatuses, setPrinterStatuses] = useState({});
  const [showLotModal, setShowLotModal] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    ip: "",
    port: "9100",
    protocol: "zpl",
    dpi: "203",
    width: "100",
    height: "50",
    darkness: "15",
    linkedStations: [], // Nieuw: Array van station IDs
    type: "network", // 'network' | 'zebra_local'
    isDefault: false,
    vendorId: null,
    productId: null,
    deviceName: ""
  });

  // Fetch printers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, ...PATHS.PRINTERS), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrinters(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch stations voor koppeling
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const docRef = doc(db, ...PATHS.FACTORY_CONFIG);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const stations = [];
          (data.departments || []).forEach(dept => {
            (dept.stations || []).forEach(s => stations.push(s.name));
          });
          setAvailableStations([...new Set(stations)].sort());
        }
      } catch (e) { console.error("Err stations", e); }
    };
    fetchStations();
  }, []);

  const checkPrinterStatus = async (printer) => {
    if (printer.type !== 'network' || !printer.ip) return;
    
    setPrinterStatuses(prev => ({ ...prev, [printer.id]: 'checking' }));
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        await fetch(`http://${printer.ip}/`, { 
            method: 'GET', 
            mode: 'no-cors', 
            signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        setPrinterStatuses(prev => ({ ...prev, [printer.id]: 'online' }));
    } catch {
        setPrinterStatuses(prev => ({ ...prev, [printer.id]: 'offline' }));
    }
  };

  const handleCheckAll = () => {
    printers.forEach(checkPrinterStatus);
  };

  useEffect(() => {
    if (printers.length > 0) {
        handleCheckAll();
    }
  }, [printers]);

  const handleSave = async () => {
    if (!formData.name) return alert(t('adminPrinterManager.nameRequired'));
    if (formData.type === "network" && !formData.ip) return alert(t('adminPrinterManager.ipRequiredForNetwork'));

    try {
      // Als deze default wordt, zet anderen uit
      if (formData.isDefault) {
        const updates = printers
          .filter(p => p.isDefault && p.id !== editingId)
          .map(p => updateDoc(doc(db, ...PATHS.PRINTERS, p.id), { isDefault: false }));
        await Promise.all(updates);
      }

      if (editingId) {
        await updateDoc(doc(db, ...PATHS.PRINTERS, editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, ...PATHS.PRINTERS), {
          ...formData,
          createdAt: serverTimestamp()
        });
      }

      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer saved: ${formData.name}`);

      setIsAdding(false);
      setEditingId(null);
      setFormData({ name: "", ip: "", port: "9100", protocol: "zpl", dpi: "203", width: "100", height: "50", darkness: "15", linkedStations: [], type: "network", isDefault: false, vendorId: null, productId: null, deviceName: "" });
    } catch (err) {
      console.error("Error saving printer:", err);
      alert(t('adminPrinterManager.saveError') + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('adminPrinterManager.confirmDeletePrinter'))) return;
    try {
      await deleteDoc(doc(db, ...PATHS.PRINTERS, id));
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer deleted: ${id}`);
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      // Zet alle anderen op false
      const updates = printers.map(p => 
        updateDoc(doc(db, ...PATHS.PRINTERS, p.id), { 
          isDefault: p.id === id 
        })
      );
      await Promise.all(updates);
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer default set to: ${id}`);
    } catch (err) {
      console.error("Error setting default:", err);
    }
  };

  // WebUSB Direct Print Implementation
  const printViaWebUSB = async (printerData, zplContent) => {
    if (!navigator.usb) throw new Error("WebUSB wordt niet ondersteund in deze browser.");
    
    let device;
    // Probeer bekende printer te vinden
    if (printerData.vendorId && printerData.productId) {
        const devices = await navigator.usb.getDevices();
        device = devices.find(d => d.vendorId === printerData.vendorId && d.productId === printerData.productId);
    }
    
    // Als niet gevonden of niet geconfigureerd, vraag gebruiker
    if (!device) {
        try {
            // Filters leeg laten om alle apparaten te tonen (ook Lighthouse CJ-Pro II)
            device = await navigator.usb.requestDevice({ filters: [] });
        } catch (err) {
            if (err.name === 'SecurityError' || err.name === 'NotFoundError') {
                throw new Error("USB Toegang Geweigerd. Selecteer de printer in het pop-up venster van de browser.");
            }
            throw err;
        }
    }

    if (!device) throw new Error("Geen printer geselecteerd.");

    try {
        if (!device.opened) await device.open();
    } catch (err) {
        console.error("USB Open Error:", err);
        if (err.name === 'SecurityError' || err.message?.includes('Access denied')) {
             throw new Error("Toegang geweigerd door Windows. De printer is als systeemprinter geïnstalleerd. Voor WebUSB is de WinUSB-driver nodig (via Zadig).");
        }
        throw new Error(`Kan printer niet openen: ${err.message}. (WinUSB driver nodig?)`);
    }

    if (device.configuration === null) await device.selectConfiguration(1);
    
    try {
        await device.claimInterface(0);
    } catch (err) {
         console.warn("Interface claim warning:", err);
         // Soms werkt het toch, of is het al geclaimd. We proberen door te gaan.
    }
    
    const encoder = new window.TextEncoder();
    const data = encoder.encode(zplContent);
    
    // Zoek OUT endpoint
    const interface0 = device.configuration.interfaces[0];
    const endpoint = interface0?.alternate?.endpoints.find(e => e.direction === "out");
    const endpointNumber = endpoint ? endpoint.endpointNumber : 1;

    await device.transferOut(endpointNumber, data);
    
    try {
        await device.close();
    } catch (e) { /* ignore */ }
  };

  const handleBulkLotPrint = async (config) => {
    const printer = printers.find(p => p.id === config.printerId);
    if (!printer) return alert("Selecteer een printer.");

    const iso = getIsoWeekAndYear(new Date(config.date));
    const machineCode = getMachineCode(config.station);
    const baseLot = `40${iso.year.slice(-2)}${iso.week}${machineCode}40`;

    // Printer settings
    const darkness = printer.darkness ? parseInt(printer.darkness) : 15;
    // Voor lotnummers gebruiken we een vast formaat 
    // ZPL Template voor 100x50mm label (aanpasbaar indien nodig)
    
    try {
      for (let i = 0; i < config.count; i++) {
        const seqNum = config.mode === 'sequential' ? config.startSeq + i : config.startSeq;
        const lotNumber = `${baseLot}${String(seqNum).padStart(4, '0')}`;
        
        // Eenvoudige ZPL voor lotnummer
        const zpl = `^XA
~SD${darkness}
^FO20,20^BQN,2,6^FDQA,${lotNumber}^FS
^FO180,60^A0N,60,60^FD${lotNumber}^FS
^FO180,140^A0N,30,30^FD${config.station} - WK${iso.week}^FS
^XZ`;

        if (printer.type === "network") {
           await fetch(`http://${printer.ip}/pstprnt`, { 
              method: "POST", 
              body: zpl, 
              mode: "no-cors" 
           });
        } else {
           await printViaWebUSB(printer, zpl);
        }
        
        // Korte pauze tussen prints om buffer overflow te voorkomen
        await new Promise(r => setTimeout(r, 100));
      }
      alert(`Klaar! ${config.count} labels verzonden naar ${printer.name}.`);
      setShowLotModal(false);
    } catch (e) {
      alert("Print Fout: " + e.message);
    }
  };

  const handlePairUsb = async () => {
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setFormData(prev => ({
        ...prev,
        vendorId: device.vendorId,
        productId: device.productId,
        deviceName: device.productName || "USB Printer"
      }));
    } catch (err) {
      console.error("Pairing error:", err);
      if (err.name !== 'NotFoundError') {
          alert("Koppelen geannuleerd of mislukt: " + err.message);
      }
    }
  };

  const handleTestPrint = async (printer) => {
    const protocol = (printer.protocol || "zpl").toLowerCase();
    const dpi = printer.dpi ? parseInt(printer.dpi) : 203;
    const darkness = printer.darkness ? parseInt(printer.darkness) : 15;
    const scale = dpi / 203;

    const xQr = Math.round(50 * scale);
    const yQr = Math.round(50 * scale);
    const qrMag = Math.max(2, Math.round(4 * scale));
    const xText1 = Math.round(50 * scale);
    const yText1 = Math.round(160 * scale);
    const hText1 = Math.round(40 * scale);
    const xText2 = Math.round(50 * scale);
    const yText2 = Math.round(210 * scale);
    const hText2 = Math.round(30 * scale);

    const zpl = `^XA
~SD${darkness}
^FO${xQr},${yQr}^BQN,2,${qrMag}^FDQA,TEST-PRINT^FS
^FO${xText1},${yText1}^A0N,${hText1},${hText1}^FDTEST PRINT^FS
^FO${xText2},${yText2}^A0N,${hText2},${hText2}^FD${printer.name}^FS
^XZ`;

    if (printer.type === "network") {
      if (protocol !== "zpl") {
        alert(t('adminPrinterManager.networkPrintSupportsZplOnly', { protocol: protocol.toUpperCase() }));
        return;
      }
      try {
        await fetch(`http://${printer.ip}/pstprnt`, { 
          method: "POST", 
          body: zpl, 
          mode: "no-cors" 
        });
        alert(`${t('adminPrinterManager.testCommandSentTo')} ${printer.ip}`);
      } catch (err) {
        alert(t('adminPrinterManager.connectionErrorNetwork') + err.message);
      }
    } else {
      try {
        await printViaWebUSB(printer, zpl);
        alert(t('adminPrinterManager.usbDirectPrintSent'));
      } catch (err) {
        alert("USB Print Fout: " + err.message);
      }
    }
  };

  const handleTestNewPrinter = async () => {
    if (formData.type === "network" && !formData.ip) {
      alert(t('adminPrinterManager.enterValidIpFirst'));
      return;
    }

    if ((formData.protocol || "zpl").toLowerCase() !== "zpl") {
      alert(t('adminPrinterManager.networkPrintSupportsZplOnly', { protocol: (formData.protocol || "zpl").toUpperCase() }));
      return;
    }
    
    const dpi = formData.dpi ? parseInt(formData.dpi) : 203;
    const darkness = formData.darkness ? parseInt(formData.darkness) : 15;
    const scale = dpi / 203;

    const xQr = Math.round(50 * scale);
    const yQr = Math.round(50 * scale);
    const qrMag = Math.max(2, Math.round(4 * scale));
    const xText1 = Math.round(50 * scale);
    const yText1 = Math.round(160 * scale);
    const hText1 = Math.round(40 * scale);
    const xText2 = Math.round(50 * scale);
    const yText2 = Math.round(210 * scale);
    const hText2 = Math.round(30 * scale);

    const zpl = `^XA
~SD${darkness}
^FO${xQr},${yQr}^BQN,2,${qrMag}^FDQA,TEST-SETUP^FS
^FO${xText1},${yText1}^A0N,${hText1},${hText1}^FDSETUP TEST^FS
^FO${xText2},${yText2}^A0N,${hText2},${hText2}^FD${formData.name || "Nieuwe Printer"}^FS
^XZ`;

    if (formData.type === "network") {
        try {
          await fetch(`http://${formData.ip}/pstprnt`, { 
            method: "POST", 
            body: zpl, 
            mode: "no-cors" 
          });
          alert(`${t('adminPrinterManager.testCommandSentTo')} ${formData.ip}`);
        } catch (err) {
          alert(t('adminPrinterManager.connectionErrorIp') + err.message);
        }
    } else {
        try {
            await printViaWebUSB(formData, zpl);
            alert("Test label verzonden naar USB printer!");
        } catch (err) {
            alert("USB Test Fout: " + err.message);
        }
    }
  };

  const handleTestAlignment = async (data) => {
    if (data.type !== "network" || !data.ip) {
      alert(t('adminPrinterManager.onlyForNetworkPrinters'));
      return;
    }

    if ((data.protocol || "zpl").toLowerCase() !== "zpl") {
      alert(t('adminPrinterManager.networkPrintSupportsZplOnly', { protocol: (data.protocol || "zpl").toUpperCase() }));
      return;
    }

    const dpi = data.dpi ? parseInt(data.dpi) : 203;
    const darkness = data.darkness ? parseInt(data.darkness) : 15;
    const widthMm = data.width ? parseInt(data.width) : 100;
    const heightMm = data.height ? parseInt(data.height) : 50;

    // Convert mm to dots (1 inch = 25.4 mm)
    const dotsPerMm = dpi / 25.4;
    const widthDots = Math.round(widthMm * dotsPerMm);
    const heightDots = Math.round(heightMm * dotsPerMm);
    
    // ZPL: Box met randen (4 dots dik)
    const zpl = `^XA
~SD${darkness}
^FO0,0^GB${widthDots},${heightDots},4^FS
^FO20,20^A0N,30,30^FD${widthMm}mm x ${heightMm}mm^FS
^FO20,60^A0N,25,25^FD${dpi} DPI - Alignment^FS
^XZ`;

    try {
      await fetch(`http://${data.ip}/pstprnt`, { method: "POST", body: zpl, mode: "no-cors" });
      alert(`${t('adminPrinterManager.alignmentTestSentTo')} ${data.ip}`);
    } catch (err) {
      alert(t('adminPrinterManager.connectionError') + err.message);
    }
  };

  const handlePrintA4QrPdf = () => {
    const qrContent = 'FPI-ACTION-APPROVE-OK';
    const doc = new jsPDF('p', 'mm', 'a4');
    const qrSize = 100; // 10cm in mm
    const pageWidth = 210;
    const pageHeight = 297;
    const x = (pageWidth - qrSize) / 2;
    const y = (pageHeight - qrSize) / 2 - 20; // Iets hoger dan het midden

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${qrContent}`;
    
    img.onload = () => {
        doc.addImage(img, 'PNG', x, y, qrSize, qrSize);
        doc.setFontSize(24);
        doc.setFont("helvetica", "bold");
        doc.text('SCAN: OK / GEREED', pageWidth / 2, y + qrSize + 15, { align: 'center' });
        doc.output('dataurlnewwindow');
    };
    img.onerror = () => {
        alert("Kon de QR-code afbeelding niet laden. Controleer de internetverbinding.");
    };
  };

  const handleEdit = (printer) => {
    setFormData({
      name: printer.name || "",
      ip: printer.ip || "",
      port: printer.port || "9100",
      protocol: printer.protocol || "zpl",
      dpi: printer.dpi || "203",
      width: printer.width || "100",
      height: printer.height || "50",
      darkness: printer.darkness || "15",
      linkedStations: printer.linkedStations || [],
      type: printer.type || "network",
      isDefault: printer.isDefault || false
    });
    setEditingId(printer.id);
    setIsAdding(true);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase italic">{t('common.printerManagement')}</h2>
          <p className="text-sm text-slate-500 font-bold">{t('common.configurePrinters')}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleCheckAll}
            className="p-2 bg-white border-2 border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 hover:text-blue-600 transition-all"
            title={t('adminPrinterManager.refreshStatus')}
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={() => setShowLotModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-purple-700 transition-all"
          >
            <Hash size={16} /> Lotnummers
          </button>
          <button 
            onClick={handlePrintA4QrPdf}
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-emerald-700 transition-all"
          >
            <QrCode size={16} /> Print 'OK' QR (A4)
          </button>
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({ name: "", ip: "", port: "9100", protocol: "zpl", dpi: "203", width: "100", height: "50", darkness: "15", linkedStations: [], type: "network", isDefault: false, vendorId: null, productId: null, deviceName: "" });
              setIsAdding(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-blue-700 transition-all"
          >
            <Plus size={16} /> {t('common.newPrinter')}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 border-b border-slate-200 pb-1 mb-6">
        <button
          onClick={() => setActiveTab("config")}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "config" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Printer size={16} /> Printer Config
        </button>
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "queue" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <List size={16} /> Print Wachtrij
        </button>
      </div>

      {activeTab === "config" && (
      <>
      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border-2 border-blue-100 shadow-lg mb-8 animate-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-black text-slate-700 uppercase">{editingId ? t('adminPrinterManager.editPrinter') : t('adminPrinterManager.addNewPrinter')}</h3>
            <button onClick={() => { setIsAdding(false); setEditingId(null); }}><X size={20} className="text-slate-400" /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.name')}</label>
              <input 
                type="text" 
                placeholder={t('adminPrinterManager.printerNamePlaceholder')}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            
            {/* Station Koppeling */}
            <div className="md:col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                    <MapPin size={14} /> {t('adminPrinterManager.linkToWorkstationOptional')}
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {formData.linkedStations.map(station => (
                        <span key={station} className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                            {station}
                            <button onClick={() => setFormData({...formData, linkedStations: formData.linkedStations.filter(s => s !== station)})} className="hover:text-blue-900"><X size={12} /></button>
                        </span>
                    ))}
                </div>
                <select 
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none"
                    onChange={(e) => {
                        if (e.target.value && !formData.linkedStations.includes(e.target.value)) {
                            setFormData({...formData, linkedStations: [...formData.linkedStations, e.target.value]});
                        }
                        e.target.value = "";
                    }}
                >
                    <option value="">{t('adminPrinterManager.addStationPlaceholder')}</option>
                    {availableStations.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.connection')}</label>
              <div className="flex gap-2">
                <select 
                  className="w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value})}
                >
                  <option value="network">{t('adminPrinterManager.networkIp')}</option>
                  <option value="zebra_local">{t('adminPrinterManager.localUsb')}</option>
                </select>
                {formData.type === "network" ? (
                  <>
                    <input 
                      type="text" 
                      placeholder="192.168.x.x"
                      className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                      value={formData.ip}
                      onChange={e => setFormData({...formData, ip: e.target.value})}
                    />
                    <input 
                      type="text" 
                      placeholder="9100"
                      className="w-24 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500 text-center"
                      value={formData.port}
                      onChange={e => setFormData({...formData, port: e.target.value})}
                    />
                  </>
                ) : (
                  <div className="flex-1 p-3 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 italic flex flex-col justify-center">
                    <div className="flex items-center justify-between">
                        <span>{formData.deviceName ? `Gekoppeld: ${formData.deviceName}` : "Directe USB Print"}</span>
                        <button onClick={handlePairUsb} className="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-blue-600 font-bold flex items-center gap-1">
                            <Usb size={14} />
                            {formData.vendorId ? "Opnieuw Koppelen" : "Koppel Printer"}
                        </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.protocol')}</label>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                value={formData.protocol}
                onChange={e => setFormData({...formData, protocol: e.target.value})}
              >
                {PRINTER_PROTOCOLS.map(protocol => (
                  <option key={protocol} value={protocol}>{t(`adminPrinterManager.protocol${protocol.toUpperCase()}`)}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-3 gap-3 md:col-span-2">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.dpi')}</label>
                    <select className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.dpi} onChange={e => setFormData({...formData, dpi: e.target.value})}>
                        <option value="203">203 DPI</option>
                        <option value="300">300 DPI</option>
                        <option value="600">600 DPI</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.formatMm')}</label>
                    <div className="flex items-center gap-1">
                        <input type="number" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" placeholder="B" value={formData.width} onChange={e => setFormData({...formData, width: e.target.value})} />
                        <span className="text-slate-300">x</span>
                        <input type="number" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" placeholder="H" value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})} />
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.darkness')}</label>
                    <input type="number" min="0" max="30" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.darkness} onChange={e => setFormData({...formData, darkness: e.target.value})} />
                </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <input 
              type="checkbox" 
              id="isDefault"
              checked={formData.isDefault}
              onChange={e => setFormData({...formData, isDefault: e.target.checked})}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="isDefault" className="text-sm font-bold text-slate-700 cursor-pointer">
              {t('adminPrinterManager.setAsDefaultPrinter')}
            </label>
          </div>

          <div className="flex justify-end gap-3">
            {(formData.type === "network" || formData.type === "zebra_local") && (
              <div className="flex gap-2 mr-auto">
                <button 
                  onClick={handleTestNewPrinter}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200 flex items-center gap-2"
                >
                  <Wifi size={16} /> {t('adminPrinterManager.testConnection')}
                </button>
                {formData.type === "network" && (
                    <button 
                      onClick={() => handleTestAlignment(formData)}
                      className="px-4 py-2 bg-purple-50 text-purple-600 font-bold rounded-lg hover:bg-purple-100 flex items-center gap-2"
                    >
                      <Scan size={16} /> {t('adminPrinterManager.testFrame')}
                    </button>
                )}
              </div>
            )}
            <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Save size={16} /> {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {showLotModal && (
        <LotPrintModal onClose={() => setShowLotModal(false)} stations={availableStations} printers={printers} onPrint={handleBulkLotPrint} />
      )}

      <div className="grid gap-4">
        {printers.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 italic">{t('adminPrinterManager.noPrintersConfigured')}</div>
        )}
        
        {printers.map(printer => (
          <div key={printer.id} className={`bg-white p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${printer.isDefault ? 'border-emerald-400 shadow-sm' : 'border-slate-100'}`}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${printer.type === 'network' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                {printer.type === 'network' ? <Wifi size={24} /> : <Printer size={24} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-800">{printer.name}</h3>
                  {printer.isDefault && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-md border border-emerald-200">{t('common.default')}</span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-400 font-mono mt-0.5">
                  {printer.type === 'network' ? `IP: ${printer.ip}:${printer.port || 9100}` : (printer.deviceName ? `USB: ${printer.deviceName}` : t('adminPrinterManager.localUsb'))}
                  {printer.type === 'network' && printer.dpi && <span className="ml-2 opacity-60 text-[10px]">({printer.dpi} DPI)</span>}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                  {t('adminPrinterManager.protocol')}: {((printer.protocol || 'zpl')).toUpperCase()}
                </p>
                <p className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-1">
                    {printer.linkedStations && printer.linkedStations.length > 0 
                        ? printer.linkedStations.map(s => <span key={s} className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{s}</span>)
                        : <span className="italic opacity-50">{t('adminPrinterManager.noSpecificStations')}</span>}
                </p>
                {printer.type === 'network' && (
                  <div className="flex items-center gap-1.5 mt-2">
                      <div className={`w-2 h-2 rounded-full ${
                          printerStatuses[printer.id] === 'online' ? 'bg-emerald-500' : 
                          printerStatuses[printer.id] === 'offline' ? 'bg-rose-500' : 
                          'bg-slate-300 animate-pulse'
                      }`} />
                      <span className={`text-[9px] font-bold uppercase ${
                          printerStatuses[printer.id] === 'online' ? 'text-emerald-600' : 
                          printerStatuses[printer.id] === 'offline' ? 'text-rose-600' : 
                          'text-slate-400'
                      }`}>
                          {printerStatuses[printer.id] === 'online' ? t('adminPrinterManager.online') : 
                           printerStatuses[printer.id] === 'offline' ? t('adminPrinterManager.offline') : 
                           t('adminPrinterManager.connecting')}
                      </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!printer.isDefault && (
                <button 
                  onClick={() => handleSetDefault(printer.id)}
                  className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title={t('adminPrinterManager.makeDefault')}
                >
                  <CheckCircle2 size={18} />
                </button>
              )}
              <button 
                onClick={() => handleTestPrint(printer)}
                className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title={t('adminPrinterManager.testPrint')}
              >
                <Play size={18} />
              </button>
              <button 
                onClick={() => handleTestAlignment(printer)}
                className="p-2 text-slate-300 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                title={t('adminPrinterManager.testAlignmentFrame')}
              >
                <Scan size={18} />
              </button>
              <button 
                onClick={() => handleEdit(printer)}
                className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title={t('common.edit')}
              >
                <Edit size={18} />
              </button>
              <button 
                onClick={() => handleDelete(printer.id)}
                className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title={t('common.delete')}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
      </>
      )}

      {activeTab === "queue" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <PrintQueueAdminView />
        </div>
      )}
    </div>
  );
};

export default AdminPrinterManager;