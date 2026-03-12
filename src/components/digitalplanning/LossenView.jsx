import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, getDocs, setDoc, deleteDoc, orderBy, limit, writeBatch, arrayUnion, increment } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { Package,
    Loader2,
    ClipboardCheck,
    History,
    ArrowRight,
    X,
    Search,
    Clock,
    Trash2,
    ScanBarcode,
    Keyboard } from "lucide-react";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getNextFlowState } from "../../utils/workstationLogic";
import StatusBadge from "./common/StatusBadge";
import { getISOWeek } from "date-fns";
import { processLabelData, applyLabelLogic, getQRCodeUrl } from "../../utils/labelHelpers";

const PIXELS_PER_MM = 3.78;

const getMachineCode = (station) => {
  const map = { 'BH18': '418', 'BA07': '417' };
  return map[station] || (station || '').replace(/\D/g, '').padStart(3, '0') || '999';
};

const getLotPrefix = (station) => {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const ww = getISOWeek(now).toString().padStart(2, '0');
  const machineCode = getMachineCode(station);
  return `40${yy}${ww}${machineCode}40`;
};

const printViaWebUSB = async (printerData, zplContent) => {
  if (!navigator.usb) throw new Error("WebUSB wordt niet ondersteund.");
  let device;
  if (printerData?.vendorId && printerData?.productId) {
    const devices = await navigator.usb.getDevices();
    device = devices.find(d => d.vendorId === printerData.vendorId && d.productId === printerData.productId);
  }
  if (!device) {
    try {
      device = await navigator.usb.requestDevice({ filters: [] });
    } catch (err) {
      if (err.name === 'SecurityError' || err.name === 'NotFoundError') throw new Error("USB Toegang Geweigerd.");
      throw err;
    }
  }
  try {
    if (!device.opened) await device.open();
  } catch (err) {
    if (err.name === 'SecurityError' || err.message?.includes('Access denied'))
      throw new Error("Toegang geweigerd door Windows. WinUSB-driver vereist (via Zadig).");
    throw new Error(`Kan printer niet openen: ${err.message}`);
  }
  if (device.configuration === null) await device.selectConfiguration(1);
  try { await device.claimInterface(0); } catch (e) { console.warn("Interface claim warning:", e); }
  const encoder = new window.TextEncoder();
  const data = encoder.encode(zplContent);
  const interface0 = device.configuration.interfaces[0];
  const endpoint = interface0?.alternate?.endpoints.find(e => e.direction === "out");
  const endpointNumber = endpoint ? endpoint.endpointNumber : 1;
  await device.transferOut(endpointNumber, data);
  try { await device.close(); } catch (_) { /* ignore */ }
};

const QR_CODE_OK_CONFIRMATION = 'FPI-ACTION-APPROVE-OK';

// Helper voor diameter (simpel)
const getDiameter = (str) => {
  if (!str) return 0;
  const match = str.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 0;
};

/**
 * LossenView - Beheert de inkomende producten voor een specifiek werkstation.
 * Gefikst: BH31 naar Nabewerking flow hersteld door betere normalisatie.
 * Update: Gebruikt nu 'products' prop indien beschikbaar om dubbele fetching te voorkomen.
 */
