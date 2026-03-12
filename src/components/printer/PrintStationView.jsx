import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { PATHS } from '../../config/dbPaths';
import { Loader2, Printer, Search, Send } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { generateZPL } from '../../utils/zplHelper';
import { sendPrintJobToQueue } from '../../services/printService';
import { processLabelData, applyLabelLogic } from '../../utils/labelHelpers';

// Mock-implementaties omdat de originelen niet in context zijn
const LabelPreview = ({ label, data, zoom }) => (
  <div className="bg-white text-black p-4" style={{ zoom }}>
    <h3 className="font-bold">{label?.name}</h3>
    <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
  </div>
);

const PrintStationView = () => {
  const [lotNumber, setLotNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [productData, setProductData] = useState(null);
  const [error, setError] = useState('');
  const { showSuccess, showError } = useNotifications();

  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedLabelId, setSelectedLabelId] = useState('');
  const [labelRules, setLabelRules] = useState([]);

  useEffect(() => {
    const fetchLabelConfig = async () => {
      try {
        const labelsRef = collection(db, ...PATHS.LABEL_TEMPLATES);
        const labelsSnap = await getDocs(labelsRef);
        const labels = labelsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailableLabels(labels);
        if (labels.length > 0) setSelectedLabelId(labels[0].id);

        const rulesRef = collection(db, ...PATHS.LABEL_LOGIC);
        const rulesSnap = await getDocs(rulesRef);
        setLabelRules(rulesSnap.docs.map(d => d.data()));
      } catch (e) {
        console.error("Fout bij laden label configuratie:", e);
        showError("Kon label configuratie niet laden.");
      }
    };
    fetchLabelConfig();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!lotNumber) return;

    setIsLoading(true);
    setProductData(null);
    setError('');

    try {
      let foundDoc = null;
      // Zoek in actieve productie
      const activeRef = collection(db, ...PATHS.ACTIVE_PRODUCTION);
      const qActive = query(activeRef, where('lotNumber', '==', lotNumber), limit(1));
      const activeSnap = await getDocs(qActive);

      if (!activeSnap.empty) {
        foundDoc = activeSnap.docs[0];
      } else {
        // Zoek in archief (vereist mogelijk index)
        const archiveRef = collection(db, ...PATHS.PRODUCTION_ARCHIVE);
        const qArchive = query(archiveRef, where('lotNumber', '==', lotNumber), limit(1));
        const archiveSnap = await getDocs(qArchive);
        if (!archiveSnap.empty) {
          foundDoc = archiveSnap.docs[0];
        }
      }

      if (foundDoc) {
        setProductData({ id: foundDoc.id, ...foundDoc.data() });
      } else {
        setError(`Lotnummer ${lotNumber} niet gevonden.`);
        showError(`Lotnummer ${lotNumber} niet gevonden.`);
      }
    } catch (err) {
      console.error("Fout bij zoeken:", err);
      setError("Er is een fout opgetreden bij het zoeken.");
      showError("Zoekfout: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedLabel = useMemo(() => availableLabels.find(l => l.id === selectedLabelId), [availableLabels, selectedLabelId]);

  const previewData = useMemo(() => {
    if (!productData) return {};
    const baseData = processLabelData({
      ...productData,
      orderNumber: productData.orderId,
      productId: productData.itemCode,
      description: productData.item,
    });
    return applyLabelLogic(baseData, labelRules);
  }, [productData, labelRules]);

  const handlePrint = async () => {
    if (!selectedLabel || !productData) {
      showError("Selecteer een product en een label voordat u print.");
      return;
    }
    setIsLoading(true);
    try {
      const zpl = await generateZPL(selectedLabel, previewData);
      const jobId = await sendPrintJobToQueue({
        zpl,
        description: `Label voor lot: ${productData.lotNumber}`,
        stationId: 'PrintStation'
      });
      showSuccess(`Printopdracht ${jobId} succesvol naar de wachtrij gestuurd!`);
      setProductData(null);
      setLotNumber('');
    } catch (err) {
      console.error("Fout bij versturen printopdracht:", err);
      showError("Kon printopdracht niet versturen: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Printer className="text-slate-800" size={32} />
          <h1 className="text-3xl font-bold text-slate-800">Centraal Printstation</h1>
        </div>
        <p className="text-slate-600 mb-8">Scan of typ een lotnummer om een label te (her)printen. De printopdracht wordt naar de centrale printer bij BH18 gestuurd.</p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value.toUpperCase())}
              placeholder="Scan of typ lotnummer..."
              className="w-full p-3 pl-10 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>
          <button type="submit" disabled={isLoading || !lotNumber} className="bg-slate-800 text-white px-6 py-3 rounded-lg font-semibold hover:bg-slate-700 disabled:bg-slate-400 flex items-center gap-2">
            {isLoading ? <Loader2 className="animate-spin" /> : <Search size={20} />}
            <span>Zoek</span>
          </button>
        </form>

        {error && <div className="text-red-600 bg-red-100 p-4 rounded-lg mb-8">{error}</div>}

        {productData && (
          <div className="bg-white p-6 rounded-lg shadow-md animate-in fade-in">
            <h2 className="text-2xl font-bold mb-4">Product Gevonden: {productData.lotNumber}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p><strong>Order:</strong> {productData.orderId}</p>
                <p><strong>Artikel:</strong> {productData.itemCode}</p>
                <p><strong>Omschrijving:</strong> {productData.item}</p>
                
                <div className="mt-4">
                  <label htmlFor="label-select" className="block text-sm font-medium text-slate-700 mb-1">Kies Label Template</label>
                  <select
                    id="label-select"
                    value={selectedLabelId}
                    onChange={(e) => setSelectedLabelId(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md"
                  >
                    {availableLabels.map(l => <option key={l.id} value={l.id}>{l.name} ({l.width}x{l.height}mm)</option>)}
                  </select>
                </div>

                <button onClick={handlePrint} disabled={isLoading} className="mt-6 w-full bg-blue-600 text-white px-6 py-4 rounded-lg font-bold text-lg hover:bg-blue-500 disabled:bg-blue-300 flex items-center justify-center gap-3">
                  {isLoading ? <Loader2 className="animate-spin" /> : <Send size={24} />}
                  <span>Stuur naar Printer</span>
                </button>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <h3 className="text-white font-bold mb-2">Label Preview</h3>
                {selectedLabel ? <LabelPreview label={selectedLabel} data={previewData} zoom={0.8} /> : <p className="text-slate-400">Selecteer een label</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintStationView;