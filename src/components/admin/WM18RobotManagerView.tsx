import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileSpreadsheet,
  Upload,
  Cpu,
  Download,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Sliders,
  Send,
  Database,
  Info
} from 'lucide-react';
import { collection, onSnapshot, query, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth, logActivity } from '../../config/firebase';
import { Wm18CatalogItem, Wm18OperatorAdjustment, Wm18RapidModuleOutput } from '../../types/wm18Types';
import { calculateWm18Item, generateWm18RapidCode } from '../../services/wm18CalculationEngine';
import { parseAndImportWm18Workbook } from '../../services/wm18ExcelImportService';
import { sendRobotProgramToGateway } from '../../services/gatewayPcService';

const CATALOG_PATH = 'future-factory/data/wm18_catalog';
const ADJUSTMENTS_PATH = 'future-factory/data/wm18_adjustments';

const WM18RobotManagerView: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'catalog' | 'new-product' | 'import' | 'adjustments'>('catalog');

  const [catalogItems, setCatalogItems] = useState<Wm18CatalogItem[]>([]);
  const [adjustments, setAdjustments] = useState<Wm18OperatorAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMof, setSelectedMof] = useState<string>('ALL');
  const [selectedAngle, setSelectedAngle] = useState<string>('ALL');

  // Selected Item Modal / Rapid Code
  const [selectedItem, setSelectedItem] = useState<Wm18CatalogItem | null>(null);
  const [rapidCode, setRapidCode] = useState<Wm18RapidModuleOutput | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // New Product Form state
  const [newDiameter, setNewDiameter] = useState<number>(250);
  const [newMofType, setNewMofType] = useState<'TB' | 'CB'>('TB');
  const [newSeries, setNewSeries] = useState<string>('EST');
  const [newPressureClass, setNewPressureClass] = useState<string>('PN16');
  const [newAngle, setNewAngle] = useState<number>(90);
  const [newRadius, setNewRadius] = useState<number>(375);
  const [generatedPreview, setGeneratedPreview] = useState<Wm18CatalogItem | null>(null);

  useEffect(() => {
    let unsubCatalog: () => void = () => {};
    let unsubAdj: () => void = () => {};

    // Helper to load local fallback data
    const loadLocalFallbacks = () => {
      if (typeof window !== 'undefined') {
        try {
          const rawCat = window.localStorage.getItem('fpi_wm18_catalog_local');
          if (rawCat) setCatalogItems(JSON.parse(rawCat));
          const rawAdj = window.localStorage.getItem('fpi_wm18_adjustments_local');
          if (rawAdj) setAdjustments(JSON.parse(rawAdj));
        } catch (e) {
          console.warn('Failed reading local storage fallback:', e);
        }
      }
    };

    try {
      const qCatalog = query(collection(db, CATALOG_PATH));
      unsubCatalog = onSnapshot(qCatalog, (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map((docSnap) => docSnap.data() as Wm18CatalogItem);
          setCatalogItems(items);
        } else {
          loadLocalFallbacks();
        }
        setLoading(false);
      }, (err) => {
        console.warn('WM18 Catalog load fallback:', err.message || err);
        loadLocalFallbacks();
        setLoading(false);
      });
    } catch (e) {
      console.warn('WM18 Catalog query init error:', e);
      loadLocalFallbacks();
      setLoading(false);
    }

    try {
      const qAdj = query(collection(db, ADJUSTMENTS_PATH));
      unsubAdj = onSnapshot(qAdj, (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map((docSnap) => docSnap.data() as Wm18OperatorAdjustment);
          setAdjustments(items);
        }
      }, (err) => {
        console.warn('WM18 Adjustments load fallback:', err.message || err);
      });
    } catch (e) {
      console.warn('WM18 Adjustments query init error:', e);
    }

    return () => {
      unsubCatalog();
      unsubAdj();
    };
  }, []);

  // Filtered Catalog
  const filteredCatalog = useMemo(() => {
    return catalogItems.filter((item) => {
      const matchSearch = searchTerm === '' ||
        item.articleNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(item.diameterMm).includes(searchTerm) ||
        item.series?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchMof = selectedMof === 'ALL' || item.mofType === selectedMof;
      const matchAngle = selectedAngle === 'ALL' || String(item.angleDeg) === selectedAngle;
      return matchSearch && matchMof && matchAngle;
    });
  }, [catalogItems, searchTerm, selectedMof, selectedAngle]);

  // Handle Excel Upload
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatusMessage({ type: 'info', text: t('wm18.importing', 'Bezig met het verwerken en importeren van het WM18 Excel rekenprogramma naar Firestore...') });

    try {
      const buffer = await file.arrayBuffer();
      const res = await parseAndImportWm18Workbook(buffer, file.name, (pct, statusText) => {
        setStatusMessage({ type: 'info', text: `[${pct}%] ${statusText}` });
      });

      await logActivity(
        auth.currentUser?.uid || 'system',
        'WM18_EXCEL_IMPORTED',
        `WM18 Excel geïmporteerd: ${res.catalogCount} artikelen, ${res.adjustmentsCount} operator logregels uit ${file.name}`
      );

      // If stored locally due to firestore permissions before deploy
      if (res.isFallback) {
        // reload local storage state immediately
        const rawCat = window.localStorage.getItem('fpi_wm18_catalog_local');
        if (rawCat) setCatalogItems(JSON.parse(rawCat));
        const rawAdj = window.localStorage.getItem('fpi_wm18_adjustments_local');
        if (rawAdj) setAdjustments(JSON.parse(rawAdj));
      }

      setStatusMessage({
        type: 'success',
        text: res.isFallback
          ? t('wm18.importSuccessLocal', `Succesvol verwerkt! ${res.catalogCount} catalogusartikelen en ${res.adjustmentsCount} logregels zijn lokaal opgeslagen in de browser. (Upload naar Firestore activeert na 'firebase deploy').`)
          : t('wm18.importSuccess', `Succesvol geïmporteerd! ${res.catalogCount} catalogusartikelen en ${res.adjustmentsCount} operator aanpassingen zijn gesynchroniseerd met Firestore.`),
      });
      e.target.value = '';
    } catch (err) {
      console.error('Import error', err);
      setStatusMessage({
        type: 'error',
        text: t('wm18.importError', 'Fout bij importeren van het Excel bestand. Controleer of het een geldig WM18 bestand is.'),
      });
    } finally {
      setUploading(false);
    }
  };

  // Generate RAPID code for selected item
  const handleSelectProduct = (item: Wm18CatalogItem) => {
    setSelectedItem(item);
    const code = generateWm18RapidCode(item);
    setRapidCode(code);
  };

  // Dispatch to Gateway PC
  const handleSendToGateway = async (station: 'STN1' | 'STN2') => {
    if (!selectedItem || !rapidCode) return;
    const codeText = station === 'STN1' ? rapidCode.stn1RapidCode : rapidCode.stn2RapidCode;
    const fileName = `Procesdata${station}.MOD`;

    try {
      setStatusMessage({ type: 'info', text: t('wm18.sendingGateway', `Bezig met verzenden van ${fileName} naar Gateway PC...`) });
      await sendRobotProgramToGateway({
        programId: selectedItem.id,
        fileName,
        content: codeText,
        station,
      });
      setStatusMessage({ type: 'success', text: t('wm18.sendGatewaySuccess', `${fileName} is succesvol verzonden naar de Gateway PC / Robot!`) });
    } catch (err) {
      console.error('Gateway send failed', err);
      setStatusMessage({ type: 'error', text: t('wm18.sendGatewayError', 'Verzenden naar Gateway PC mislukt. Controleer of de Gateway actief is.') });
    }
  };

  // Calculate new product preview
  const handleCalculateNewProduct = () => {
    const calculated = calculateWm18Item({
      diameterMm: newDiameter,
      mofType: newMofType,
      series: newSeries,
      pressureClass: newPressureClass,
      angleDeg: newAngle,
      radiusMm: newRadius,
    });
    setGeneratedPreview(calculated);
  };

  // Save new product to Firestore catalog
  const handleSaveNewProduct = async () => {
    if (!generatedPreview) return;
    try {
      await setDoc(doc(db, CATALOG_PATH, generatedPreview.id), generatedPreview, { merge: true });
      setStatusMessage({ type: 'success', text: t('wm18.saveProductSuccess', `Nieuw product ${generatedPreview.articleNumber} is opgeslagen in de catalogus!`) });
      setActiveTab('catalog');
    } catch (err) {
      console.error('Save product error', err);
      setStatusMessage({ type: 'error', text: t('wm18.saveProductError', 'Opslaan van nieuw product mislukt.') });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 lg:p-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
              <Cpu size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white uppercase">
                {t('wm18.title', 'WM18 Wikkelrobot Instelcentrum')}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {t('wm18.subtitle', 'Parametrisch reken- en instelprogramma voor ABB robotbesturing (Station 1 & Station 2)')}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs navigation */}
        <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-900/80 p-1.5 border border-slate-800 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'catalog' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database size={16} /> {t('wm18.tabCatalog', 'Catalogus & Programma\'s')} ({catalogItems.length})
          </button>
          <button
            onClick={() => setActiveTab('new-product')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'new-product' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus size={16} /> {t('wm18.tabNewProduct', 'Nieuw Product Generator')}
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'import' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet size={16} /> {t('wm18.tabImport', 'Excel Import')}
          </button>
          <button
            onClick={() => setActiveTab('adjustments')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'adjustments' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders size={16} /> {t('wm18.tabAdjustments', 'Operator Log S8')} ({adjustments.length})
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`flex items-center gap-3 p-4 rounded-2xl border text-sm font-semibold transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
              : 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
          }`}
        >
          {statusMessage.type === 'success' && <CheckCircle2 size={18} />}
          {statusMessage.type === 'error' && <AlertTriangle size={18} />}
          {statusMessage.type === 'info' && <RefreshCw size={18} className="animate-spin" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* TAB 1: CATALOGUS & PROGRAMMA'S */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl backdrop-blur-md">
            <div className="relative col-span-2">
              <Search className="absolute left-3.5 top-3 text-slate-500" size={18} />
              <input
                type="text"
                placeholder={t('wm18.searchPlaceholder', 'Zoek op artikelnummer, diameter, serie...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <select
                value={selectedMof}
                onChange={(e) => setSelectedMof(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">{t('wm18.allMof', 'Alle Moffen (TB & CB)')}</option>
                <option value="TB">TB (Spigot / Tapered Bell)</option>
                <option value="CB">CB (Cylindrical Bell)</option>
              </select>
            </div>
            <div>
              <select
                value={selectedAngle}
                onChange={(e) => setSelectedAngle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">{t('wm18.allAngles', 'Alle Hoeken')}</option>
                <option value="11.25">11.25°</option>
                <option value="15">15°</option>
                <option value="22.5">22.5°</option>
                <option value="30">30°</option>
                <option value="45">45°</option>
                <option value="90">90°</option>
              </select>
            </div>
          </div>

          {/* Catalog Table */}
          <div className="border border-slate-800 bg-slate-900/40 rounded-2xl overflow-hidden backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-4">{t('wm18.colArticle', 'Artikel / Omschrijving')}</th>
                    <th className="p-4">{t('wm18.colDiameter', 'ID (mm)')}</th>
                    <th className="p-4">{t('wm18.colMof', 'Mof')}</th>
                    <th className="p-4">{t('wm18.colAngle', 'Hoek')}</th>
                    <th className="p-4">{t('wm18.colSeries', 'Serie / PN')}</th>
                    <th className="p-4">{t('wm18.colGangen', 'Gangen')}</th>
                    <th className="p-4">{t('wm18.colTime', 'Wikkeltijd')}</th>
                    <th className="p-4 text-right">{t('wm18.colActions', 'Acties')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        <RefreshCw className="animate-spin inline mr-2" size={18} /> {t('wm18.loading', 'Laden van WM18 catalogus...')}
                      </td>
                    </tr>
                  ) : filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        {t('wm18.noItemsFound', 'Geen producten gevonden in de catalogus. Voer een Excel import uit.')}
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-mono font-bold text-cyan-400">
                          {item.articleNumber || `DN${item.diameterMm} ${item.angleDeg}° ${item.mofType}`}
                        </td>
                        <td className="p-4 font-bold text-white">DN {item.diameterMm}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${item.mofType === 'TB' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                            {item.mofType}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-slate-200">{item.angleDeg}°</td>
                        <td className="p-4 text-xs font-medium text-slate-400">{item.series} • {item.pressureClass}</td>
                        <td className="p-4 font-mono text-cyan-300">{item.gangenCount} gangen</td>
                        <td className="p-4 font-mono text-slate-300">{item.wikkeltijdMin} min</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleSelectProduct(item)}
                            className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                          >
                            <Code2 size={14} /> {t('wm18.viewProgram', 'Bekijk Programma')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NIEUW PRODUCT GENERATOR */}
      {activeTab === 'new-product' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl space-y-5 backdrop-blur-md">
            <h2 className="text-xl font-black uppercase text-white flex items-center gap-2">
              <Plus className="text-cyan-400" size={20} /> {t('wm18.newProductTitle', 'Bereken Nieuw Product')}
            </h2>
            <p className="text-xs text-slate-400">
              {t('wm18.newProductSub', 'Voer de gewenste buisparameters in. Het systeem berekent automatisch de 6D robotcoördinaten, snelheden en RAPID code volgens de geleerde WM18-formules.')}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">{t('wm18.diameter', 'Diameter (ID in mm)')}</label>
                <input
                  type="number"
                  value={newDiameter}
                  onChange={(e) => setNewDiameter(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">{t('wm18.mof', 'Mof Type')}</label>
                <select
                  value={newMofType}
                  onChange={(e) => setNewMofType(e.target.value as 'TB' | 'CB')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-semibold"
                >
                  <option value="TB">TB (Spigot)</option>
                  <option value="CB">CB (Cylindrical Bell)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">{t('wm18.angle', 'Hoek (graden)')}</label>
                <input
                  type="number"
                  value={newAngle}
                  onChange={(e) => setNewAngle(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">{t('wm18.series', 'Serie & PN')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSeries}
                    onChange={(e) => setNewSeries(e.target.value)}
                    className="w-1/2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                  <input
                    type="text"
                    value={newPressureClass}
                    onChange={(e) => setNewPressureClass(e.target.value)}
                    className="w-1/2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">{t('wm18.radius', 'Straal R (mm)')}</label>
                <input
                  type="number"
                  value={newRadius}
                  onChange={(e) => setNewRadius(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleCalculateNewProduct}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black uppercase tracking-wider text-xs shadow-lg shadow-cyan-500/20 transition-all"
            >
              {t('wm18.calculateNow', 'Bereken Robot Coördinaten & Programma')}
            </button>
          </div>

          {/* Preview Results */}
          {generatedPreview && (
            <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl space-y-4 backdrop-blur-md">
              <h3 className="text-lg font-black uppercase text-cyan-400 flex items-center justify-between">
                <span>{generatedPreview.articleNumber}</span>
                <span className="text-xs px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                  {generatedPreview.gangenCount} gangen • {generatedPreview.wikkeltijdMin} min
                </span>
              </h3>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-slate-500 uppercase font-bold">Winding Speed</div>
                  <div className="text-lg font-mono font-bold text-white">{generatedPreview.speedsAndPitches.windingSpeedRpm} RPM</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-slate-500 uppercase font-bold">Benodigd Weefsel</div>
                  <div className="text-lg font-mono font-bold text-white">{generatedPreview.fabricMeters} meter</div>
                </div>
              </div>

              {/* Station 1 Target Pos 1 Preview */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs space-y-1 text-slate-300">
                <div className="text-slate-500 font-bold uppercase text-[10px]">Station 1 - Pos 1 Target</div>
                <div>X: {generatedPreview.stn1Targets.pos1.x} | Y: {generatedPreview.stn1Targets.pos1.y} | Z: {generatedPreview.stn1Targets.pos1.z}</div>
                <div>rX: {generatedPreview.stn1Targets.pos1.rx} | rY: {generatedPreview.stn1Targets.pos1.ry} | rZ: {generatedPreview.stn1Targets.pos1.rz}</div>
              </div>

              <button
                onClick={handleSaveNewProduct}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wider text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} /> {t('wm18.saveToCatalog', 'Sla op in Future Factory Catalogus')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EXCEL IMPORT */}
      {activeTab === 'import' && (
        <div className="max-w-2xl mx-auto bg-slate-900/60 border border-slate-800 p-8 rounded-3xl space-y-6 text-center backdrop-blur-md">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
            <FileSpreadsheet size={32} />
          </div>

          <div>
            <h2 className="text-2xl font-black uppercase text-white tracking-tight">
              {t('wm18.importTitle', 'WM18 Excel Rekenprogramma Importeren')}
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              {t('wm18.importSub', 'Upload het bestand WM18_Rekenprogramma_versie_12.xlsm om alle 300+ productartikelen, 6D robotcoördinaten en operator S8-historie direct te synchroniseren met Firestore.')}
            </p>
          </div>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-cyan-500 bg-slate-950/60 p-8 rounded-2xl cursor-pointer transition-all">
            <input
              type="file"
              accept=".xls,.xlsx,.xlsm"
              onChange={handleExcelImport}
              disabled={uploading}
              className="hidden"
            />
            <Upload size={32} className="text-cyan-400 mb-3" />
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              {uploading ? t('wm18.importingBtn', 'Bezig met importeren...') : t('wm18.selectExcelFile', 'Selecteer WM18 Excel Bestand')}
            </span>
            <span className="text-xs text-slate-500 mt-1">.xlsm, .xlsx, .xls</span>
          </label>
        </div>
      )}

      {/* TAB 4: OPERATOR LOG S8 */}
      {activeTab === 'adjustments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black uppercase text-white">
              {t('wm18.operatorLogTitle', 'Operator Aanpassingslogboek (S8)')}
            </h2>
          </div>

          <div className="border border-slate-800 bg-slate-900/40 rounded-2xl overflow-hidden backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-4">Datum</th>
                    <th className="p-4">Operator</th>
                    <th className="p-4">Product Spec</th>
                    <th className="p-4">Opmerking / Bevinding</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        {t('wm18.noAdjustments', 'Geen operator logboeken beschikbaar.')}
                      </td>
                    </tr>
                  ) : (
                    adjustments.map((adj) => (
                      <tr key={adj.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 text-xs font-mono text-slate-400">{adj.datum}</td>
                        <td className="p-4 font-bold text-white">{adj.operatorName}</td>
                        <td className="p-4 text-xs font-semibold text-cyan-400">
                          DN{adj.diameterMm} {adj.mofType} {adj.angleDeg}°
                        </td>
                        <td className="p-4 text-slate-200">{adj.opmerking}</td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            {adj.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RAPID Code Preview Modal */}
      {selectedItem && rapidCode && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl p-6 lg:p-8 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-xl font-black text-white font-mono">{selectedItem.articleNumber}</h3>
                <p className="text-xs text-slate-400">Gegenereerde ABB RAPID Robot Programmacode</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
              >
                Sluiten
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* STN 1 RAPID */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                  <span>ProcesdataSTN1.MOD</span>
                  <button
                    onClick={() => handleSendToGateway('STN1')}
                    className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Send size={12} /> Naar Gateway PC
                  </button>
                </div>
                <textarea
                  readOnly
                  value={rapidCode.stn1RapidCode}
                  className="w-full h-80 p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 focus:outline-none"
                />
              </div>

              {/* STN 2 RAPID */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                  <span>ProcesdataSTN2.MOD</span>
                  <button
                    onClick={() => handleSendToGateway('STN2')}
                    className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Send size={12} /> Naar Gateway PC
                  </button>
                </div>
                <textarea
                  readOnly
                  value={rapidCode.stn2RapidCode}
                  className="w-full h-80 p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WM18RobotManagerView;
