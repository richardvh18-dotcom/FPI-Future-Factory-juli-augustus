// @ts-nocheck

const getFirebaseDependencies = (dependencies = {}) => {
  if (dependencies.db && dependencies.admin) {
    return dependencies;
  }

  const { db, admin } = require('../config/firebase');
  return { db, admin };
};

const getDbPaths = (dependencies = {}) => {
  if (dependencies.dbPaths) {
    return dependencies.dbPaths;
  }

  const { DB_PATHS } = require('../config/dbPaths');
  return DB_PATHS;
};

// Bitmap-gebaseerde labels kunnen aanzienlijk groter zijn dan legacy tekst-ZPL.
// Blijf ruim onder Firestore documentlimiet (~1 MiB) maar voorkom onnodige rejects.
const MAX_ZPL_LENGTH = 700000;
const MAX_METADATA_LENGTH = 16000;
const MAX_PRINT_QUANTITY = 200;
const PRINTER_ID_PATTERN = /^[a-zA-Z0-9._:-]{2,80}$/;
const DEFAULT_DEPARTMENT = 'Fittings';
const DEFAULT_MACHINE = 'UNASSIGNED';

/**
 * Sanitize Firestore values (remove undefined, recursive)
 */
const sanitizeFirestoreValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeFirestoreValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nestedValue]) => [key, sanitizeFirestoreValue(nestedValue)])
        .filter(([, nestedValue]) => nestedValue !== undefined)
    );
  }
  return value;
};

const sanitizeSegment = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[/.#?$\[\]]/g, '_')
    .replace(/\s+/g, '_');
  return normalized || fallback;
};

const normalizeMachineToken = (rawValue = '') => {
  let token = String(rawValue || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!token) return '';

  if (token === 'BM18') token = 'BH18';
  if (token === '40BM18') token = '40BH18';

  // Canonical machine segment for scoped print queue paths uses 40-prefix.
  if (/^40(BH|BM|BA)\d+$/.test(token)) return token;
  if (/^(BH|BM|BA)\d+$/.test(token)) return `40${token}`;

  const match = token.match(/(40)?(BH|BM|BA)\d+/);
  if (match) {
    const core = `${match[2]}${String(match[0]).replace(/^(40)?(BH|BM|BA)/, '').replace(/[^0-9]/g, '')}`;
    if (/^(BH|BM|BA)\d+$/.test(core)) return `40${core}`;
  }

  return '';
};

const normalizeTextStationToken = (rawValue = '') => {
  const token = String(rawValue || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!token) return '';

  if (token === 'MAZAK') return 'mazak';
  if (token === 'NABEWERKING') return 'nabewerking';
  if (token === 'LOSSEN') return 'lossen';

  if (/^LOSSEN\d+(?:\/\d+)?$/.test(token)) {
    return token.toLowerCase();
  }

  return '';
};

const inferScopedMachine = (printerId, metadata = {}) => {
  const metadataCandidates = [
    metadata?.machineId,
    metadata?.stationId,
    metadata?.station,
    metadata?.currentStation,
    metadata?.originMachine,
    metadata?.targetPrinterName,
  ];

  for (const candidate of metadataCandidates) {
    const machine = normalizeMachineToken(candidate);
    if (machine) return sanitizeSegment(machine, DEFAULT_MACHINE);

    const textStation = normalizeTextStationToken(candidate);
    if (textStation) return sanitizeSegment(textStation, DEFAULT_MACHINE);
  }

  const printerMachine = normalizeMachineToken(printerId);
  if (printerMachine) return sanitizeSegment(printerMachine, DEFAULT_MACHINE);

  return DEFAULT_MACHINE;
};

const inferScopedDepartment = (metadata = {}) => {
  const candidate = metadata?.departmentId || metadata?.department || DEFAULT_DEPARTMENT;
  return sanitizeSegment(candidate, DEFAULT_DEPARTMENT);
};

/**
 * Queue a print job to the Firestore print queue (server-side)
 *
 * @param {string} printerId - Printer ID (e.g., "BH18-ZEBRA")
 * @param {string} zplData - Raw ZPL code
 * @param {object} metadata - Extra info for logging
 * @param {object} context - Firebase function context with auth
 * @returns {Promise<string>} - Document ID of queued print job
 */
async function queuePrintJobService(printerId, zplData, metadata = {}, context, dependencies = {}) {
  const normalizedPrinterId = String(printerId || '').trim();
  const normalizedZpl = String(zplData || '');
  const requestSource = String(metadata?.source || '').trim().toLowerCase();

  if (requestSource === 'keepalive') {
    return null;
  }

  if (!PRINTER_ID_PATTERN.test(normalizedPrinterId)) {
    throw new Error('Ongeldige printerId.');
  }

  if (!normalizedZpl || normalizedZpl.length > MAX_ZPL_LENGTH) {
    throw new Error('ZPL payload ontbreekt of is te groot.');
  }

  const requestedQuantity = Number(metadata?.quantity ?? metadata?.copies ?? 1);
  if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > MAX_PRINT_QUANTITY) {
    throw new Error(`Aantal labels moet tussen 1 en ${MAX_PRINT_QUANTITY} liggen.`);
  }

  const { db: firestoreDb, admin: firestoreAdmin } = getFirebaseDependencies(dependencies);
  const dbPaths = getDbPaths(dependencies);
  const printQueueCollection = dependencies.dbPaths?.PRINT_QUEUE || dbPaths.PRINT_QUEUE;

  let normalizedMetadata = sanitizeFirestoreValue({
    ...metadata,
    requesterEmail: context.auth?.token?.email || 'unknown',
    requesterName: context.auth?.token?.name || 'unknown',
  }) || {};

  const metadataSize = JSON.stringify(normalizedMetadata || {}).length;
  if (metadataSize > MAX_METADATA_LENGTH) {
    const trimmed = { ...normalizedMetadata };
    delete trimmed.variables;
    delete trimmed.lots;
    delete trimmed.previewData;
    delete trimmed.template;
    delete trimmed.elements;
    trimmed._metadataTrimmed = true;
    trimmed._metadataTrimReason = 'oversized';
    normalizedMetadata = trimmed;
  }

  if (JSON.stringify(normalizedMetadata || {}).length > MAX_METADATA_LENGTH) {
    normalizedMetadata = {
      requesterEmail: context.auth?.token?.email || 'unknown',
      requesterName: context.auth?.token?.name || 'unknown',
      source: String(metadata?.source || ''),
      orderId: String(metadata?.orderId || metadata?.productionOrder || metadata?.jobId || ''),
      lotNumber: String(metadata?.lotNumber || ''),
      quantity: Number(metadata?.quantity ?? metadata?.copies ?? 1),
      _metadataTrimmed: true,
      _metadataTrimReason: 'hard-limit',
    };
  }

  const queueRef = firestoreDb.collection(printQueueCollection);
  const docRef = queueRef.doc();
  const scopedDepartment = inferScopedDepartment(normalizedMetadata || {});
  const scopedMachine = inferScopedMachine(normalizedPrinterId, normalizedMetadata || {});
  const scopedRef = firestoreDb.doc(`${printQueueCollection}/${scopedDepartment}/machines/${scopedMachine}/items/${docRef.id}`);
  const rootRef = queueRef.doc(docRef.id);

  const jobData = {
    id: docRef.id,
    printerId: normalizedPrinterId,
    zpl: normalizedZpl,
    status: 'pending',
    createdAt: firestoreAdmin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth?.uid || 'unknown',
    metadata: normalizedMetadata,
    retryCount: 0,
    departmentId: scopedDepartment,
    machineId: scopedMachine,
    _scopeType: 'print_queue',
  };

  try {
    await scopedRef.set(jobData, { merge: true });
    return docRef.id;
  } catch (scopedError) {
    console.warn('[printingService] Scoped print queue write failed; falling back to root queue document.', scopedError?.message || scopedError);
    try {
      await rootRef.set(jobData, { merge: true });
      return docRef.id;
    } catch (rootError) {
      console.error('[printingService] Both scoped and root print queue writes failed.', rootError?.message || rootError);
      throw rootError;
    }
  }
}

module.exports = {
  queuePrintJobService,
};
