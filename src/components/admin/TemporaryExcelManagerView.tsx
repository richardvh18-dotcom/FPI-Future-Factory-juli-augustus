import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Upload, Trash2, Loader2, CheckCircle2, AlertTriangle, Database, HardDrive, FolderOpen, ArrowRight } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage, auth, logActivity } from '../../config/firebase';
import { buildRobotProgramPreparation } from '../../services/robotProgramService';
import { buildWm18ProgramDefinition, getWm18CatalogDefaults } from '../../services/wm18ProgramCatalogService';
import { buildLocalWm18ImportRecord, loadLocalWm18Imports, removeLocalWm18Import, saveLocalWm18Import } from '../../services/wm18ImportStorageService';

type TemporaryExcelRecord = {
  id: string;
  fileName: string;
  storagePath: string;
  fileUrl?: string;
  uploadedAt?: unknown;
  uploadedBy?: string;
  source?: string;
  notes?: string;
  category?: string;
  fileDataUri?: string;
  storageUploadFailed?: boolean;
  wm18Definition?: Record<string, unknown>;
  robotPrep?: Record<string, unknown>;
};

const STORAGE_PREFIX = 'wm18-imports/excel';
const COLLECTION_PATH = 'future-factory/settings/wm18_robot_imports';

const TemporaryExcelManagerView = () => {
  const [records, setRecords] = useState<TemporaryExcelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('WM18');
  const [notes, setNotes] = useState('');
  const [productFamily, setProductFamily] = useState('elbow');
  const [mofType, setMofType] = useState('TB');
  const [series, setSeries] = useState('EST');
  const [diameterMm, setDiameterMm] = useState('');
  const [pressureClass, setPressureClass] = useState('PN16');
  const [angleDeg, setAngleDeg] = useState('90');
  const [radiusMm, setRadiusMm] = useState('1.5');
  const [sourceFileName, setSourceFileName] = useState('WM18_Rekenprogramma_versie_12.xlsm');
  const catalogDefaults = useMemo(() => getWm18CatalogDefaults(), []);

  useEffect(() => {
    const loadRecords = async () => {
      try {
        const localImports = await loadLocalWm18Imports();
        const merged = [...localImports.map((item) => ({
          id: item.id,
          fileName: item.fileName,
          storagePath: item.storagePath,
          fileUrl: undefined,
          uploadedAt: item.uploadedAt,
          uploadedBy: item.uploadedBy,
          source: item.source,
          notes: item.notes,
          category: item.category,
          fileDataUri: item.fileDataUri,
          storageUploadFailed: item.storageUploadFailed,
          wm18Definition: item.wm18Definition,
          robotPrep: item.robotPrep,
        } as TemporaryExcelRecord))];

        setRecords(merged);
      } catch (error) {
        console.error('Temporary Excel local load failed', error);
      }

      try {
        const q = query(collection(db, COLLECTION_PATH), orderBy('uploadedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const cloudRecords = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<TemporaryExcelRecord, 'id'>) }));
          setRecords((prev) => {
            const localIds = new Set(prev.filter((item) => item.source === 'wm18-robot-import-local').map((item) => item.id));
            const mergedRecords = [...cloudRecords.filter((item) => item.source !== 'wm18-robot-import-local'), ...prev.filter((item) => localIds.has(item.id))];
            return mergedRecords;
          });
          setLoading(false);
        }, (error) => {
          console.error('Temporary Excel load failed', error);
          setStatus({ type: 'error', message: 'Kon WM18-imports niet laden uit Firestore.' });
          setLoading(false);
        });

        return unsubscribe();
      } catch (error) {
        console.error('Temporary Excel cloud listener setup failed', error);
        setLoading(false);
      }
    };

    void loadRecords();
  }, []);

  const filteredRecords = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return records;
    return records.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
  }, [records, filter]);

  const readFileAsDataUri = async (file: File) => {
    const reader = new FileReader();
    return await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Kon bestand niet lezen'));
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus(null);

    try {
      await auth.authStateReady();
      if (!auth.currentUser) {
        throw new Error('Je bent nog niet ingelogd. Log opnieuw in en probeer het opnieuw.');
      }

      const safeName = file.name.replace(/\s+/g, '_');
      const storagePath = `${STORAGE_PREFIX}/${safeName}`;
      const wm18Definition = buildWm18ProgramDefinition({
        productFamily,
        mofType,
        series,
        diameterMm,
        pressureClass,
        angleDeg,
        radiusMm,
        description: notes,
        sourceFileName,
      });

      const robotPrep = buildRobotProgramPreparation({
        diameterMm: diameterMm.trim(),
        pressureClass,
        notes,
        category,
        source: 'wm18-excel',
      });

      const record: TemporaryExcelRecord = {
        id: safeName,
        fileName: file.name,
        storagePath,
        uploadedAt: serverTimestamp(),
        uploadedBy: auth.currentUser?.email || 'unknown',
        source: 'wm18-robot-import',
        notes: notes.trim() || 'Eenmalige WM18-wikkelrobot import voor later gateway- of robotworkflow',
        category,
        wm18Definition,
        ...(robotPrep as unknown as Record<string, unknown>),
      };

      try {
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        const fileUrl = await getDownloadURL(storageRef);
        record.fileUrl = fileUrl;
        await setDoc(doc(db, COLLECTION_PATH, safeName), record, { merge: true });
        await logActivity(auth.currentUser?.uid || 'unknown', 'TEMP_EXCEL_UPLOAD', `WM18-wikkelrobot import geüpload: ${file.name}`);
        setStatus({ type: 'success', message: `WM18-import opgeslagen: ${file.name} (${wm18Definition.productFamily} / ${wm18Definition.diameterMm ?? '-'} mm / ${wm18Definition.pressureClass})` });
      } catch (storageError) {
        const storageMessage = storageError instanceof Error ? storageError.message : 'Storage upload failed';
        if (storageMessage.includes('storage/unauthorized') || storageMessage.includes('User does not have permission')) {
          const fileDataUri = await readFileAsDataUri(file);
          const fallbackRecord = buildLocalWm18ImportRecord({
            fileName: file.name,
            storagePath,
            notes: notes.trim() || 'Fallback-opslag in browser wegens storage-permissie',
            category,
            fileDataUri,
            uploadedBy: auth.currentUser?.email || 'unknown',
            wm18Definition,
            robotPrep,
          });
          await saveLocalWm18Import(fallbackRecord);
          setStatus({ type: 'info', message: `WM18-import is lokaal opgeslagen in de browser omdat Firebase Storage de upload weigerde. (${file.name})` });
        } else {
          throw storageError;
        }
      }
      setNotes('');
      setCategory('WM18');
      setProductFamily('elbow');
      setMofType('TB');
      setSeries('EST');
      setDiameterMm('');
      setPressureClass('PN16');
      setAngleDeg('90');
      setRadiusMm('1.5');
      setSourceFileName('WM18_Rekenprogramma_versie_12.xlsm');
      event.target.value = '';
    } catch (error) {
      console.error(error);
      const message = error instanceof Error
        ? error.message
        : 'Upload mislukt';
      const isStorageUnauthorized = message.includes('storage/unauthorized') || message.includes('User does not have permission');

      if (isStorageUnauthorized) {
        try {
          const fileDataUri = await readFileAsDataUri(file);
          const safeName = file.name.replace(/\s+/g, '_');
          const fallbackRecord: TemporaryExcelRecord = {
            id: safeName,
            fileName: file.name,
            storagePath: `${STORAGE_PREFIX}/${safeName}`,
            uploadedAt: serverTimestamp(),
            uploadedBy: auth.currentUser?.email || 'unknown',
            source: 'wm18-robot-import-fallback',
            notes: notes.trim() || 'Fallback-opslag in Firestore wegens storage-permissie',
            category,
            fileDataUri,
            storageUploadFailed: true,
          };
          await setDoc(doc(db, COLLECTION_PATH, safeName), fallbackRecord, { merge: true });
          setStatus({ type: 'info', message: `WM18-import is opgeslagen als fallback-record in Firestore omdat Firebase Storage de upload weigerde. (${file.name})` });
        } catch (fallbackError) {
          console.error(fallbackError);
          setStatus({ type: 'error', message: 'Upload mislukt en fallback-opslag in Firestore is ook gefaald.' });
        }
      } else {
        setStatus({ type: 'error', message: message });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (record: TemporaryExcelRecord) => {
    try {
      if (record.source === 'wm18-robot-import-local') {
        await removeLocalWm18Import(record.id);
        setStatus({ type: 'success', message: `Lokaal opgeslagen import verwijderd: ${record.fileName}` });
        return;
      }

      await deleteObject(ref(storage, record.storagePath));
      await deleteDoc(doc(db, COLLECTION_PATH, record.id));
      setStatus({ type: 'success', message: `Bestand verwijderd: ${record.fileName}` });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Verwijderen mislukt';
      setStatus({ type: 'error', message: message.includes('storage/unauthorized') ? 'Verwijderen geweigerd door Firebase Storage.' : message });
    }
  };

  return (
    <div className="p-8 lg:p-10 max-w-6xl mx-auto space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">WM18-wikkelrobot importbeheer</h2>
            <p className="text-sm text-slate-600">Upload en beheer de éénmalige import van het WM18-rekenprogramma voor de wikkelrobot. De huidige WebUSB-printflow blijft intact.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-700">
              <Upload size={16} className="text-blue-600" /> Nieuwe WM18-import
            </div>
            <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-600">
              <input type="file" accept=".xls,.xlsx,.xlsm,.csv" className="hidden" onChange={handleUpload} />
              <span>{uploading ? 'Bezig met upload...' : 'Klik om Excel/CSV te uploaden'}</span>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Categorie</label>
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                  <option value="WM18">WM18 / Rekenprogramma</option>
                  <option value="IMPORT">Import</option>
                  <option value="ROBOT">Robot</option>
                  <option value="PRINT">Print</option>
                  <option value="OTHER">Overig</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Notitie</label>
                <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bijv. bron, proces, of doel" className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Productfamilie</label>
                <select value={productFamily} onChange={(event) => setProductFamily(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                  {catalogDefaults.productFamilies.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">MOF-type</label>
                <select value={mofType} onChange={(event) => setMofType(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                  {catalogDefaults.mofTypes.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Serie</label>
                <select value={series} onChange={(event) => setSeries(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                  {catalogDefaults.series.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Drukklasse</label>
                <select value={pressureClass} onChange={(event) => setPressureClass(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                  {catalogDefaults.pressureClasses.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Diameter (mm)</label>
                <select value={diameterMm} onChange={(event) => setDiameterMm(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                  <option value="">Selecteer</option>
                  {catalogDefaults.diameters.map((option) => <option key={option} value={String(option)}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Hoek (°)</label>
                <select value={angleDeg} onChange={(event) => setAngleDeg(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                  {catalogDefaults.angles.map((option) => <option key={option} value={String(option)}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Radius</label>
                <select value={radiusMm} onChange={(event) => setRadiusMm(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                  {catalogDefaults.radiusOptions.map((option) => <option key={option} value={String(option)}>{option}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">Bronbestand</label>
              <input value={sourceFileName} onChange={(event) => setSourceFileName(event.target.value)} placeholder="WM18_Rekenprogramma_versie_12.xlsm" className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-700">
              <Database size={16} className="text-purple-600" /> Voorbereide data-opslag
            </div>
            <p className="text-sm text-slate-600">Deze imports worden eerst lokaal in de browser opgeslagen en, indien beschikbaar, ook geüpload naar Firebase Storage en geregistreerd in Firestore. Zo blijft de workflow bruikbaar zelfs bij Storage- of Firestore-problemen.</p>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
              <div className="flex items-center gap-2"><FolderOpen size={14} className="text-slate-500" /> Storage-pad: <span className="font-mono text-xs">{STORAGE_PREFIX}</span></div>
              <div className="flex items-center gap-2 mt-2"><HardDrive size={14} className="text-slate-500" /> Firestore-pad: <span className="font-mono text-xs">{COLLECTION_PATH}</span></div>
            </div>
          </div>
        </div>

        {status ? (
          <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : status.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {status.type === 'success' ? <CheckCircle2 size={16} className="inline mr-2" /> : status.type === 'error' ? <AlertTriangle size={16} className="inline mr-2" /> : <Database size={16} className="inline mr-2" />}
            {status.message}
          </div>
        ) : null}

        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-black uppercase tracking-wider text-slate-700">Beschikbare WM18-imports</div>
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Zoek bestand of notitie" className="rounded-2xl border border-slate-300 px-3 py-2 text-sm" />
          </div>

          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <Loader2 className="animate-spin" size={16} /> Laden...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Nog geen WM18-imports beschikbaar.</div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => (
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                      <FileSpreadsheet size={14} className="text-amber-600" /> {record.fileName}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {record.category || 'OVERIG'} • {record.notes || 'Geen notitie'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.fileUrl ? (
                      <a href={record.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700">
                        Open <ArrowRight size={12} />
                      </a>
                    ) : null}
                    <button onClick={() => handleDelete(record)} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-rose-700">
                      <Trash2 size={12} /> Verwijderen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemporaryExcelManagerView;
