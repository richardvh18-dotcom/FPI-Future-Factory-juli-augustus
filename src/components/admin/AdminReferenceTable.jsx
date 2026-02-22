import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, isValidPath } from "../../config/dbPaths";
import {
  Search,
  Loader2,
  Ruler,
  Table,
  Settings2,
  Database,
  ShieldCheck,
  Activity,
  Info,
} from "lucide-react";


// Simple List implementation to replace react-window and avoid import issues
const List = ({ height, width, itemCount, itemSize, children: Row, itemData }) => {
  return (
    <div style={{ height, width, overflowY: 'auto', overflowX: 'hidden' }}>
      {Array.from({ length: itemCount }).map((_, index) => (
        <div key={index} style={{ height: itemSize, width: '100%' }}>
          <Row index={index} style={{ height: '100%', width: '100%' }} data={itemData} />
        </div>
      ))}
    </div>
  );
};

// Simple AutoSizer implementation to avoid external dependency issues
const AutoSizer = ({ children }) => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setSize({ width, height });
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      {size.width > 0 && size.height > 0 && (
        typeof children === "function"
          ? children(size)
          : <div style={{color: 'red', fontWeight: 'bold'}}>AutoSizer: children moet een functie zijn die ({'{ height, width }'}) accepteert.</div>
      )}
    </div>
  );
};

/**
 * AdminReferenceTable V4.0 - Root Sync Edition
 * Toont een read-only overzicht van de technische stamdata uit de root.
 * Handig voor snelle verificatie van mof-maten, boringen en fitting specs.
 */
