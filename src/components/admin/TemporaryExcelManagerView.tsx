import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Upload, Trash2, Loader2, CheckCircle2, AlertTriangle, Database, ArrowRight } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth, logActivity } from '../../config/firebase';
import { buildRobotProgramPreparation } from '../../services/robotProgramService';
import { parseWm18Workbook } from '../../services/wm18CatalogImportService';
import { buildWm18ImportDocumentId } from '../../services/wm18ImportStorageService';

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
  importedCatalog?: Array<Record<string, unknown>>;
  importedProgramTemplates?: Array<Record<string, unknown>>;
};

const STORAGE_PREFIX = 'wm18-imports/excel';
const COLLECTION_PATH = 'future-factory/settings/wm18_robot_imports';

const TemporaryExcelManagerView = () => {
  const [records, setRecords] = useState<TemporaryExcelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const loadRecords = async () => {
      try {
        const q = query(collection(db, COLLECTION_PATH), orderBy('uploadedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const cloudRecords = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<TemporaryExcelRecord, 'id'>) }));
          setRecords(cloudRecords);
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
      const workbookBuffer = await file.arrayBuffer();
      const importedWorkbook = await parseWm18Workbook(workbookBuffer, file.name);
      const wm18Definition = importedWorkbook.programTemplates[0]?.definition || {
        productFamily: 'elbow',
        mofType: 'TB',
        series: 'EST',
        diameterMm: null,
        pressureClass: 'PN16',
        angleDeg: null,
        radiusMm: null,
        description: 'Import via enkel upload',
        sourceFileName: file.name,
        sourceSheet: 'S2_Productgegevens',
        status: 'ready-for-bh18',
        generatedAt: new Date().toISOString(),
      };

      const robotPrep = buildRobotProgramPreparation({
        diameterMm: wm18Definition.diameterMm,
        pressureClass: wm18Definition.pressureClass,
        notes: 'Import via enkel upload',
        category: 'WM18',
        source: 'wm18-excel',
      });

      const documentId = buildWm18ImportDocumentId(file.name);
      const record: TemporaryExcelRecord = {
        id: documentId,
        fileName: file.name,
        storagePath,
        uploadedAt: serverTimestamp(),
        uploadedBy: auth.currentUser?.email || 'unknown',
        source: 'wm18-robot-import',
        notes: 'Import via enkel upload',
        category: 'WM18',
        wm18Definition,
        robotPrep: robotPrep as unknown as Record<string, unknown>,
        importedCatalog: importedWorkbook.catalogItems,
        importedProgramTemplates: importedWorkbook.programTemplates,
      };

      await setDoc(doc(db, COLLECTION_PATH, documentId), record, { merge: true });
      await logActivity(auth.currentUser?.uid || 'unknown', 'TEMP_EXCEL_UPLOAD', `WM18-wikkelrobot import geüpload en vertaald naar FF-catalogus: ${file.name}`);
      const catalogCount = importedWorkbook.catalogItems.length;
      const templateCount = importedWorkbook.programTemplates.length;
      setStatus({
        type: 'success',
        message: `Import voltooid: ${file.name} is vertaald naar FF-catalogus (${catalogCount} artikelregels, ${templateCount} programma-templates) en gekoppeld aan robotpreparatie.`,
      });
      event.target.value = '';
    } catch (error) {
      console.error(error);
      const message = error instanceof Error
        ? error.message
        : 'Upload mislukt';

      setStatus({ type: 'error', message: message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (record: TemporaryExcelRecord) => {
    try {
      await deleteDoc(doc(db, COLLECTION_PATH, record.id));
      setStatus({ type: 'success', message: `Import verwijderd: ${record.fileName}` });
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
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Wikkelrobot instelprogramma</h2>
            <p className="text-sm text-slate-600">Upload en beheer de éénmalige import van het WM18-rekenprogramma als instelprogramma voor de wikkelrobot. De huidige WebUSB-printflow blijft intact.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-700">
            <Upload size={16} className="text-blue-600" /> Nieuwe WM18-import
          </div>
          <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-600">
            <input type="file" accept=".xls,.xlsx,.xlsm,.csv" className="hidden" onChange={handleUpload} />
            <span>{uploading ? 'Bezig met import...' : 'Importeer instelprogramma'}</span>
          </label>
          <p className="text-sm text-slate-600">De geselecteerde Excel of CSV wordt direct geregistreerd als WM18-instelprogramma in Firestore.</p>
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