const LossenView = ({ stationId, appId, products = [] }) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();
  const [items, setItems] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef(null);
  const selectedProductRef = useRef(null); // Ref om huidige selectie bij te houden tijdens async acties

  // Hub / Planning State
  const [activeView, setActiveView] = useState("incoming"); // 'incoming' | 'planning'
  const [planningOrders, setPlanningOrders] = useState([]);
  const [planningSearch, setPlanningSearch] = useState("");
  const [planningStationFilter, setPlanningStationFilter] = useState("ALL");
  const [showReservations, setShowReservations] = useState(false);

  // FIX: Declare missing state variables from an incomplete feature merge to prevent crash.
  const [reserveConfig, setReserveConfig] = useState(null);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [labelRules, setLabelRules] = useState([]);
  const [nextStartLot, setNextStartLot] = useState(null);
  const containerRef = useRef(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [simplePrintConfig, setShowSimplePrintModal] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [savedPrinters, setSavedPrinters] = useState([]);
  // END FIX

  const isCentralHub = normalizeMachine(stationId) === "LOSSEN";

  // Sync ref met state
  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  // Auto-focus logic voor scanner
  useEffect(() => {
    // Alleen auto-focus gebruiken als Scanner Modus AAN staat
    if (!scannerMode) return;

    const handleClick = (e) => {
        // Focus niet stelen als er op een interactief element wordt geklikt
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) return;
        
        // Alleen focussen in de inkomende view (waar gescand wordt)
        if (activeView === "incoming" && !showActionModal) {
            scanInputRef.current?.focus();
        }
    };
    
    // Focus bij laden
    if (activeView === "incoming") {
        scanInputRef.current?.focus();
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeView, showActionModal, scannerMode]);

  const handleScan = async (e) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim().toUpperCase();
      if (!code) return;

      // --- NIEUW: Goedkeuren met QR-code ---
      if (code === QR_CODE_OK_CONFIRMATION && selectedProduct) {
        // Direct input vrijmaken voor volgende scan
        setScanInput("");
        // Huidig product vastleggen voor verwerking
        const productToProcess = selectedProduct;

        if (isAdvancedStation) {
          // Geef product expliciet mee om race-conditions te voorkomen
          await handlePostProcessingFinish('completed', { note: 'Goedgekeurd via QR Scan' }, productToProcess);
        } else {
          // Voor Lossen: GEEN auto-release, want meting is verplicht.
          // De modal is al open door de lot-scan (zie hieronder), dus we doen hier niets.
          // Of we kunnen een melding geven:
          // alert("Voor Lossen is een meting verplicht. Vul dit in op het scherm.");
        }
        return;
      }
        
      const found = items.find(i => 
        (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
        (i.orderId || "").toLowerCase() === code.toLowerCase()
      );
        
      if (found) {
        handleItemClick(found); // Direct modal openen voor meting/actie
        setScanInput("");
      } else {
        alert(t('lossen.item_not_found', { code }) || `Item ${code} niet gevonden`);
        setScanInput("");
        setSelectedProduct(null);
      }
      // Na scan altijd weer focus op het scanveld
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
    }
  };

  // Haal occupancy data op voor operator tracking
  useEffect(() => {
    const unsub = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snap) => {
      setOccupancy(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  // Helper om te checken of een shift momenteel actief is
  const isShiftActive = (shiftLabel) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    const label = (shiftLabel || "").toUpperCase();
    
    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
      return currentTime >= 5 * 60 + 30 && currentTime < 14 * 60;
    }
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      return currentTime >= 14 * 60 && currentTime < 22 * 60 + 30;
    }
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      return currentTime >= 22 * 60 + 30 || currentTime < 5 * 60 + 30;
    }
    if (label.includes("DAG") || label === "DAGDIENST") {
      return currentTime >= 7 * 60 + 15 && currentTime < 16 * 60;
    }
    return true;
  };

  // Bereken actieve operators voor dit station
  const activeOperators = useMemo(() => {
    if (!stationId || occupancy.length === 0) return [];
    const currentStation = normalizeMachine(stationId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return occupancy.filter(occ => {
      const occStation = normalizeMachine(occ.station || occ.machineId || "");
      if (occStation !== currentStation) return false;
      const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
      occDate.setHours(0, 0, 0, 0);
      return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
    }).map(o => o.operatorNumber).filter(Boolean);
  }, [occupancy, stationId]);

  // Fetch planning data alleen als we in de Hub view zitten en op de planning tab
  useEffect(() => {
    if (isCentralHub && activeView === 'planning') {
        const q = query(collection(db, ...PATHS.PLANNING), orderBy("orderId", "desc"), limit(100));
        const unsub = onSnapshot(q, (snap) => {
            setPlanningOrders(snap.docs.map(d => ({id: d.id, ...d.data()})));
        });
        return () => unsub();
    }
  }, [isCentralHub, activeView]);

  useEffect(() => {
    if (!stationId) return;

    // Verwerkingslogica losgekoppeld zodat deze voor zowel prop als snapshot werkt
    const processData = (sourceData) => {
      const filtered = sourceData.filter((item) => {
        // Filter op currentStation die overeenkomt met dit werkstation
        // Fallback naar 'machine' (origin) als currentStation niet is gezet
        const itemStationNorm = normalizeMachine(item.currentStation || item.machine || "");
        const currentStationNorm = normalizeMachine(stationId);
        const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");
        const isBM01 = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || (currentStationNorm || "").toUpperCase().includes("BM01");
        const isMazak = cleanStationId === "MAZAK";
        const isNabewerking = cleanStationId === "NABEWERKING" || cleanStationId === "NABW" || cleanStationId.includes("NABEWERK");
        
        let isOurStation = itemStationNorm === currentStationNorm;

        // FIX: Als item op 'Lossen' staat, toon het ook op het station van herkomst (bv BH11)
        if (!isOurStation && (item.currentStep === "Lossen" || item.currentStep === "Wacht op Lossen" || normalizeMachine(item.currentStation) === "LOSSEN")) {
          const originNorm = normalizeMachine(item.originMachine || item.machine || "");
          if (originNorm === currentStationNorm) {
            // BH18 Logic: Only <= 300 stays local
            if (currentStationNorm === "BH18" || currentStationNorm === "18") {
                if (getDiameter(item.item || "") <= 300) isOurStation = true;
            } else {
                isOurStation = true;
            }
          }
        }

        // FIX: Flexibele matching voor Nabewerking (Nabewerking vs Nabewerken)
        if (isNabewerking) {
          const itemClean = (itemStationNorm || "").toUpperCase().replace(/\s/g, "");
          const stepClean = (item.currentStep || "").toUpperCase().replace(/\s/g, "");
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");

          if (itemClean === "NABEWERKING" || itemClean === "NABEWERKEN" || itemClean === "NABW" || itemClean.includes("NABEWERK") ||
              stepClean === "NABEWERKING" || stepClean === "NABEWERKEN" || stepClean.includes("NABEWERK") || 
              statusClean.includes("NABEWERK")) {
            isOurStation = true;
          }
        }

        // FIX: Flexibele matching voor Mazak
        if (isMazak) {
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");
          if (statusClean.includes("MAZAK")) isOurStation = true;
        }

        // FIX: Flexibele matching voor BM01
        if (isBM01) {
          const itemClean = (itemStationNorm || "").toUpperCase().replace(/\s/g, "");
          const stepClean = (item.currentStep || "").toUpperCase().replace(/\s/g, "");
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");
          if (itemClean === "BM01" || itemClean === "STATIONBM01" || itemClean.includes("BM01") ||
              stepClean === "EINDINSPECTIE" || stepClean === "INSPECTIE" || stepClean.includes("INSPECTIE") || stepClean === "BM01" ||
              statusClean.includes("BM01")) {
            isOurStation = true;
          }
        }

        // --- CENTRAAL LOSSEN LOGICA ---
        // Als we naar het station "LOSSEN" kijken, toon dan ook items van specifieke machines
        if (currentStationNorm === "LOSSEN") {
          const origin = normalizeMachine(item.machine || "");
          const originLabel = normalizeMachine(item.stationLabel || "");
          const current = normalizeMachine(item.currentStation || "");
          
          let targetMachines = ["BH31", "BH16", "BH11", "31", "16", "11"];
          let useStrictFilter = false;

          // Filter op toegewezen stations van de gebruiker (indien specifiek ingesteld)
          if (user && user.allowedStations && user.allowedStations.length > 0) {
             const userTargets = user.allowedStations
                .map(s => normalizeMachine(s))
                .filter(s => s !== "LOSSEN" && s !== "TEAMLEADER");
             
             if (userTargets.length > 0) {
                 targetMachines = userTargets;
                 useStrictFilter = true;
             }
          }

          if (targetMachines.includes(origin) || targetMachines.includes(originLabel) || targetMachines.includes(current)) {
             // BH18 restrictie: alleen > 300mm
             if (origin === "BH18" || originLabel === "BH18" || current === "BH18" || origin === "18") {
                 if (getDiameter(item.item || "") > 300) isOurStation = true;
             } else {
                 isOurStation = true;
             }
          } else if (!useStrictFilter && (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel) || current === "BH18")) {
             if (getDiameter(item.item || "") > 300) isOurStation = true;
          }
        }

        // Alleen items tonen die op "Lossen" stap staan
        const isLossenStep = item.currentStep === "Lossen" || item.currentStep === "Wacht op Lossen" || isBM01 || isMazak || isNabewerking;

        // Of items die status "in_progress" hebben en nog niet finished zijn
        // FIX: 'completed' toegestaan voor BM01/Mazak/Nabewerking omdat inkomende items deze status kunnen hebben van vorig station
        const isActive = (
          item.status === "in_progress" || 
          item.status === "Te Lossen" || 
          item.status === "Wacht op Lossen" || 
          item.status === "Te Nabewerken" || 
          item.status === "Te Keuren" || 
          ((isBM01 || isMazak || isNabewerking) && !["Finished", "GEREED"].includes(item.status))
        ) && item.currentStep !== "Finished" && item.status !== "rejected" && item.currentStep !== "REJECTED";

        return isOurStation && isLossenStep && isActive;
      });

      setItems(
        filtered.sort((a, b) => {
          const tA = a.updatedAt?.seconds || 0;
          const tB = b.updatedAt?.seconds || 0;
          return tA - tB; // FIFO: Oudste eerst voor correcte verwerkingsvolgorde
        })
      );

      setLoading(false);
    };

    // OPTIMALISATIE: Gebruik meegegeven data indien beschikbaar
    if (products) {
      processData(products);
      return;
    }

    // FALLBACK: Zelf fetchen als geen data is meegegeven
    setLoading(true);
    const productsRef = collection(db, ...PATHS.TRACKING);

    const unsubscribe = onSnapshot(
      productsRef,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        processData(docs);
      },
      (err) => {
        console.error("Lossen fout:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [stationId, appId, products, user]);

  const currentStationNorm = normalizeMachine(stationId);
  const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");
  const isBM01 = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || (currentStationNorm || "").toUpperCase().includes("BM01");
  const isMazak = cleanStationId === "MAZAK";
  const isNabewerking = cleanStationId === "NABEWERKING" || cleanStationId === "NABW" || cleanStationId.includes("NABEWERK");
  
  // Bepaal of we de geavanceerde modal (met afkeur opties) moeten gebruiken
  const isAdvancedStation = isNabewerking || isMazak || isBM01;

  const handleItemClick = (item) => {
    setSelectedProduct(item); // Selecteer het item
    setShowActionModal(true); // Open de modal voor handmatige actie
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setShowActionModal(false);
  };

  const handlePostProcessingFinish = async (status, data, productOverride = null) => {
    const product = productOverride || selectedProduct;
    if (!product) return;
    
    try {
      const productRef = doc(db, ...PATHS.TRACKING, product.id || product.lotNumber);
      
      const updates = {
        updatedAt: serverTimestamp(),
        note: data.note || "",
        processedBy: user?.email || "Unknown",
        history: arrayUnion({
          action: status === "completed" ? "Stap Voltooid" : (status === "temp_reject" ? "Tijdelijke Afkeur" : "Definitieve Afkeur"),
          timestamp: new Date().toISOString(),
          user: user?.email || "Operator",
          station: stationId,
          details: status === "completed" ? "Verwerking afgerond" : `Reden: ${data.reasons?.join(", ")}`
        })
      };

      // Voeg operators toe aan tracking
      if (activeOperators.length > 0) {
        updates[`personnelTracking.${stationId}`] = activeOperators;
      }

      if (status === "completed") {
        if (isBM01) {
          const flowState = getNextFlowState('FINISH_INSPECTION');
          updates.currentStation = flowState.currentStation || "GEREED";
          updates.currentStep = flowState.currentStep || "Finished";
          updates.status = flowState.status || "completed";
          updates["timestamps.finished"] = serverTimestamp();
          updates.lastStation = "BM01";

          // ARCHIVERING LOGICA
          const year = new Date().getFullYear();
          const archiveRef = doc(db, "future-factory", "production", "archive", String(year), "items", product.id || product.lotNumber);
          
          const finalData = { 
              ...product, 
              ...updates,
              updatedAt: new Date(),
              timestamps: {
                  ...product.timestamps,
                  finished: new Date()
              }
          };

          await setDoc(archiveRef, finalData);
          await deleteDoc(productRef);

          // Update Planning Order
          if (product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
              try {
                  const planningRef = collection(db, ...PATHS.PLANNING);
                  const q = query(planningRef, where("orderId", "==", product.orderId));
                  const snap = await getDocs(q);
                  if (!snap.empty) {
                      const orderDoc = snap.docs[0];
                      const newProduced = (orderDoc.data().produced || 0) + 1;
                      const plan = orderDoc.data().plan || 0;
                      const orderUpdates = {
                          produced: increment(1),
                          lastUpdated: serverTimestamp()
                      };
                      if (newProduced >= plan) orderUpdates.status = "completed";
                      await updateDoc(orderDoc.ref, orderUpdates);
                  }
              } catch (e) { console.error(e); }
          }

          // Alleen afsluiten als we niet alweer een nieuw product hebben gescand
          if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
             handleCloseModal();
          }
          return;
        } else {
          const flowState = getNextFlowState('FINISH_PROCESSING');
          updates.currentStation = flowState.currentStation || "BM01";
          updates.currentStep = flowState.currentStep || "Eindinspectie";
          updates.status = flowState.status || "Te Keuren";
          updates.lastStation = stationId;
          updates["timestamps.bm01_start"] = serverTimestamp();

          // --- FIX: Update Order Status for non-BM01 stations ---
          // Zorgt ervoor dat orders automatisch sluiten als alle items de machine hebben verlaten
          if (product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
              try {
                  const planningRef = collection(db, ...PATHS.PLANNING);
                  const q = query(planningRef, where("orderId", "==", product.orderId));
                  const snap = await getDocs(q);
                  if (!snap.empty) {
                      const orderDoc = snap.docs[0];
                      const orderData = orderDoc.data();
                      
                      // Gebruik produced teller voor robuustheid (zoals in BM01)
                      // Dit zorgt ervoor dat de order uit de actieve lijst verdwijnt (produced >= plan)
                      const currentProduced = (orderData.produced || 0);
                      const newProduced = currentProduced + 1;
                      const plan = parseInt(orderData.plan || orderData.quantity || 0);
                      
                      const orderUpdates = {
                          produced: increment(1),
                          lastUpdated: serverTimestamp()
                      };

                      if (newProduced >= plan) {
                          orderUpdates.status = "completed";
                      }
                      
                      await updateDoc(orderDoc.ref, orderUpdates);
                  }
              } catch (e) { console.error("Error updating order status:", e); }
          }
        }
      } else if (status === "temp_reject") {
        updates.inspection = {
          status: "Tijdelijke afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
        updates.currentStep = "HOLD_AREA";
      } else if (status === "rejected") {
        updates.status = "rejected";
        updates.currentStep = "REJECTED";
        updates.currentStation = "AFKEUR";
        updates.inspection = {
          status: "Afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
        
        // Update order teller bij definitieve afkeur
        if (product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
             try {
                const orderQuery = query(
                  collection(db, ...PATHS.PLANNING),
                  where("orderId", "==", product.orderId)
                );
                const orderSnap = await getDocs(orderQuery);
                
                if (!orderSnap.empty) {
                  const orderDoc = orderSnap.docs[0];
                  const orderData = orderDoc.data();
                  const originStation = product.originMachine || product.currentStation;
                  const stationField = `started_${originStation.replace(/[^a-zA-Z0-9]/g, '_')}`;
                  const currentStarted = orderData[stationField] || 0;
                  
                  if (currentStarted > 0) {
                    await updateDoc(doc(db, ...PATHS.PLANNING, orderDoc.id), {
                      [stationField]: currentStarted - 1,
                    });
                  }
                }
              } catch (err) {
                console.error("Fout bij updaten order teller:", err);
              }
        }
      }

      await updateDoc(productRef, updates);
      // Check of selectie nog steeds hetzelfde is voordat we afsluiten
      if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
          handleCloseModal();
      }
    } catch (error) {
      console.error("Fout bij afronden:", error);
    }
  };

  const handleSimpleRelease = async (productOverride = null) => {
    const product = productOverride || selectedProduct;
    if (!product) return;
    
    try {
        const productRef = doc(db, ...PATHS.TRACKING, product.id || product.lotNumber);
        
        const flowState = getNextFlowState('FINISH_UNLOADING');

        const updates = {
            currentStep: flowState.currentStep || "Nabewerking",
            status: flowState.status || "Te Nabewerken",
            currentStation: flowState.currentStation || "Nabewerking",
            updatedAt: serverTimestamp(),
            "timestamps.nabewerking_start": serverTimestamp(),
            history: arrayUnion({
                action: "Product Gelost",
                timestamp: new Date().toISOString(),
                user: user?.email || "Operator",
                station: stationId,
                details: "Goedgekeurd via QR Scan"
            })
        };

        if (product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
            const planningRef = collection(db, ...PATHS.PLANNING);
            const q = query(planningRef, where("orderId", "==", product.orderId));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const orderDoc = snap.docs[0];
                const newProduced = (orderDoc.data().produced || 0) + 1;
                const plan = orderDoc.data().plan || 0;
                const orderUpdates = {
                    produced: increment(1),
                    lastUpdated: serverTimestamp()
                };
                if (newProduced >= plan) orderUpdates.status = "completed";
                await updateDoc(orderDoc.ref, orderUpdates);
            }
        }

        await updateDoc(productRef, updates);
        if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
            handleCloseModal();
        }
    } catch (error) {
        console.error("Fout bij simple release:", error);
        alert("Kon product niet verwerken: " + error.message);
    }
  };

  // Filter orders voor planning view
  const filteredOrders = useMemo(() => {
      let result = planningOrders;

      if (planningStationFilter !== "ALL") {
          result = result.filter(o => o.machine === planningStationFilter);
      }

      if (planningSearch) {
          const lower = planningSearch.toLowerCase();
          result = result.filter(o => 
              (o.orderId || "").toLowerCase().includes(lower) || 
              (o.item || "").toLowerCase().includes(lower)
          );
      }
      return result;
  }, [planningOrders, planningSearch, planningStationFilter]);

  const uniqueStations = useMemo(() => {
      const stations = new Set(planningOrders.map(o => o.machine).filter(Boolean));
      return Array.from(stations).sort();
  }, [planningOrders]);

  // Filter gereserveerde items uit de products prop
  const reservedItems = useMemo(() => {
      // Check welke lotnummers al 'echt' in productie zijn (status != reserved)
      const activeLots = new Set(products.filter(p => p.status !== "reserved").map(p => p.lotNumber));

      return products
        .filter(p => p.status === "reserved" && !activeLots.has(p.lotNumber)) // Verberg als lotnummer al actief is
        .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [products]);

  // Automatische cleanup van verlopen reserveringen (> 24 uur)
  useEffect(() => {
    if (!isCentralHub || reservedItems.length === 0) return;

    const cleanupExpired = async () => {
        const now = new Date();
        const batch = writeBatch(db);
        let deleteCount = 0;

        reservedItems.forEach(item => {
            let expiryDate = item.expiresAt ? (item.expiresAt.toDate ? item.expiresAt.toDate() : new Date(item.expiresAt)) : null;
            
            // Fallback: als expiresAt mist, gebruik createdAt + 24u
            if (!expiryDate && item.createdAt) {
                const created = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
                expiryDate = new Date(created.getTime() + 24 * 60 * 60 * 1000);
            }

            if (expiryDate && expiryDate < now) {
                const ref = doc(db, ...PATHS.TRACKING, item.id || item.lotNumber);
                batch.delete(ref);
                deleteCount++;
            }
        });

        if (deleteCount > 0) {
            await batch.commit().catch(err => console.error("Cleanup error:", err));
        }
    };

    cleanupExpired();
  }, [reservedItems, isCentralHub]);

  // Fetch Labels voor Reserve Modal
  useEffect(() => {
    if (!reserveConfig) return;
    const fetchLabels = async () => {
        try {
            const labelsRef = collection(db, "future-factory", "settings", "label_templates");
            const snap = await getDocs(labelsRef);
            const labels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAvailableLabels(labels);
            if (labels.length > 0) {
                 // Kies standaard een smal label of de eerste
                 const defaultLabel = labels.find(l => l.name?.toLowerCase().includes("smal") || l.height < 50) || labels[0];
                 setSelectedLabelId(defaultLabel.id);
            }
        } catch (e) {
            console.error("Labels fetch error", e);
        }

        try {
            const rulesRef = collection(db, "future-factory", "settings", "label_logic");
            const snap = await getDocs(rulesRef);
            setLabelRules(snap.docs.map(d => d.data()));
        } catch (e) {
            console.error("Rules fetch error", e);
        }
    };
    fetchLabels();
  }, [reserveConfig]);

  // Haal het eerstvolgende beschikbare lotnummer op zodra de modal opent
  useEffect(() => {
    if (!reserveConfig || !reserveConfig.station) {
        setNextStartLot(null);
        return;
    }
    
    const fetchNextLot = async () => {
        try {
            const prefix = getLotPrefix(reserveConfig.station);
            const trackRef = collection(db, ...PATHS.TRACKING);
            const q = query(
                trackRef, 
                where("lotNumber", ">=", prefix),
                where("lotNumber", "<=", prefix + "\uf8ff"),
                orderBy("lotNumber", "desc"), 
                limit(1)
            );
            const snap = await getDocs(q);
            
            let nextSeq = 1;

            if (!snap.empty) {
                const lastLot = snap.docs[0].data().lotNumber;
                const lastSeqStr = lastLot.slice(-4);
                const lastSeq = parseInt(lastSeqStr, 10);
                if (!isNaN(lastSeq)) {
                    nextSeq = lastSeq + 1;
                }
            }
            
            const nextLotNumber = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
            setNextStartLot(nextLotNumber);
        } catch (e) {
            console.error("Error fetching next lot", e);
        }
    };
    fetchNextLot();
  }, [reserveConfig]);

  const selectedLabel = useMemo(() => availableLabels.find(l => l.id === selectedLabelId), [availableLabels, selectedLabelId]);

  const previewData = useMemo(() => {
    if (!reserveConfig?.order) return {};
    // Gebruik processLabelData voor volledige verrijking (diameter, pn, type, etc.)
    const baseData = processLabelData({
        ...reserveConfig.order,
        orderNumber: reserveConfig.order.orderId,
        productId: reserveConfig.order.itemCode || "",
        description: reserveConfig.order.item,
        // Toon het echte volgende nummer in de preview, of een placeholder als nog aan het laden
        lotNumber: nextStartLot || "Laden..."
    });

    return applyLabelLogic(baseData, labelRules);
  }, [reserveConfig, nextStartLot, labelRules]);

  useEffect(() => {
    if (containerRef.current && selectedLabel) {
        const containerW = containerRef.current.clientWidth;
        const labelW = selectedLabel.width * PIXELS_PER_MM;
        setPreviewZoom(Math.min(1, (containerW - 40) / labelW));
    }
  }, [selectedLabel, reserveConfig]);

  const handleSimplePrint = async () => {
      const { machine, date, startSeq, count, printerIp, mode, showCutLine } = simplePrintConfig;
      if (!date) return;
      const dateObj = new Date(date);
      const year = dateObj.getFullYear().toString().slice(-2);
      const week = getISOWeek(dateObj).toString().padStart(2, '0');
      const machineCode = getMachineCode(machine);
      const prefix = `40${year}${week}${machineCode}`;

      // Printer instellingen ophalen
      const selectedPrinter = savedPrinters.find(p => p.ip === printerIp);
      const dpi = selectedPrinter?.dpi ? parseInt(selectedPrinter.dpi) : 203;
      const darkness = selectedPrinter?.darkness ? parseInt(selectedPrinter.darkness) : 15;
      const scale = dpi / 203;

      // Schalen van coördinaten en groottes op basis van DPI
      const xQr = Math.round(10 * scale);
      const yQr = Math.round(10 * scale);
      const qrMag = Math.max(2, Math.round(2 * scale));
      const xText = Math.round(100 * scale);
      const yText = Math.round(20 * scale);
      const fontSize = Math.round(30 * scale);
      
      let zpl = "";
      
      // Helper voor browser print
      const printViaBrowser = () => {
          const printWindow = window.open('', '_blank');
          if (!printWindow) {
              alert(t('lossen.popup_blocked'));
              return;
          }

          let html = `<html><head><title>Labels Printen</title><style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .label { 
                        width: 300px; height: 120px; 
                        border-bottom: ${showCutLine ? '1px dashed #000' : 'none'};
                        margin-bottom: 10px; display: flex; align-items: center; padding: 10px;
                        page-break-inside: avoid;
                    }
                    .qr { width: 40px; height: 40px; margin-right: 15px; }
                    .text { font-size: 20px; font-weight: bold; }
                    @media print {
                        .label { border-bottom: ${showCutLine ? '1px dashed #000' : 'none'}; page-break-after: auto; margin: 0; }
                        body { padding: 0; margin: 0; }
                    }
                </style></head><body>`;

          for (let i = 0; i < count; i++) {
              const seq = (startSeq + i).toString().padStart(4, '0');
              const lot = `${prefix}${seq}`;
              html += `<div class="label"><img src="${getQRCodeUrl(lot)}" class="qr" /><div class="text">${lot}</div></div>`;
          }

          html += `<script>window.onload = () => { setTimeout(() => { window.print(); }, 800); };</script></body></html>`;

          printWindow.document.write(html);
          printWindow.document.close();
          setShowSimplePrintModal(false);
      };

      for (let i = 0; i < count; i++) {
          const seq = (startSeq + i).toString().padStart(4, '0');
          const lot = `${prefix}${seq}`;
          
          zpl += `^XA
~SD${darkness}
^FO${xQr},${yQr}^BQN,2,${qrMag}^FDQA,${lot}^FS
^FO${xText},${yText}^A0N,${fontSize},${fontSize}^FD${lot}^FS
^XZ
`;
      }

      // MODE: STANDAARD (Browser Print - PDF/Systeem Dialoog)
      if (mode === "standard") {
          printViaBrowser();
          return;
      }

      // MODE: NETWERK (IP)
        if (mode === "network") {
          if (!printerIp) {
              alert(t('lossen.select_printer_error'));
              return;
          }

          const protocol = (selectedPrinter?.protocol || "zpl").toLowerCase();
          if (protocol !== "zpl") {
            alert(`Netwerkprinten ondersteunt momenteel alleen ZPL (geselecteerd: ${protocol.toUpperCase()}).`);
            return;
          }
          try {
              await fetch(`http://${printerIp}/pstprnt`, { method: "POST", body: zpl, mode: "no-cors" });
              alert(`Opdracht verzonden naar Netwerk Printer (${printerIp})`);
          } catch (err) {
              alert(t('lossen.print_error') + err.message);
          }
      }

            if (mode === "usb") {
              const usbPrinter = savedPrinters.find(p => p.id === simplePrintConfig.printerId) || savedPrinters.find(p => p.type !== "network");
              try {
                await printViaWebUSB(usbPrinter || {}, zpl);
                alert(`USB-opdracht verzonden${usbPrinter?.name ? ` naar ${usbPrinter.name}` : ""}`);
              } catch (err) {
                if (err.message.includes("Toegang geweigerd door Windows") || err.message.toLowerCase().includes("access denied")) {
                  if (window.confirm("USB Toegang Geweigerd: Windows beheert deze printer al.\n\nWil je in plaats daarvan via de browser (PDF) printen?")) {
                    printViaBrowser();
                  }
                } else if (err.message.toLowerCase().includes("no device selected")) {
                  alert("Geen printer geselecteerd in de browser pop-up. Probeer het opnieuw en selecteer een printer.");
                } else {
                  alert(`USB direct print mislukt: ${err.message}`);
                }
              }
            }
      
      setShowSimplePrintModal(false);
  };

  const handleReserveConfirm = async () => {
      if (!reserveConfig || !reserveConfig.order) return;
      setGenerating(true);
      try {
          // 1. Bepaal start lotnummer (volledige string)
          let startLotFull = nextStartLot;
          const prefix = getLotPrefix(reserveConfig.station);
          
          // Fallback als nextStartLot nog niet geladen is
          if (!startLotFull) {
              const trackRef = collection(db, ...PATHS.TRACKING);
              const q = query(
                  trackRef, 
                  where("lotNumber", ">=", prefix),
                  where("lotNumber", "<=", prefix + "\uf8ff"),
                  orderBy("lotNumber", "desc"), 
                  limit(1)
              );
              const snap = await getDocs(q);
              
              let nextSeq = 1;
              
              if (!snap.empty) {
                  const lastLot = snap.docs[0].data().lotNumber;
                  const lastSeqStr = lastLot.slice(-4);
                  const lastSeq = parseInt(lastSeqStr, 10);
                  if (!isNaN(lastSeq)) {
                      nextSeq = lastSeq + 1;
                  }
              }
              startLotFull = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
          }

          // 2. Batch aanmaken
          const batch = writeBatch(db);
          const newLots = [];
          
          // Parse sequence from startLotFull
          let currentSeq = parseInt(startLotFull.slice(-4), 10);

          for (let i = 0; i < reserveConfig.count; i++) {
              const nextLot = `${prefix}${(currentSeq + i).toString().padStart(4, '0')}`;
              
              // Construct Document ID consistent with started products (OrderId_ItemCode_LotNumber)
              const cleanOrderId = String(reserveConfig.order.orderId || "UNKNOWN").trim();
              const cleanItemCode = String(reserveConfig.order.itemCode || reserveConfig.order.productId || "UNKNOWN").trim();
              const docId = `${cleanOrderId}_${cleanItemCode}_${nextLot}`.replace(/[^a-zA-Z0-9]/g, "_");

              const docRef = doc(db, ...PATHS.TRACKING, docId);
              
              const expiresAt = new Date();
              expiresAt.setHours(expiresAt.getHours() + 24); // 24 uur geldig

              const payload = {
                  id: docId,
                  lotNumber: nextLot,
                  orderId: reserveConfig.order.orderId || "UNKNOWN",
                  itemCode: cleanItemCode,
                  item: reserveConfig.order.item || "",
                  status: "reserved",
                  targetStation: reserveConfig.station || "Onbekend",
                  createdAt: serverTimestamp(),
                  reservedAt: serverTimestamp(),
                  expiresAt: expiresAt,
                  isReservation: true,
                  note: "Vooraf geprint label"
              };

              batch.set(docRef, payload);
              newLots.push(nextLot);
          }

          await batch.commit();
          alert(t('lossen.reservation_success', { count: newLots.length, lots: newLots.join(", ") }));
          setReserveConfig(null);
          setNextStartLot(null); // Forceer refresh bij volgende keer openen
      } catch (err) {
          console.error("Fout bij reserveren:", err);
          alert(t('lossen.reservation_error') + err.message);
      } finally {
          setGenerating(false);
      }
  };

  const handleDeleteReservation = async (item) => {
      if(!window.confirm(t('lossen.confirm_release', { lot: item.lotNumber }))) return;
      try {
          await deleteDoc(doc(db, ...PATHS.TRACKING, item.id || item.lotNumber));
      } catch(err) {
          console.error(err);
          alert("Fout bij vrijgeven: " + err.message);
      }
  };

  if (loading)
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );

  return (
    <div className="p-4 space-y-3 bg-white h-full overflow-y-auto custom-scrollbar text-left relative">
      
      {/* Pulse animatie stylesheet */}
      <style>{`
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
        }
        .scan-pulse {
          animation: scan-pulse 2s infinite;
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-text {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* HUB TABS (Alleen zichtbaar op LOSSEN station) */}
      {isCentralHub && (
        <div className="flex bg-slate-100 p-1 rounded-xl mb-4 shrink-0">
            <button onClick={() => setActiveView("incoming")} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeView === "incoming" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"}`}>
                {t('lossen.incoming')}
            </button>
            <button onClick={() => setActiveView("planning")} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeView === "planning" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400"}`}>
                {t('lossen.planning_labels')}
            </button>
        </div>
      )}

      {showActionModal && selectedProduct && (
        isAdvancedStation ? (
          <PostProcessingFinishModal
            product={selectedProduct}
            onClose={handleCloseModal}
            onConfirm={handlePostProcessingFinish}
            currentStation={stationId}
            autoFocus={!scannerMode}
          />
        ) : (
          <ProductReleaseModal
            isOpen={true}
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            appId={appId}
            activeOperators={activeOperators}
            autoFocus={false}
          />
        )
      )}

      {/* VIEW SWITCHER LOGIC */}
      {activeView === "planning" ? (
        <div className="space-y-6">
            {/* Zoekbalk & Filter */}
            <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder={t('lossen.search_order')}
                        value={planningSearch}
                        onChange={(e) => setPlanningSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-emerald-500 transition-all"
                    />
                </div>
                <select
                    value={planningStationFilter}
                    onChange={(e) => setPlanningStationFilter(e.target.value)}
                    className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-emerald-500 transition-all min-w-[150px]"
                >
                    <option value="ALL">{t('lossen.all_stations')}</option>
                    {/* uniqueStations is not defined in this scope, using fallback */}
                    <option value="BH11">BH11</option>
                    <option value="BH12">BH12</option>
                    <option value="BH16">BH16</option>
                    <option value="BH18">BH18</option>
                </select>
                <button
                    onClick={() => setShowReservations(!showReservations)}
                    className={`px-4 py-3 rounded-2xl font-bold text-sm transition-all border-2 whitespace-nowrap ${showReservations ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                >
                    {showReservations ? t('lossen.hide_reservations') : t('lossen.show_reservations')}
                </button>
            </div>

            {/* Gereserveerde Items Sectie */}
            {showReservations && reservedItems.length > 0 && (
                <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-4">
                    <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Clock size={12} /> {t('lossen.reserved_labels_title')} ({reservedItems.length})
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        {reservedItems.map(item => (
                            <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-orange-100 shadow-sm">
                                <div>
                                    <span className="font-mono font-bold text-xs text-slate-700">{item.lotNumber}</span>
                                    <span className="text-[9px] text-slate-400 ml-2">{item.targetStation}</span>
                                </div>
                                <button onClick={() => handleDeleteReservation(item)} className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-md transition-colors" title="Vrijgeven">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Order Lijst */}
            <div className="space-y-3">
                {/* filteredOrders is not defined in this scope, using planningOrders with filter */}
                {planningOrders.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic text-xs">{t('bm01.no_orders')}</div>
                ) : (
                    planningOrders
                    .filter(o => planningStationFilter === "ALL" || o.machine === planningStationFilter)
                    .filter(o => !planningSearch || (o.orderId || "").toLowerCase().includes(planningSearch.toLowerCase()))
                    .map(order => (
                        <div key={order.id} className="bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-emerald-200 transition-all group">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="font-black text-slate-800">{order.orderId}</h4>
                                    <p className="text-xs text-slate-500 line-clamp-1">{order.item}</p>
                                    <div className="mt-1"><StatusBadge status={order.status} /></div>
                                </div>
                                <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-500">{order.plan} st</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      ) : (
        /* INKOMEND VIEW (Bestaande functionaliteit) */
        <>
          <div className="mb-6 space-y-2">
            <div className="flex justify-between items-end">
                {/* Scan Indicator Label */}
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 w-fit">
                <div className="w-2 h-2 bg-blue-500 rounded-full pulse-text"></div>
                <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                    🔍 {t('lossen.ready_to_scan', 'Klaar voor scan')}
                </span>
                </div>

                {/* Scanner Mode Toggle */}
                <button 
                    onClick={() => setScannerMode(!scannerMode)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-xs uppercase tracking-widest transition-all ${scannerMode ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-400'}`}
                    title={scannerMode ? "Toetsenbord verborgen (Scanner Modus)" : "Normale invoer"}
                >
                    {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
                    {scannerMode ? "Scanner Modus" : "Toetsenbord"}
                </button>
            </div>
            {/* Scan Input Field */}
            <div className="relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 transition-all scan-pulse" size={24} />
              <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  inputMode={scannerMode ? "none" : "text"}
                  onKeyDown={handleScan}
                  placeholder="Scan lotnummer of order..."
                  className="w-full pl-14 pr-4 py-4 bg-white border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
              />
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 opacity-40">
              <Package size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {t('lossen.no_incoming_items', { station: stationId })}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4 ml-2">
                <ArrowRight size={16} className="text-emerald-500" />
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {isBM01 || isMazak || isNabewerking ? t('bm01.to_offer') : (currentStationNorm === "LOSSEN" ? t('lossen.wait_for_unload') : t('lossen.waiting_receipt'))} ({items.length})
                </h3>
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`bg-white border-2 rounded-[35px] p-6 shadow-sm hover:border-emerald-300 transition-all group animate-in slide-in-from-bottom-2 cursor-pointer
                    ${selectedProduct?.id === item.id ? 'border-purple-400 ring-4 ring-purple-200' : 'border-slate-100'}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="text-left">
                      <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                        {t('lossen.lot_number')}
                      </span>
                      <span className="font-black text-slate-900 text-lg tracking-tighter italic">
                        {item.lotNumber}
                      </span>
                      <p className="text-xs font-bold text-slate-600 mt-1">
                        {item.item}
                      </p>
                    </div>
                    <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase">
                      {t('lossen.received')}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 mb-5 border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      {t('lossen.manufactured_item')}
                    </p>
                    <p className="text-xs font-mono font-bold text-slate-700 truncate">
                      {item.itemCode}
                    </p>
                    {item.lastStation && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 opacity-80">
                        <History size={10} className="text-blue-500" />
                        <span className="text-[8px] font-black text-slate-500 uppercase italic">
                          {isBM01 ? t('lossen.from') + ": " : t('lossen.origin') + ": "}{item.lastStation}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleItemClick(item)}
                    className="w-full py-5 bg-slate-900 text-white rounded-[22px] font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-emerald-600 transition-all shadow-lg active:scale-95"
                  >
                    <ClipboardCheck size={18} /> {t('lossen.process_release')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LossenView;