const AdminReferenceTable = () => {
  const [activeTab, setActiveTab] = useState("FITTING_SPECS");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);

  // Configuratie van de tabs gekoppeld aan dbPaths.js keys
  const TABS = [
    {
      id: "FITTING_SPECS",
      label: "Fitting Specs",
      icon: <Ruler size={14} />,
      desc: "Basis afmetingen & gewichten",
    },
    {
      id: "BORE_DIMENSIONS",
      label: "Boringen",
      icon: <Table size={14} />,
      desc: "PCD & Boutpatronen",
    },
    {
      id: "CB_DIMENSIONS",
      label: "CB Mof Data",
      icon: <Settings2 size={14} />,
      desc: "Lijmverbinding maten",
    },
    {
      id: "TB_DIMENSIONS",
      label: "TB Mof Data",
      icon: <Settings2 size={14} />,
      desc: "Draadverbinding maten",
    },
  ];

  // 1. Realtime Sync met de geselecteerde collectie in de root
  useEffect(() => {
    if (!isValidPath(activeTab)) {
      console.error("❌ Invalid tab path:", activeTab);
      setError(`Path ${activeTab} is not valid`);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const colRef = collection(db, ...PATHS[activeTab]);
      console.log("📂 Loading from path:", PATHS[activeTab].join("/"));

      const unsubscribe = onSnapshot(
        query(colRef),
        (snapshot) => {
          const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          console.log(`✅ Loaded ${docs.length} items from ${activeTab}`);

          // Sortering op diameter (ID) of DN
          docs.sort((a, b) => {
            const valA = Number(a.diameter || a.dn || a.ID || 0);
            const valB = Number(b.diameter || b.dn || b.ID || 0);
            return valA - valB;
          });

          setData(docs);
          setLoading(false);
        },
        (err) => {
          console.error(`❌ Error loading ${activeTab}:`, err.code, err.message);
          // FIX: Voorkom foutmelding bij uitloggen
          if (err.code === 'permission-denied') return;
          setError(`Error: ${err.message}`);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error("❌ Setup error:", err);
      setError(err.message);
      setLoading(false);
    }
  }, [activeTab]);

  // 2. Client-side Search Filter
  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return data;

    return data.filter((item) =>
      Object.values(item).some((val) =>
        String(val).toLowerCase().includes(term)
      )
    );
  }, [data, searchTerm]);

  // Grid Template configuratie per tab
  const gridTemplate = useMemo(() => {
    switch (activeTab) {
      case "FITTING_SPECS": return "1.2fr 0.8fr 1fr 1fr 1fr 1fr 1fr";
      case "BORE_DIMENSIONS": return "2fr 1fr 1fr 1fr 1fr";
      case "CB_DIMENSIONS": return "1.5fr 1fr 0.8fr 1fr 1fr 1fr";
      case "TB_DIMENSIONS": return "1.5fr 1fr 1fr 1fr 1fr 1fr";
      default: return "1fr";
    }
  }, [activeTab]);

  // Virtualized Row Component
  const Row = ({ index, style, data }) => {
    const { items, activeTab, gridTemplate } = data;
    const item = items[index];
    const tdStyle = "px-6 py-0 text-sm font-bold text-slate-700 flex items-center truncate h-full";

    return (
      <div style={{ ...style, display: 'grid', gridTemplateColumns: gridTemplate }} className="border-b border-slate-50 hover:bg-blue-50/30 transition-all group">
        {activeTab === "FITTING_SPECS" && (
          <>
            <div className={tdStyle}><span className="text-blue-600 font-black italic">ID {item.diameter || item.dn}</span></div>
            <div className={tdStyle}>PN {item.pressure || item.pn}</div>
            <div className={`${tdStyle} font-mono`}>{item.TW || "-"}</div>
            <div className={`${tdStyle} font-mono`}>{item.Lo || "-"}</div>
            <div className={`${tdStyle} font-mono`}>{item.Lnom || "-"}</div>
            <div className={`${tdStyle} font-mono`}>{item.R || "-"}</div>
            <div className={tdStyle}><span className="bg-slate-100 px-2 py-1 rounded-lg text-slate-500 font-black">{item.Weight || "-"} kg</span></div>
          </>
        )}

        {activeTab === "BORE_DIMENSIONS" && (
          <>
            <div className={tdStyle}>
              <div className="flex flex-col justify-center">
                <span className="font-black text-slate-900">ID {item.dn}</span>
                <span className="text-[9px] text-slate-400 uppercase font-black">PN {item.pn}</span>
              </div>
            </div>
            <div className={tdStyle}><span className="text-blue-600 font-black">{item.pcd} mm</span></div>
            <div className={tdStyle}>{item.holes}</div>
            <div className={tdStyle}>
              <span className="bg-slate-900 text-white px-2 py-1 rounded text-[10px] font-black uppercase">{item.thread || item.boltSize}</span>
            </div>
            <div className={tdStyle}>{item.holeSize || "-"} mm</div>
          </>
        )}

        {activeTab === "CB_DIMENSIONS" && (
          <>
            <div className={`${tdStyle} font-mono text-xs opacity-40`}>{item.id}</div>
            <div className={tdStyle}><span className="font-black">DN {item.diameter || item.dn}</span></div>
            <div className={tdStyle}>
              <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded uppercase">CB</span>
            </div>
            <div className={tdStyle}>{item.B1 || item.InsertionDepth || "-"}</div>
            <div className={tdStyle}>{item.B2 || "-"}</div>
            <div className={tdStyle}>{item.BD || item.bellOD || "-"}</div>
          </>
        )}

        {activeTab === "TB_DIMENSIONS" && (
          <>
            <div className={`${tdStyle} font-mono text-xs opacity-40`}>{item.id}</div>
            <div className={tdStyle}><span className="font-black">DN {item.diameter || item.dn}</span></div>
            <div className={tdStyle}>{item.B1 || "-"}</div>
            <div className={tdStyle}>{item.B2 || "-"}</div>
            <div className={tdStyle}>{item.BA || "-"}</div>
            <div className={tdStyle}>{item.W || "-"}</div>
          </>
        )}
      </div>
    );
  };

  // Header Style
  const thStyle = "px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center";

  return (
    <div className="space-y-8 animate-in fade-in duration-500 text-left">
      {/* ERROR DISPLAY */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 p-6 rounded-[24px] flex items-start gap-4">
          <Activity className="text-red-600 flex-shrink-0 mt-1" size={20} />
          <div>
            <h4 className="font-black text-red-700 uppercase">Fout bij laden</h4>
            <p className="text-sm text-red-600 font-mono mt-2">{error}</p>
          </div>
        </div>
      )}

      {/* TABS NAVIGATIE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id);
              setSearchTerm("");
            }}
            className={`p-6 rounded-[30px] border-2 text-left transition-all group relative overflow-hidden ${
              activeTab === t.id
                ? "bg-white border-blue-500 shadow-xl shadow-blue-900/5 ring-4 ring-blue-500/5"
                : "bg-white border-slate-100 hover:border-blue-200 text-slate-400"
            }`}
          >
            <div
              className={`p-3 rounded-2xl mb-4 w-fit transition-colors ${
                activeTab === t.id
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                  : "bg-slate-50 text-slate-400"
              }`}
            >
              {t.icon}
            </div>
            <h3
              className={`font-black uppercase italic tracking-tighter text-sm ${
                activeTab === t.id ? "text-slate-900" : "text-slate-500"
              }`}
            >
              {t.label}
            </h3>
            <p className="text-[9px] font-bold uppercase tracking-widest mt-1 opacity-60 truncate">
              {t.desc}
            </p>
          </button>
        ))}
      </div>

      {/* ZOEKBALK & INFO */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
        <div className="relative flex-1 w-full group">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
            size={20}
          />
          <input
            className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[22px] outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-sm shadow-inner placeholder:text-slate-300 uppercase"
            placeholder="Snel zoeken in tabel..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 px-6 py-4 bg-slate-900 rounded-[22px] text-white shrink-0 shadow-lg">
          <ShieldCheck size={16} className="text-emerald-400" />
          <span className="text-[10px] font-black uppercase tracking-widest italic">
            Path:{" "}
            <span className="text-blue-400">
              /{PATHS[activeTab]?.join("/")}
            </span>
          </span>
        </div>
      </div>

      {/* DATA TABEL CONTAINER */}
      <div className="bg-white rounded-[45px] border border-slate-200 shadow-sm overflow-hidden relative flex flex-col h-[700px]">
        {loading ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] animate-pulse">
              Syncing Root Records...
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* HEADER ROW */}
            <div className="grid bg-slate-50/80 border-b border-slate-100 sticky top-0 z-10 backdrop-blur-sm" style={{ gridTemplateColumns: gridTemplate, paddingRight: '15px' }}>
              {activeTab === "FITTING_SPECS" && ["ID (mm)", "PN", "TW (min)", "Lo", "Lnom", "R", "Gewicht (kg)"].map(h => (
                <div key={h} className={thStyle}>{h}</div>
              ))}
              {activeTab === "BORE_DIMENSIONS" && ["Config DN/PN", "PCD (mm)", "Gaten (n)", "Draadmaat", "Gat Ø"].map(h => (
                <div key={h} className={thStyle}>{h}</div>
              ))}
              {activeTab === "CB_DIMENSIONS" && ["Record ID", "DN", "Mof Type", "Insertion (B1)", "Bell (B2)", "Bell OD (BD)"].map(h => (
                <div key={h} className={thStyle}>{h}</div>
              ))}
              {activeTab === "TB_DIMENSIONS" && ["Record ID", "DN", "Insertion (B1)", "Bell (B2)", "Rand (BA)", "W (mm)"].map(h => (
                <div key={h} className={thStyle}>{h}</div>
              ))}
            </div>

            {/* VIRTUALIZED LIST */}
            <div className="flex-1">
              {filteredData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40 italic">
                  <div className="p-8 bg-slate-50 rounded-full mb-6">
                    <Database className="text-slate-200" size={64} />
                  </div>
                  <h4 className="text-lg font-black text-slate-400 uppercase tracking-widest italic leading-none">Geen data gevonden</h4>
                </div>
              ) : (
                <AutoSizer>
                  {({ height, width }) => (
                    <List
                      height={height}
                      width={width}
                      itemCount={filteredData.length}
                      itemSize={60}
                      itemData={{ items: filteredData, activeTab, gridTemplate }}
                    >
                      {Row}
                    </List>
                  )}
                </AutoSizer>
              )}
            </div>
          </div>
        )}

        {/* Footer Audit Detail */}
        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Info size={16} className="text-blue-500" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">
              Deze tabel is uitsluitend ter referentie. Aanpassingen gebeuren in
              de Maatvoering module.
            </p>
          </div>
          {!loading && (
            <span className="text-[10px] font-black bg-slate-900 text-white px-3 py-1.5 rounded-xl italic">
              TOTAL: {filteredData.length} RECORDS
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminReferenceTable;