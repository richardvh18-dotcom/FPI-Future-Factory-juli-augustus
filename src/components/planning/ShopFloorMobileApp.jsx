import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Activity, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  Search,
  Filter,
  ChevronRight,
  BarChart3,
  Eye,
  MapPin,
  Zap,
  Package,
  PlayCircle,
  ScanLine,
  UserCheck,
  X,
  Info,
  Calendar,
  Building2
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { differenceInMinutes } from "date-fns";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

/**
 * Mobile Inspector - Floor manager companion app
 * Voor teamleaders, QC en planners die rondlopen op de werkvloer
 * Overzicht van alle machines, downtimes, QC issues en order status
 */
const ShopFloorMobileApp = () => {
  const { user, role } = useAdminAuth();
  const [machines, setMachines] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [downtimeReports, setDowntimeReports] = useState([]);
  const [allPersonnel, setAllPersonnel] = useState([]);
  const [defectReports, setDefectReports] = useState([]);
  const [allTracked, setAllTracked] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | active | issues
  const [activeView, setActiveView] = useState("overview"); // overview | downtime | quality | orders | scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scannerLoaded, setScannerLoaded] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [factoryStations, setFactoryStations] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [departments, setDepartments] = useState(["ALLES"]);
  const [selectedDepartment, setSelectedDepartment] = useState("ALLES");
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const codeReaderRef = useRef(null);
  const isScanningRef = useRef(false);
  const isProcessingFrameRef = useRef(false);

  useEffect(() => {
    // Load ZXing library (Multi-format support: QR + Barcodes)
    const scriptId = "zxing-scanner";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/@zxing/library@0.20.0";
      script.async = true;
      script.onload = () => setScannerLoaded(true);
      document.head.appendChild(script);
    } else {
      setScannerLoaded(true);
    }

    // Load factory config for full machine list
    const unsubConfig = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const stations = [];
          const depts = ["ALLES"];
          if (data.departments) {
            data.departments.forEach(dept => {
              if (dept.isActive !== false) depts.push(dept.name);
              if (dept.stations) {
                dept.stations.forEach(station => {
                  stations.push({
                    ...station,
                    departmentName: dept.name
                  });
                });
              }
            });
          }
          setFactoryStations(stations);
          setDepartments(depts);
        }
      }
    );

    // Load all machines/occupancy
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snapshot) => {
        const occData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMachines(occData);
      }
    );

    // Load all orders
    const unsubPlanning = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        const orders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAllOrders(orders);
      }
    );

    // Load tracked products
    const unsubTracked = onSnapshot(
      collection(db, ...PATHS.TRACKING),
      (snapshot) => {
        const tracked = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAllTracked(tracked);
      }
    );

    // Load downtime reports
    const unsubDowntime = onSnapshot(
      collection(db, ...PATHS.DOWNTIME),
      (snapshot) => {
        const reports = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setDowntimeReports(reports);
      }
    );

    // Load defect reports
    const unsubDefects = onSnapshot(
      collection(db, ...PATHS.DEFECTS),
      (snapshot) => {
        const reports = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setDefectReports(reports);
      }
    );

    // Load personnel
    const unsubPersonnel = onSnapshot(
      collection(db, ...PATHS.PERSONNEL),
      (snapshot) => {
        const people = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllPersonnel(people);
      }
    );

    return () => {
      unsubOccupancy();
      unsubPlanning();
      unsubTracked();
      unsubDowntime();
      unsubDefects();
      unsubPersonnel();
      unsubConfig();
      stopCamera();
    };
  }, []);

  // Auto-select department for team leaders
  useEffect(() => {
    if (role === "teamleader" && user?.department) {
      const match = departments.find(d => d === user.department);
      if (match) setSelectedDepartment(match);
    }
  }, [role, user, departments]);

  // Calculate machine statistics
  const machineStats = useMemo(() => {
    // Use factory config as base, fallback to occupancy data if config not loaded
    let baseList = [];
    if (factoryStations.length > 0) {
      baseList = factoryStations.map(s => ({ 
        machine: s.name, 
        id: s.id, 
        department: s.departmentName 
      }));
    } else {
      // Fallback: unique machines from occupancy
      const unique = [...new Set(machines.map(m => m.machine || m.machineId).filter(Boolean))];
      baseList = unique.map(name => ({ machine: name, id: name }));
    }

    return baseList.map(baseMachine => {
      const name = baseMachine.machine;
      
      // Find active occupancy
      const occ = machines.find(m => 
        (m.machine === name || m.machineId === baseMachine.id) && m.operatorName
      );

      const machineOrders = allOrders.filter(o => o.machine === name);
      const activeOrder = machineOrders.find(o => o.status === "in_production");
      const machineDowntime = downtimeReports.filter(d => d.machine === name && d.status === "active");
      const machineDefects = defectReports.filter(d => d.machine === name && d.status === "open");
      
      const hasIssues = machineDowntime.length > 0 || machineDefects.length > 0;
      const isActive = activeOrder !== undefined;
      
      return {
        ...baseMachine,
        operatorName: occ?.operatorName,
        activeOrder,
        ordersCount: machineOrders.length,
        downtimeCount: machineDowntime.length,
        defectCount: machineDefects.length,
        hasIssues,
        isActive,
        status: hasIssues ? "issue" : isActive ? "active" : "idle"
      };
    });
  }, [factoryStations, machines, allOrders, downtimeReports, defectReports]);

  // Filter machines
  const filteredMachines = useMemo(() => {
    let filtered = machineStats;
    
    // Filter by Department
    if (selectedDepartment !== "ALLES") {
      filtered = filtered.filter(m => m.department === selectedDepartment);
    }

    // Filter by status
    if (filterStatus === "active") {
      filtered = filtered.filter(m => m.isActive);
    } else if (filterStatus === "issues") {
      filtered = filtered.filter(m => m.hasIssues);
    }
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m => 
        m.machine?.toLowerCase().includes(term) ||
        m.operatorName?.toLowerCase().includes(term) ||
        m.activeOrder?.orderId?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [machineStats, filterStatus, searchTerm, selectedDepartment]);

  // Active issues summary
  const issuesSummary = useMemo(() => ({
    totalDowntime: downtimeReports.filter(d => d.status === "active").length,
    totalDefects: defectReports.filter(d => d.status === "open").length,
    machinesWithIssues: machineStats.filter(m => m.hasIssues).length,
    activeMachines: machineStats.filter(m => m.isActive).length
  }), [downtimeReports, defectReports, machineStats]);

  // Resolve downtime
  const resolveDowntime = async (downtimeId) => {
    await updateDoc(doc(db, ...PATHS.DOWNTIME, downtimeId), {
      status: "resolved",
      resolvedAt: serverTimestamp(),
      resolvedBy: user?.uid
    });
  };

  // Resolve defect
  const resolveDefect = async (defectId) => {
    await updateDoc(doc(db, ...PATHS.DEFECTS, defectId), {
      status: "resolved",
      resolvedAt: serverTimestamp(),
      resolvedBy: user?.uid
    });
  };

  // QR Scanner functions
  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: "environment", 
          width: { ideal: 1920 }, // Hogere resolutie voor betere detectie
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" }] // Probeer autofocus te forceren
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply focus constraint if supported
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch(e) {}
      }

      if (videoRef.current && window.ZXing) {
        const codeReader = new window.ZXing.BrowserMultiFormatReader();
        codeReaderRef.current = codeReader;
        isScanningRef.current = true;

        // ZXing handles the video stream and decoding loop
        await codeReader.decodeFromStream(stream, videoRef.current, (result, err) => {
          if (result) {
            if (navigator.vibrate) navigator.vibrate(100);
            handleScan(result.getText());
          }
        });
      }
    } catch (error) {
      console.error("Camera error:", error);
      alert("Kan camera niet starten. Controleer permissies.");
      setShowScanner(false);
    }
  };

  const stopCamera = () => {
    isScanningRef.current = false;
    
    if (codeReaderRef.current) {
      codeReaderRef.current.reset(); // Stops the stream and the decoding loop
      codeReaderRef.current = null;
    }
  };

  const handleScan = (rawCode) => {
    stopCamera();
    
    if (!rawCode) return;
    const scannedCode = rawCode.trim();
    const lowerCode = scannedCode.toLowerCase();
    
    // Search in tracked products
    const product = allTracked.find(p => 
      (p.lotNumber && p.lotNumber.toLowerCase() === lowerCode) || 
      (p.orderId && p.orderId.toLowerCase() === lowerCode) ||
      p.id === scannedCode
    );

    // Search in orders
    const order = allOrders.find(o => 
      (o.orderId && o.orderId.toLowerCase() === lowerCode) || 
      (o.item && o.item.toLowerCase() === lowerCode) ||
      (o.itemCode && o.itemCode.toLowerCase() === lowerCode) ||
      (o.extraCode && o.extraCode.toLowerCase() === lowerCode) ||
      o.id === scannedCode
    );

    // Search in personnel
    const person = allPersonnel.find(p => 
      (p.employeeNumber && p.employeeNumber.toLowerCase() === lowerCode) || 
      p.id === scannedCode
    );

    if (product) {
      setScanResult({
        type: "product",
        data: product,
        code: scannedCode
      });
    } else if (order) {
      setScanResult({
        type: "order",
        data: order,
        code: scannedCode,
        onClick: () => setSelectedOrder(order) // Allow clicking to open details
      });
    } else if (person) {
      setScanResult({
        type: "personnel",
        data: person,
        code: scannedCode
      });
    } else {
      setScanResult({
        type: "unknown",
        code: scannedCode
      });
    }
  };

  const closeScanner = () => {
    stopCamera();
    setShowScanner(false);
    setScanResult(null);
    setManualCode("");
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleScan(manualCode.trim());
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center text-white">
          <AlertTriangle className="mx-auto mb-4 text-amber-500" size={48} />
          <div className="text-xl font-bold mb-2">Niet ingelogd</div>
          <div className="text-sm text-slate-400">Log in om toegang te krijgen</div>
        </div>
      </div>
    );
  }

  const isDeptLocked = role === "teamleader" && user?.department && departments.includes(user.department);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black">
          <div className="relative h-full">
            {/* Close Button */}
            <button
              onClick={closeScanner}
              className="absolute top-4 right-4 z-10 p-3 bg-white rounded-full shadow-lg"
            >
              <X size={24} className="text-slate-900" />
            </button>

            {/* Scanner Result */}
            {scanResult ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/90">
                <div className="bg-white rounded-3xl p-6 max-w-md w-full">
                  {scanResult.type === "product" ? (
                    <>
                      <div className="text-center mb-4">
                        <CheckCircle className="mx-auto text-emerald-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">Product Gevonden</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Lotnummer</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.lotNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Order</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.orderId}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Machine</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.machine}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Status</div>
                          <div className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${
                            scanResult.data.status === "In Production"
                              ? "bg-orange-100 text-orange-700"
                              : scanResult.data.status === "Released"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-700"
                          }`}>
                            {scanResult.data.status}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : scanResult.type === "order" ? (
                    <>
                      <div className="text-center mb-4">
                        <CheckCircle className="mx-auto text-blue-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">Order Gevonden</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Order ID</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.orderId}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Item</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.item}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Machine</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.machine}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Status</div>
                          <div className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${
                            scanResult.data.status === "in_production"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {scanResult.data.status}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => { closeScanner(); setSelectedOrder(scanResult.data); }}
                        className="w-full mt-4 py-3 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl font-bold transition-colors"
                      >
                        Bekijk Details
                      </button>
                    </>
                  ) : scanResult.type === "personnel" ? (
                    <>
                      <div className="text-center mb-4">
                        <UserCheck className="mx-auto text-purple-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">Personeel</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Naam</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.name}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Personeelsnummer</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.employeeNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Afdeling</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.departmentId || "Algemeen"}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-center mb-4">
                        <AlertTriangle className="mx-auto text-amber-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">Niet Gevonden</div>
                      </div>
                      <div className="text-center text-slate-600">
                        Code <span className="font-mono font-bold">{scanResult.code}</span> niet gevonden in systeem.
                      </div>
                    </>
                  )}
                  
                  <button
                    onClick={closeScanner}
                    className="w-full mt-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors"
                  >
                    Sluiten
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Camera View */}
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  autoPlay
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Scan Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-72 h-72">
                    {/* Scanning animation */}
                    <div className="absolute inset-0 border-4 border-white/30 rounded-3xl"></div>
                    <div className="absolute inset-0 border-4 border-indigo-500 rounded-3xl animate-pulse"></div>
                    
                    {/* Corner markers */}
                    <div className="absolute -top-2 -left-2 w-16 h-16 border-t-4 border-l-4 border-indigo-400 rounded-tl-3xl"></div>
                    <div className="absolute -top-2 -right-2 w-16 h-16 border-t-4 border-r-4 border-indigo-400 rounded-tr-3xl"></div>
                    <div className="absolute -bottom-2 -left-2 w-16 h-16 border-b-4 border-l-4 border-indigo-400 rounded-bl-3xl"></div>
                    <div className="absolute -bottom-2 -right-2 w-16 h-16 border-b-4 border-r-4 border-indigo-400 rounded-br-3xl"></div>
                  </div>
                </div>

                {/* Manual Input */}
                <div className="absolute bottom-24 left-0 right-0 px-6">
                  <form onSubmit={handleManualSubmit} className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Of typ code handmatig..." 
                      className="flex-1 bg-white/90 backdrop-blur border-0 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                    />
                    <button type="submit" className="bg-indigo-600 text-white px-4 rounded-xl font-bold">Go</button>
                  </form>
                </div>
                
                {/* Instructions */}
                <div className="absolute bottom-8 left-0 right-0 text-center px-4">
                  <div className="bg-black/70 backdrop-blur-sm px-6 py-4 rounded-2xl inline-block">
                    <div className="text-white font-bold text-lg mb-1">Scan QR Code</div>
                    <div className="text-xs text-white/70">Plaats de QR code in het midden van het vierkant</div>
                    {!scannerLoaded && (
                      <div className="text-xs text-amber-300 mt-2">⏳ Scanner wordt geladen...</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
                  {selectedOrder.orderId || selectedOrder.item}
                </h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Order Details
                </p>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={24} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Status Badge */}
              <div className="flex justify-center">
                 <span className={`px-4 py-2 rounded-full text-sm font-black uppercase tracking-widest ${
                    selectedOrder.status === "in_production" ? "bg-orange-100 text-orange-600" :
                    selectedOrder.status === "completed" ? "bg-emerald-100 text-emerald-600" :
                    "bg-blue-100 text-blue-600"
                 }`}>
                    {selectedOrder.status || "Gepland"}
                 </span>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Product</div>
                  <div className="font-bold text-slate-800 text-sm">{selectedOrder.itemCode || selectedOrder.item}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Aantal</div>
                  <div className="font-bold text-slate-800 text-sm">{selectedOrder.plan || 0} stuks</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Machine</div>
                  <div className="font-bold text-slate-800 text-sm">{selectedOrder.machine || "Niet toegewezen"}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Geplande Datum</div>
                  <div className="font-bold text-slate-800 text-sm">
                    {selectedOrder.plannedDate?.seconds 
                      ? format(new Date(selectedOrder.plannedDate.seconds * 1000), 'dd MMM yyyy', { locale: nl })
                      : "Niet gepland"}
                  </div>
                </div>
              </div>

              {/* Extra Info */}
              {selectedOrder.notes && (
                <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100">
                  <div className="text-[10px] font-black text-yellow-600 uppercase mb-1 flex items-center gap-2">
                    <Info size={12} /> Notities
                  </div>
                  <p className="text-sm text-yellow-800 italic">"{selectedOrder.notes}"</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
              <button 
                onClick={() => setSelectedOrder(null)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 shadow-lg sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-white text-2xl font-black">Mobile Inspector</div>
            <div className="text-indigo-200 text-sm font-bold mt-1">
              Werkvloer Overzicht
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowScanner(true);
                setTimeout(() => {
                  if (scannerLoaded) {
                    startCamera();
                  } else {
                    alert("QR Scanner wordt nog geladen, probeer opnieuw...");
                    setShowScanner(false);
                  }
                }, 200);
              }}
              className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
            >
              <ScanLine className="text-white" size={24} />
            </button>
            <div className="bg-white/20 px-4 py-2 rounded-xl">
              <div className="text-white text-xs font-bold">{user?.displayName?.split(' ')[0] || 'Inspector'}</div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Actief</div>
            <div className="text-white text-2xl font-black">{issuesSummary.activeMachines}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Stilstand</div>
            <div className="text-white text-2xl font-black">{issuesSummary.totalDowntime}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Defecten</div>
            <div className="text-white text-2xl font-black">{issuesSummary.totalDefects}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Issues</div>
            <div className="text-white text-2xl font-black">{issuesSummary.machinesWithIssues}</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        {/* Department Selector */}
        <div>
           {isDeptLocked ? (
             <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 rounded-xl text-slate-600 font-bold text-sm w-full border border-slate-200">
               <Building2 size={16} />
               {selectedDepartment}
               <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-500 ml-auto uppercase tracking-wider">Toegewezen</span>
             </div>
           ) : (
             <div className="relative w-full">
               <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <select
                 value={selectedDepartment}
                 onChange={(e) => setSelectedDepartment(e.target.value)}
                 className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all appearance-none"
               >
                 {departments.map(dept => (
                   <option key={dept} value={dept}>{dept}</option>
                 ))}
               </select>
             </div>
           )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Zoek machine, operator, order..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus("all")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
              filterStatus === "all"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Alle ({machineStats.length})
          </button>
          <button
            onClick={() => setFilterStatus("active")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
              filterStatus === "active"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Actief ({issuesSummary.activeMachines})
          </button>
          <button
            onClick={() => setFilterStatus("issues")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
              filterStatus === "issues"
                ? "bg-red-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Issues ({issuesSummary.machinesWithIssues})
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView("overview")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeView === "overview"
                ? "bg-indigo-100 text-indigo-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Overzicht
          </button>
          <button
            onClick={() => setActiveView("downtime")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeView === "downtime"
                ? "bg-orange-100 text-orange-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Stilstand {issuesSummary.totalDowntime > 0 && (
              <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {issuesSummary.totalDowntime}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveView("quality")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeView === "quality"
                ? "bg-red-100 text-red-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            QC {issuesSummary.totalDefects > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {issuesSummary.totalDefects}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveView("orders")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeView === "orders"
                ? "bg-blue-100 text-blue-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Orders
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 pb-24 space-y-3">
        {activeView === "overview" && (
          <>
            {filteredMachines.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Filter size={48} className="mx-auto mb-4 opacity-30" />
                <div className="font-bold text-sm">Geen machines gevonden</div>
              </div>
            ) : (
              filteredMachines.map(machine => (
                <div
                  key={machine.id}
                  className={`bg-white rounded-2xl border-2 p-4 transition-all ${
                    machine.hasIssues 
                      ? "border-red-200 shadow-lg" 
                      : machine.isActive 
                        ? "border-emerald-200" 
                        : "border-slate-100"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin size={16} className="text-indigo-600" />
                        <div className="text-lg font-black text-slate-800">{machine.machine}</div>
                      </div>
                      <div className="text-sm text-slate-600 font-bold">
                        {machine.operatorName || "Geen operator"}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      machine.status === "issue" 
                        ? "bg-red-100 text-red-700"
                        : machine.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                    }`}>
                      {machine.status === "issue" ? "🔴 Issue" : machine.status === "active" ? "🟢 Actief" : "⚪ Idle"}
                    </div>
                  </div>

                  {/* Active Order */}
                  {machine.activeOrder && (
                    <div 
                      className="bg-blue-50 rounded-xl p-3 mb-3 cursor-pointer hover:bg-blue-100 transition-colors"
                      onClick={() => setSelectedOrder(machine.activeOrder)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <PlayCircle size={14} className="text-blue-600" />
                        <div className="text-xs font-bold text-blue-900">In Productie</div>
                      </div>
                      <div className="text-sm font-black text-slate-800">
                        {machine.activeOrder.orderId || machine.activeOrder.item}
                      </div>
                      {machine.activeOrder.plan && (
                        <div className="text-xs text-slate-600 mt-1">
                          {machine.activeOrder.plan} stuks
                        </div>
                      )}
                    </div>
                  )}

                  {/* Issues */}
                  {machine.hasIssues && (
                    <div className="space-y-2">
                      {machine.downtimeCount > 0 && (
                        <div className="flex items-center gap-2 text-orange-700 bg-orange-50 px-3 py-2 rounded-lg">
                          <XCircle size={16} />
                          <span className="text-xs font-bold">{machine.downtimeCount} stilstand meldingen</span>
                        </div>
                      )}
                      {machine.defectCount > 0 && (
                        <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                          <AlertTriangle size={16} />
                          <span className="text-xs font-bold">{machine.defectCount} kwaliteit issues</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Package size={14} />
                      <span className="text-xs font-bold">{machine.ordersCount} orders</span>
                    </div>
                    {machine.hoursPerWeek && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Clock size={14} />
                        <span className="text-xs font-bold">{machine.hoursPerWeek}h/week</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeView === "downtime" && (
          <>
            {downtimeReports.filter(d => d.status === "active").length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle size={48} className="mx-auto mb-4 text-emerald-300" />
                <div className="font-bold text-sm">Geen actieve stilstand meldingen</div>
              </div>
            ) : (
              downtimeReports
                .filter(d => d.status === "active")
                .map(downtime => (
                  <div key={downtime.id} className="bg-white rounded-2xl border-2 border-orange-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <XCircle className="text-orange-600" size={20} />
                          <div className="text-lg font-black text-slate-800">{downtime.machine}</div>
                        </div>
                        <div className="text-sm text-slate-600 font-bold">{downtime.reason}</div>
                      </div>
                      <div className="px-3 py-1 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">
                        {downtime.estimatedMinutes || "?"} min
                      </div>
                    </div>
                    
                    <div className="text-xs text-slate-500 mb-3">
                      Gemeld door: {downtime.operatorName || "Onbekend"}
                    </div>

                    <button
                      onClick={() => resolveDowntime(downtime.id)}
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      ✅ Opgelost
                    </button>
                  </div>
                ))
            )}
          </>
        )}

        {activeView === "quality" && (
          <>
            {defectReports.filter(d => d.status === "open").length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle size={48} className="mx-auto mb-4 text-emerald-300" />
                <div className="font-bold text-sm">Geen openstaande QC issues</div>
              </div>
            ) : (
              defectReports
                .filter(d => d.status === "open")
                .map(defect => (
                  <div key={defect.id} className="bg-white rounded-2xl border-2 border-red-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="text-red-600" size={20} />
                          <div className="text-lg font-black text-slate-800">{defect.machine}</div>
                        </div>
                        <div className="text-sm text-slate-600 font-bold">{defect.defectType}</div>
                      </div>
                      <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        defect.severity === "high" 
                          ? "bg-red-500 text-white" 
                          : defect.severity === "medium"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {defect.severity || "medium"}
                      </div>
                    </div>
                    
                    {defect.description && (
                      <div className="bg-slate-50 rounded-lg p-3 mb-3 text-sm text-slate-700">
                        {defect.description}
                      </div>
                    )}

                    <div className="text-xs text-slate-500 mb-3">
                      Order: {defect.orderId || "Onbekend"} • Gemeld door: {defect.operatorName || "Onbekend"}
                    </div>

                    <button
                      onClick={() => resolveDefect(defect.id)}
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      ✅ Opgelost
                    </button>
                  </div>
                ))
            )}
          </>
        )}

        {activeView === "orders" && (
          <>
            {allOrders.filter(o => o.status === "in_production" || o.status === "planned").length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package size={48} className="mx-auto mb-4 opacity-30" />
                <div className="font-bold text-sm">Geen actieve orders</div>
              </div>
            ) : (
              allOrders
                .filter(o => o.status === "in_production" || o.status === "planned")
                .sort((a, b) => a.status === "in_production" ? -1 : 1)
                .map(order => (
                  <div 
                    key={order.id} 
                    className="bg-white rounded-2xl border-2 border-slate-200 p-4 cursor-pointer hover:border-indigo-300 transition-all active:scale-95"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-lg font-black text-slate-800">
                          {order.orderId || order.item}
                        </div>
                        <div className="text-sm text-slate-600">{order.itemCode}</div>
                      </div>
                      <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        order.status === "in_production"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {order.status === "in_production" ? "In Productie" : "Gepland"}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin size={14} />
                        <span className="font-bold">{order.machine}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Package size={14} />
                        <span className="font-bold">{order.plan} stuks</span>
                      </div>
                      {order.estimatedHours && (
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          <span className="font-bold">{order.estimatedHours}h</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
            )}
          </>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 flex justify-around shadow-lg">
        <button
          onClick={() => setActiveView("overview")}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
            activeView === "overview" 
              ? "bg-indigo-50 text-indigo-600" 
              : "text-slate-400"
          }`}
        >
          <Eye size={22} />
          <span className="text-[10px] font-bold">Overzicht</span>
        </button>
        <button
          onClick={() => setActiveView("downtime")}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors relative ${
            activeView === "downtime" 
              ? "bg-orange-50 text-orange-600" 
              : "text-slate-400"
          }`}
        >
          {issuesSummary.totalDowntime > 0 && (
            <div className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {issuesSummary.totalDowntime}
            </div>
          )}
          <XCircle size={22} />
          <span className="text-[10px] font-bold">Stilstand</span>
        </button>
        <button
          onClick={() => setActiveView("quality")}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors relative ${
            activeView === "quality" 
              ? "bg-red-50 text-red-600" 
              : "text-slate-400"
          }`}
        >
          {issuesSummary.totalDefects > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {issuesSummary.totalDefects}
            </div>
          )}
          <AlertTriangle size={22} />
          <span className="text-[10px] font-bold">QC</span>
        </button>
        <button
          onClick={() => setActiveView("orders")}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
            activeView === "orders" 
              ? "bg-blue-50 text-blue-600" 
              : "text-slate-400"
          }`}
        >
          <Package size={22} />
          <span className="text-[10px] font-bold">Orders</span>
        </button>
      </div>
    </div>
  );
};

export default ShopFloorMobileApp;
