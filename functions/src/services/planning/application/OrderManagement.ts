// @ts-nocheck

const { admin, db } = require('../../../config/firebase');
const { BASE, USER_ACCOUNTS_COLLECTION } = require('../../../config/planningConstants');
const auditService = require('../../auditService');
const {
  resolveDbContext,
  getPlanningOrderDocByOrderId,
  getTrackedProductDocByIdOrLot,
  getPlanningOrderDocById,
} = require('../../../repositories/planningRepository');
const { clean, clampText } = require('../../../utils/text');
const { isPendingLikePrintQueueStatus, isValidPrintQueueTransition } = require('../../printQueueTransitionRules');

const EFFICIENCY_COLLECTION = `${BASE}/production/efficiency_hours`;
const PERSONNEL_COLLECTION = `${BASE}/Users/Personnel`;
const PRINT_QUEUE_COLLECTION = `${BASE}/production/print_queue`;
const SERVER_TIMESTAMP_TOKEN = '__SERVER_TIMESTAMP__';
const DEFAULT_SCOPED_DEPARTMENT = 'Fittings';
const DEFAULT_SCOPED_MACHINE = 'UNASSIGNED';
const CONTROL_EVENTS_READ_LIMIT = 600;
const TRACKING_ORDER_MACHINE_READ_LIMIT = 600;
const ACTIVE_TRACKING_ROOT_LIMIT = 400;
const ACTIVE_TRACKING_SCOPED_LIMIT = 800;
const SCOPED_PRINT_QUEUE_PENDING_LIMIT = 600;
const LN_UPDATABLE_FIELDS_SERVER = [
  'quantity', 'toDoQty', 'plan', 'notes', 'deliveryDate', 'plannedDeliveryDate',
  'weekNumber', 'orderStatus', 'totalPlannedHours', 'totalActualHours',
  'itemDescription', 'item', 'itemCode', 'extraCode', 'drawing',
  'project', 'projectDesc', 'orderCreationDate', 'machine', 'sourceType',
  'operations', 'deliveredQty', 'lnDeliveredQty',
];

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const buildDeliveryInspectionSyncFields = (item = {}) => {
  const deliveredQty =
    toFiniteNumber(item?.lnDeliveredQty) ??
    toFiniteNumber(item?.deliveredQty) ??
    toFiniteNumber(item?.quantityDelivered) ??
    null;

  if (!Number.isFinite(deliveredQty)) {
    return {};
  }

  return {
    lnDeliveredQty: deliveredQty,
    deliveredQty,
    deliveryInspectionLastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
};

const normalizeMachineForCounter = (stationName = '') => {
  const normalized = String(stationName || '').trim().replace(/\s+/g, '').toUpperCase();
  if (/^40(BH|BM|BA)\d+/.test(normalized)) {
    return normalized.slice(2);
  }
  return normalized;
};

const getStartedCounterFieldServer = (stationName = '') => {
  const normalized = normalizeMachineForCounter(stationName);
  if (!normalized) return '';
  const safeKey = normalized.replace(/[^a-zA-Z0-9]/g, '_');
  return `started_${safeKey}`;
};

const normalizeMachineForPlanningServer = (val = '') => {
  let str = clean(val).toUpperCase();
  if (str === 'BM18') str = 'BH18';
  if (str === '40BM18') str = '40BH18';
  return str || '-';
};

const normalizeOrderStatusToken = (value = '') =>
  clean(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const isOnHoldStatusValue = (value = '') => {
  const normalized = normalizeOrderStatusToken(value);
  return normalized === 'on_hold' || normalized === 'hold' || normalized === 'paused';
};

const toFirestoreSegment = (value, fallback) => {
  const sanitized = String(value || '')
    .trim()
    .replace(/[/.#?$\[\]]/g, '_')
    .replace(/\s+/g, '_');
  return sanitized || fallback;
};

const buildReassignedTrackedDocId = ({
  currentDocId,
  newOrderId,
  targetItemCode,
  lotNumber,
}) => {
  const safeCurrentDocId = clean(currentDocId);
  const safeNewOrderId = clean(newOrderId).toUpperCase();
  const safeTargetItemCode = clean(targetItemCode).toUpperCase();
  const safeLotNumber = clean(lotNumber);

  if (!safeCurrentDocId || !safeNewOrderId) return safeCurrentDocId;

  if (safeTargetItemCode && safeLotNumber) {
    return toFirestoreSegment(`${safeNewOrderId}_${safeTargetItemCode}_${safeLotNumber}`, safeCurrentDocId);
  }

  if (safeLotNumber) {
    return toFirestoreSegment(`${safeNewOrderId}_${safeLotNumber}`, safeCurrentDocId);
  }

  const segments = safeCurrentDocId.split('_').filter(Boolean);
  if (segments.length <= 1) {
    const fallback = `${safeNewOrderId}_${safeCurrentDocId}`;
    return toFirestoreSegment(fallback, safeCurrentDocId);
  }

  const tail = segments.slice(1).join('_');
  return toFirestoreSegment(`${safeNewOrderId}_${tail}`, safeCurrentDocId);
};

const resolveScopedDepartment = (...values) => {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return toFirestoreSegment(cleaned, DEFAULT_SCOPED_DEPARTMENT);
  }
  return DEFAULT_SCOPED_DEPARTMENT;
};

const toCanonicalScopedMachineSegment = (value = '') => {
  const normalized = normalizeMachineForPlanningServer(value);
  if (!normalized || normalized === '-') return '';

  if (/^40(BH|BM|BA)\d+$/.test(normalized)) return normalized;
  if (/^(BH|BM|BA)\d+$/.test(normalized)) return `40${normalized}`;
  return normalized;
};

const resolveScopedMachine = (...values) => {
  for (const value of values) {
    const canonical = toCanonicalScopedMachineSegment(value);
    if (canonical) {
      return toFirestoreSegment(canonical, DEFAULT_SCOPED_MACHINE);
    }
  }
  return DEFAULT_SCOPED_MACHINE;
};

const inferDepartmentFromMachine = (machineValue = '') => {
  const normalizedMachine = normalizeMachineForPlanningServer(machineValue);
  if (!normalizedMachine || normalizedMachine === '-') return DEFAULT_SCOPED_DEPARTMENT;

  if (normalizedMachine.includes('SPOOL')) return 'Spools';
  if (/^(40)?BA\d+$/.test(normalizedMachine)) return 'Pipes';
  return 'Fittings';
};

const getScopedPlanningDocRef = ({ ctx, department, machine, docId }) => {
  const safeDocId = clean(docId);
  if (!safeDocId) return null;
  const dep = resolveScopedDepartment(department);
  const mc = resolveScopedMachine(machine);
  return db.doc(`${ctx.planningPath}/${dep}/machines/${mc}/orders/${safeDocId}`);
};

const getScopedTrackingDocRef = ({ ctx, department, machine, docId }) => {
  const safeDocId = clean(docId);
  if (!safeDocId) return null;
  const dep = resolveScopedDepartment(department);
  const mc = resolveScopedMachine(machine);
  return db.doc(`${ctx.trackingPath}/${dep}/machines/${mc}/items/${safeDocId}`);
};

const getScopedOccupancyDocRef = ({ ctx, department, machine, assignmentId }) => {
  const safeAssignmentId = clean(assignmentId);
  if (!safeAssignmentId) return null;
  const dep = resolveScopedDepartment(department);
  const mc = resolveScopedMachine(machine);
  return db.doc(`${ctx.occupancyPath}/${dep}/machines/${mc}/assignments/${safeAssignmentId}`);
};

const getScopedPrintQueueDocRef = ({ ctx, department, machine, docId }) => {
  const safeDocId = clean(docId);
  if (!safeDocId) return null;
  const dep = resolveScopedDepartment(department);
  const mc = resolveScopedMachine(machine);
  return db.doc(`${ctx.printQueuePath}/${dep}/machines/${mc}/items/${safeDocId}`);
};

const getScopedEfficiencyDocRef = ({ ctx, department, machine, docId }) => {
  const safeDocId = clean(docId);
  if (!safeDocId) return null;
  const dep = resolveScopedDepartment(department);
  const mc = resolveScopedMachine(machine);
  return db.doc(`${ctx.efficiencyPath}/${dep}/machines/${mc}/items/${safeDocId}`);
};

// ---------------------------------------------------------------------------
// Production Control Events — controle lijn voor tracked_products
// ---------------------------------------------------------------------------
// Doel: elke substantiële mutatie op een lot (uitgifte, statusovergang,
//       afkeuring, gereedmelding) legt een onweerlegbaar stempel neer in
//       production/events.  Die stempel kan onafhankelijk van tracked_products
//       worden nageteld en vergeleken.  Bij discrepanties wordt een
//       CONTROL_DISCREPANCY event aangemaakt zodat een teamleider dit kan
//       inzien en corrigeren.
// ---------------------------------------------------------------------------

const getScopedEventsCollectionRef = ({ ctx, department, machine }) => {
  const dep = resolveScopedDepartment(department);
  const mc = resolveScopedMachine(machine);
  return db.collection(`${ctx.eventsPath}/${dep}/machines/${mc}/items`);
};

/**
 * Schrijft een controle-event naar production/events.
 * Gooit NOOIT een fout naar de caller — een logging-fout mag nooit de
 * productieflow blokkeren.  Fouten worden alleen geconsole-warned.
 *
 * @param {object} ctx   - resolveDbContext() resultaat
 * @param {string} eventType - bijv. 'LOT_ISSUED' | 'LOT_TRANSITIONED' | 'LOT_COMPLETED' | 'LOT_REJECTED'
 * @param {object} payload - evenement-specifieke velden
 */
const writeProductionControlEvent = async (ctx, eventType, payload = {}) => {
  try {
    const {
      department,
      machine,
      orderId,
      lotNumber,
      operator = 'system',
      extra = {},
    } = payload;

    if (!orderId || !machine) return;

    const colRef = getScopedEventsCollectionRef({ ctx, department, machine });
    const digits = String(lotNumber || '').replace(/\D/g, '');
    const lotMachineCode = digits.length === 15 ? digits.slice(6, 9) : null;

    await colRef.add({
      eventType: String(eventType || 'UNKNOWN').toUpperCase(),
      orderId: clean(orderId),
      lotNumber: clean(lotNumber) || null,
      lotMachineCode,
      machine: clean(machine),
      department: resolveScopedDepartment(department),
      operator: clean(operator) || 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extra,
    });
  } catch (err) {
    console.warn('[writeProductionControlEvent] schrijffout (niet-fataal):', eventType, err?.message);
  }
};

/**
 * Vergelijkt de control events met tracked_products en de planning-teller
 * voor één orderId+machine combinatie.
 *
 * Geeft terug:
 *   { ok, orderId, machine, eventLots, trackedLots, planningCounter, discrepancies }
 *
 * discrepancies is een array van { type, description } objecten.
 * Als ok === true zijn alle tellingen consistent.
 */
const getISOWeekInfoServer = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
};

const getStepForStationServer = (stationName = '') => {
  const name = String(stationName || '').toUpperCase();

  if (name === 'BH31' || name.includes('REPARATIE') || name.includes('REPAIR')) {
    return { status: 'Tijdelijke afkeur', currentStep: 'Reparatie' };
  }
  if (name.includes('OVEN') || name.includes('NAHARD')) {
    return { status: 'Te Naharden', currentStep: 'Naharding' };
  }
  if (name === 'QC') {
    return { status: 'In Productie', currentStep: 'QC' };
  }
  if (name.includes('SHIPPING') || name.includes('VERZEND')) {
    return { status: 'In Productie', currentStep: 'Shipping' };
  }
  if (name.includes('BM01')) return { status: 'Te Keuren', currentStep: 'Eindinspectie' };
  if (name.includes('NABEWERK') || name.includes('MAZAK')) {
    return { status: 'Te Nabewerken', currentStep: 'Nabewerking' };
  }
  if (name === 'LOSSEN') return { status: 'In Productie', currentStep: 'Lossen' };
  if (name.startsWith('BH')) return { status: 'In Productie', currentStep: 'Wikkelen' };

  return { status: 'In Productie', currentStep: 'Onbekend' };
};

const normalizeStationKey = (stationName = '') => {
  return String(stationName || '').trim().replace(/\s+/g, '').toUpperCase();
};

const shouldClearTemporaryInspection = ({ trackedData, nextStation }) => {
  const inspectionStatus = clean(trackedData?.inspection?.status).toLowerCase();
  if (inspectionStatus !== 'tijdelijke afkeur') return false;

  const targetStation = normalizeStationKey(nextStation);

  if (!targetStation) return false;
  return targetStation !== 'BH31';
};

const getActorLabel = (auth, actorLabel) => {
  return actorLabel || clean(auth?.token?.name) || clean(auth?.token?.email) || auth?.uid;
};

const getPriorityLabel = (priorityValue) => {
  if (priorityValue === 'immediate') return '1E PRIO';
  if (priorityValue === 'urgent') return 'SPOED';
  if (priorityValue === 'high') return 'HIGH';
  return 'NORMAAL';
};

const getSafeStartedField = (stationName = '') => {
  const safeKey = String(stationName || '').replace(/[^a-zA-Z0-9]/g, '_');
  return safeKey ? `started_${safeKey}` : '';
};

const getArchiveSearchYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear + 1; y >= Math.max(2020, currentYear - 8); y -= 1) {
    years.push(y);
  }
  return years;
};

const findArchivedPlanningOrderDoc = async ({ ctx, orderDocId, orderId }) => {
  const years = getArchiveSearchYears();
  const lookupDocId = clean(orderDocId);
  const lookupOrderId = clean(orderId);

  for (const year of years) {
    const archiveCollection = db.collection(ctx.archivePlanningPath(year));

    if (lookupDocId) {
      const byDocId = await archiveCollection.doc(lookupDocId).get();
      if (byDocId.exists) {
        return { doc: byDocId, year };
      }
    }

    if (lookupOrderId) {
      const byOrderId = await archiveCollection
        .where('orderId', '==', lookupOrderId)
        .limit(1)
        .get();
      if (!byOrderId.empty) {
        return { doc: byOrderId.docs[0], year };
      }
    }
  }

  return null;
};

const findArchivedTrackedProductDocByIdOrLot = async ({ ctx, productId }) => {
  const safeProductId = clean(productId);
  if (!safeProductId) return null;

  const years = getArchiveSearchYears();

  for (const year of years) {
    const archiveCollection = db.collection(ctx.archiveItemsPath(year));

    const byDocId = await archiveCollection.doc(safeProductId).get();
    if (byDocId.exists) {
      return { doc: byDocId, year };
    }

    const byLot = await archiveCollection
      .where('lotNumber', '==', safeProductId)
      .limit(1)
      .get();
    if (!byLot.empty) {
      return { doc: byLot.docs[0], year };
    }
  }

  return null;
};

const resolvePlanningOrderLocator = async ({
  ctx,
  orderDocId,
  orderDocPath,
  orderSourcePath,
  orderId,
}) => {
  const lookupCandidates = Array.from(new Set([
    clean(orderDocPath),
    clean(orderSourcePath),
    clean(orderDocId),
    clean(orderId),
  ].filter(Boolean)));

  let orderDoc = null;
  for (const candidate of lookupCandidates) {
    orderDoc = await getPlanningOrderDocById(candidate, ctx._rds);
    if (orderDoc) break;
  }

  const orderData = orderDoc?.data() || {};
  const resolvedOrderDocId = clean(orderDoc?.id || orderDocId);
  const resolvedOrderId = clean(orderId || orderData.orderId || orderData.orderNumber);

  return {
    orderDoc,
    orderData,
    resolvedOrderDocId,
    resolvedOrderId,
  };
};

const isOrderNumberAsLot = ({ lotNumber, orderId }) => {
  const safeLot = clean(lotNumber).toUpperCase();
  const safeOrder = clean(orderId).toUpperCase();
  return Boolean(safeLot && safeOrder && safeLot === safeOrder);
};

const assertLotsAreUniqueInActiveTracking = async ({ ctx, lotNumbers }) => {
  const trackingPath = String(ctx?.trackingPath || '').replace(/\/+$/, '');
  const uniqueLots = Array.from(new Set((lotNumbers || []).map((entry) => clean(entry).toUpperCase()).filter(Boolean)));

  for (const lot of uniqueLots) {
    const rootSnap = await db
      .collection(ctx.trackingPath)
      .where('lotNumber', '==', lot)
      .limit(1)
      .get();

    if (!rootSnap.empty) {
      throw new Error('LOT_NUMBER_EXISTS');
    }

    try {
      const scopedSnap = await db
        .collectionGroup('items')
        .where('lotNumber', '==', lot)
        .limit(20)
        .get();

      const scopedExists = scopedSnap.docs.some((docSnap) => String(docSnap.ref?.path || '').startsWith(`${trackingPath}/`));
      if (scopedExists) {
        throw new Error('LOT_NUMBER_EXISTS');
      }
    } catch (scopedErr) {
      if (scopedErr?.message === 'LOT_NUMBER_EXISTS') throw scopedErr;
      // Index nog niet klaar of niet beschikbaar: sla scoped check over (root check hierboven was al ok).
      console.warn('Scoped lot-check overgeslagen wegens index-fout:', scopedErr?.message || String(scopedErr));
    }
  }
};

const isTrackedProductActiveForOrder = (trackedData = {}) => {
  const status = clean(trackedData?.status).toLowerCase();
  const step = clean(trackedData?.currentStep).toLowerCase();
  const station = clean(trackedData?.currentStation).toLowerCase();

  const isClosed =
    ['completed', 'finished', 'gereed', 'rejected', 'afkeur', 'archived_rejected'].includes(status) ||
    ['finished', 'rejected'].includes(step) ||
    station === 'gereed' ||
    Boolean(trackedData?.archivedAt);

  return !isClosed;
};

const countActiveTrackedProductsForOrder = async ({ ctx, orderId }) => {
  const safeOrderId = clean(orderId);
  if (!safeOrderId || safeOrderId === 'NOG_TE_BEPALEN') return 0;

  const rootSnap = await db.collection(ctx.trackingPath)
    .where('orderId', '==', safeOrderId)
    .limit(ACTIVE_TRACKING_ROOT_LIMIT)
    .get();

  let activeCount = rootSnap.docs.reduce((sum, docSnap) => {
    const data = docSnap.data() || {};
    return sum + (isTrackedProductActiveForOrder(data) ? 1 : 0);
  }, 0);

  // Neem scoped tracking mee (collectionGroup items onder /tracked_products/*/machines/*/items)
  // zodat archiveren ook klopt wanneer lots niet in root maar scoped staan.
  try {
    const trackingPath = String(ctx?.trackingPath || '').replace(/\/+$/, '');
    const scopedSnap = await db.collectionGroup('items')
      .where('orderId', '==', safeOrderId)
      .limit(ACTIVE_TRACKING_SCOPED_LIMIT)
      .get();

    const scopedActive = scopedSnap.docs.reduce((sum, docSnap) => {
      const path = String(docSnap.ref?.path || '');
      if (!path.startsWith(`${trackingPath}/`)) return sum;
      const data = docSnap.data() || {};
      return sum + (isTrackedProductActiveForOrder(data) ? 1 : 0);
    }, 0);

    activeCount += scopedActive;
  } catch (scopedErr) {
    // Niet blokkeren als collectionGroup index tijdelijk ontbreekt.
    console.warn('Scoped active-order check overgeslagen wegens index-fout:', scopedErr?.message || String(scopedErr));
  }

  return activeCount;
};

const getMachineCodeForLotServer = (stationName = '') => {
  if (!stationName) return '999';
  const normalized = String(stationName || '').toUpperCase().trim();
  const baseStation = normalized.startsWith('40') ? normalized.substring(2) : normalized;
  const map = {
    BH11: '411',
    BH12: '412',
    BH15: '415',
    BH16: '416',
    BH17: '417',
    BH18: '418',
    BH31: '431',
    BH05: '405',
    BH07: '407',
    BH08: '408',
    BH09: '409',
    BA05: '405',
    BA07: '417',
  };

  if (map[baseStation]) return map[baseStation];

  const digits = baseStation.replace(/\D/g, '');
  if (!digits) return '999';
  if (digits.length === 3) return digits;
  if (digits.length === 1) return `40${digits}`;
  return `4${digits.slice(-2).padStart(2, '0')}`;
};

const sanitizeMeasurements = (rawMeasurements) => {
  if (!rawMeasurements || typeof rawMeasurements !== 'object' || Array.isArray(rawMeasurements)) {
    return null;
  }

  const entries = Object.entries(rawMeasurements)
    .filter(([key]) => clean(key).length > 0)
    .slice(0, 24)
    .map(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) return [String(key), value];
      if (typeof value === 'boolean') return [String(key), value];
      if (value === null) return [String(key), null];
      return [String(key), clampText(String(value || ''), 120)];
    });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const toTimestampStepKey = (stepLabel = '') => {
  const normalized = clean(stepLabel)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'unknown';
};

const toServerTimestampIfRequested = (value) => {
  if (value === SERVER_TIMESTAMP_TOKEN) {
    return admin.firestore.FieldValue.serverTimestamp();
  }
  return value;
};

const assignIfDefined = (target, key, value) => {
  if (value !== undefined) {
    target[key] = value;
  }
};

const sanitizeOccupancyData = (rawData = {}) => {
  const data = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? rawData : {};
  const updates = {};

  assignIfDefined(updates, 'departmentId', data.departmentId === null ? null : clampText(data.departmentId, 80));
  assignIfDefined(updates, 'machineId', data.machineId === null ? null : clampText(data.machineId, 120));
  assignIfDefined(updates, 'operatorNumber', data.operatorNumber === null ? null : clampText(data.operatorNumber, 80));
  assignIfDefined(updates, 'operatorName', data.operatorName === null ? null : clampText(data.operatorName, 140));
  assignIfDefined(updates, 'date', data.date === null ? null : clampText(data.date, 20));
  assignIfDefined(updates, 'shift', data.shift === null ? null : clampText(data.shift, 80));
  assignIfDefined(updates, 'shiftKey', data.shiftKey === null ? null : clampText(data.shiftKey, 40));
  assignIfDefined(updates, 'shiftType', data.shiftType === null ? null : clampText(data.shiftType, 40));
  assignIfDefined(updates, 'primaryStation', data.primaryStation === null ? null : clampText(data.primaryStation, 120));
  assignIfDefined(updates, 'source', data.source === null ? null : clampText(data.source, 80));
  assignIfDefined(updates, 'movedToMachineId', data.movedToMachineId === null ? null : clampText(data.movedToMachineId, 120));
  assignIfDefined(updates, 'loanFromDepartment', data.loanFromDepartment === null ? null : clampText(data.loanFromDepartment, 80));
  assignIfDefined(updates, 'loanFromStation', data.loanFromStation === null ? null : clampText(data.loanFromStation, 120));
  assignIfDefined(updates, 'originalShift', data.originalShift === null ? null : clampText(data.originalShift, 120));
  assignIfDefined(updates, 'shiftStart', data.shiftStart === null ? null : clampText(data.shiftStart, 12));
  assignIfDefined(updates, 'shiftEnd', data.shiftEnd === null ? null : clampText(data.shiftEnd, 12));
  assignIfDefined(updates, 'autoCheckoutShift', data.autoCheckoutShift === null ? null : clampText(data.autoCheckoutShift, 40));
  assignIfDefined(updates, 'timestamp', data.timestamp === null ? null : clampText(data.timestamp, 80));

  ['week', 'weekYear', 'hoursWorked', 'hoursWorkedGross', 'breakDeductedHours'].forEach((key) => {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      const parsed = Number(data[key]);
      if (Number.isFinite(parsed)) updates[key] = parsed;
    } else if (data[key] === null) {
      updates[key] = null;
    }
  });

  ['isPloeg', 'isLoan', 'isSecondary', 'isActive', 'autoCheckout', 'manualHoursOverride'].forEach((key) => {
    if (data[key] !== undefined) updates[key] = Boolean(data[key]);
  });

  ['checkedInAt', 'checkedOutAt', 'updatedAt', 'createdAt', 'startTime', 'manualHoursOverrideAt'].forEach((key) => {
    if (data[key] !== undefined) {
      const mapped = toServerTimestampIfRequested(data[key]);
      updates[key] = mapped;
    }
  });

  if (updates.date && (updates.week === undefined || updates.weekYear === undefined)) {
    const parsedDate = new Date(`${updates.date}T00:00:00.000Z`);
    if (!Number.isNaN(parsedDate.getTime())) {
      const { week, year } = getISOWeekInfoServer(parsedDate);
      if (updates.week === undefined) updates.week = week;
      if (updates.weekYear === undefined) updates.weekYear = year;
    }
  }

  return updates;
};

const sanitizePersonnelData = (rawData = {}) => {
  const data = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? rawData : {};
  const updates = {};

  assignIfDefined(updates, 'name', data.name === null ? null : clampText(data.name, 140));
  assignIfDefined(updates, 'employeeNumber', data.employeeNumber === null ? null : clampText(data.employeeNumber, 80));
  assignIfDefined(updates, 'departmentId', data.departmentId === null ? null : clampText(data.departmentId, 80));
  assignIfDefined(updates, 'linkedUserId', data.linkedUserId === null ? null : clampText(data.linkedUserId, 120));
  assignIfDefined(updates, 'shiftId', data.shiftId === null ? null : clampText(data.shiftId, 80));
  assignIfDefined(updates, 'role', data.role === null ? null : clampText(data.role, 80));
  assignIfDefined(updates, 'currentMachineId', data.currentMachineId === null ? null : clampText(data.currentMachineId, 120));
  assignIfDefined(updates, 'lastBadgeScanBy', data.lastBadgeScanBy === null ? null : clampText(data.lastBadgeScanBy, 120));
  assignIfDefined(updates, 'signature', data.signature === null ? null : clampText(data.signature, 600));

  if (data.isActive !== undefined) updates.isActive = Boolean(data.isActive);
  if (data.temporaryShiftOverride !== undefined && data.temporaryShiftOverride && typeof data.temporaryShiftOverride === 'object' && !Array.isArray(data.temporaryShiftOverride)) {
    updates.temporaryShiftOverride = data.temporaryShiftOverride;
  }
  if (data.loan !== undefined && data.loan && typeof data.loan === 'object' && !Array.isArray(data.loan)) {
    updates.loan = data.loan;
  }

  ['updatedAt', 'createdAt', 'lastBadgeScanAt'].forEach((key) => {
    if (data[key] !== undefined) {
      updates[key] = toServerTimestampIfRequested(data[key]);
    }
  });

  return updates;
};

const sanitizeNestedValue = (value, depth = 0) => {
  if (depth > 4 || value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return clampText(value, 2000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeNestedValue(entry, depth + 1))
      .filter((entry) => entry !== undefined)
      .slice(0, 100);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([key]) => clean(key).length > 0)
      .slice(0, 50)
      .map(([key, nestedValue]) => [String(key), sanitizeNestedValue(nestedValue, depth + 1)])
      .filter(([, nestedValue]) => nestedValue !== undefined);
    return entries.length ? Object.fromEntries(entries) : {};
  }
  return undefined;
};

const uniqueLowercaseEmails = (values = []) => Array.from(new Set(
  values
    .map((value) => clean(value).toLowerCase())
    .filter((value) => value.includes('@'))
));

const resolveTargetRoleEmails = async (targetRoles = []) => {
  const roles = Array.from(new Set(
    (Array.isArray(targetRoles) ? targetRoles : [])
      .map((role) => clean(role).toLowerCase())
      .filter(Boolean)
  )).slice(0, 10);

  if (!roles.length) return [];

  const snapshot = await db
    .collection(USER_ACCOUNTS_COLLECTION)
    .where('role', 'in', roles)
    .get();

  return uniqueLowercaseEmails(
    snapshot.docs.map((userDoc) => userDoc.data()?.email)
  );
};

const writeActivityLog = ({ auth, action, details, source, actorLabel, actorRole, extra = {}, ...entityIds }) => {
  const a = (action || '').toUpperCase();
  const severity = (a.includes('CANCEL') || a.includes('DELETE') || a.includes('REJECT')) ? 'WARNING' : 'INFO';
  let category = 'PRODUCTION';
  if (a.startsWith('QUALITY')) category = 'QUALITY';
  else if (a.startsWith('OCCUPANCY')) category = 'PLANNING';
  else if (a.startsWith('PERSONNEL')) category = 'ADMIN';
  else if (a.startsWith('PRINT')) category = 'SYSTEM';
  const { source: xSrc, actorLabel: xLabel, actorRole: xRole, ...xIds } = extra;
  return auditService.logAction(
    auth?.uid || 'system',
    action,
    {
      details: clampText(details, 1000),
      source: source || xSrc || null,
      actorLabel: actorLabel || xLabel || null,
      actorRole: actorRole || xRole || null,
      ...entityIds,
      ...xIds,
    },
    { category, severity, userEmail: auth?.token?.email || null },
  );
};

const classifyByWcServer = (wc = '') => {
  const upper = String(wc || '').toUpperCase();
  if (upper.includes('BM01') || upper.includes('BA01')) return 'qc';
  if (upper.includes('NABEWERK') || upper.includes('NABEW')) return 'post';
  return null;
};

const loadReferenceOperationsConfigServer = async () => {
  try {
    const snap = await db.collection(`${BASE}/settings/reference_operations`).get();
    const config = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const code = clean(data?.code || docSnap.id);
      const type = clean(data?.type).toLowerCase();
      if (!code || !type) return;
      if (type === 'production' || type === 'post' || type === 'qc') {
        config[code] = type;
      }
    });
    return config;
  } catch (error) {
    console.warn('Reference operations config kon niet geladen worden, fallback actief:', error?.message || String(error));
    return {};
  }
};

const classifyReferenceOperationServer = (refOp, wc, refOpsConfig = null) => {
  const normalizedRefOp = clean(refOp);

  if (refOpsConfig && normalizedRefOp && refOpsConfig[normalizedRefOp]) {
    return refOpsConfig[normalizedRefOp];
  }

  const wcBucket = classifyByWcServer(wc);
  if (wcBucket) return wcBucket;

  const knownTypes = { '1020': 'qc', '1715': 'production', '1740': 'post', '1115': 'post' };
  if (knownTypes[normalizedRefOp]) return knownTypes[normalizedRefOp];

  const digits = Number.parseInt(String(refOp || '').replace(/\D/g, ''), 10);
  if (Number.isNaN(digits)) return 'production';
  const opCode = digits % 100;
  if (opCode === 60) return 'qc';
  if (opCode === 30) return 'post';
  return 'production';
};

const getSplitPlannedHoursServer = (operations, fallbackTotalHours, refOpsConfig = null) => {
  const split = { productionHours: 0, postHours: 0, qcHours: 0 };
  const entries = Object.entries(operations || {});

  if (entries.length === 0) {
    split.productionHours = Number(fallbackTotalHours) || 0;
    return split;
  }

  entries.forEach(([refOp, values]) => {
    const planned = Number(values?.planned || 0);
    const bucket = classifyReferenceOperationServer(refOp, values?.wc, refOpsConfig);
    if (bucket === 'qc') split.qcHours += planned;
    else if (bucket === 'post') split.postHours += planned;
    else split.productionHours += planned;
  });

  if (split.productionHours === 0 && split.postHours === 0 && split.qcHours === 0) {
    split.productionHours = Number(fallbackTotalHours) || 0;
  }

  return split;
};

const buildReferenceOperationSummaryServer = (operations = {}, refOpsConfig = null) => {
  const byCode = {};

  Object.entries(operations || {}).forEach(([refOp, values]) => {
    const planned = Number(values?.planned || 0);
    const actual = Number(values?.actual || 0);
    const wc = normalizeMachineForPlanningServer(values?.wc || '');
    const bucket = classifyReferenceOperationServer(refOp, wc, refOpsConfig);

    byCode[refOp] = {
      plannedHours: planned,
      actualHours: actual,
      workCenter: wc,
      bucket,
    };
  });

  return byCode;
};

const isClosedPlanningStatusServer = (status) => {
  const normalized = clean(status).toLowerCase();
  return ['completed', 'cancelled', 'rejected', 'shipped', 'finished', 'deleted'].includes(normalized);
};

const toPlanningSortMillis = (value) => {
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate();
    const time = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
  }

  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
};

const toOrderDeliveryMillisServer = (orderData = {}) => {
  const candidates = [
    orderData?.deliveryDate,
    orderData?.plannedDeliveryDate,
    orderData?.plannedDate,
    orderData?.orderCreationDate,
  ];

  for (const value of candidates) {
    if (!value) continue;

    if (typeof value.toDate === 'function') {
      const date = value.toDate();
      const millis = date instanceof Date ? date.getTime() : Number.NaN;
      if (Number.isFinite(millis)) return millis;
      continue;
    }

    const date = new Date(value);
    const millis = date.getTime();
    if (Number.isFinite(millis)) return millis;
  }

  return null;
};

const getPlanningOrderRemainingForStationServer = (orderData, stationId) => {
  const stationField = getStartedCounterFieldServer(stationId);
  const plannedAmount = Number(orderData?.plan || orderData?.quantity || 0);
  const startedAmount = Number(orderData?.[stationField] || 0);

  if (!stationField || !Number.isFinite(plannedAmount) || plannedAmount <= 0) {
    return 0;
  }

  return Math.max(0, plannedAmount - startedAmount);
};

const resolveAutoOverproductionRouteStationServer = ({ targetOrderData, sourceItem, originMachine }) => {
  const itemText = `${clean(targetOrderData?.item)} ${clean(sourceItem)}`.toUpperCase().replace(/\s+/g, ' ').trim();
  const machineNorm = normalizeMachineForPlanningServer(targetOrderData?.machine || originMachine);

  if (itemText.startsWith('FL')) {
    return 'Mazak';
  }

  if (machineNorm.includes('PIPE') || itemText.includes('PIPE') || itemText.includes('BUIS')) {
    return '';
  }

  return 'Nabewerking';
};

const findAutoAssignableOverproductionTargetOrder = async ({
  ctx,
  currentOrderDoc,
  currentOrderData,
  originStation,
}) => {
  const currentOrderId = clean(currentOrderData?.orderId);
  const currentItemCode = clean(currentOrderData?.itemCode);
  const currentMachineNorm = normalizeMachineForPlanningServer(currentOrderData?.machine || originStation);
  if (!currentItemCode) return null;

  const candidateDocs = new Map();
  const [rootSnap, scopedSnap] = await Promise.all([
    db.collection(ctx.planningPath).where('itemCode', '==', currentItemCode).limit(80).get(),
    db.collectionGroup('orders').where('itemCode', '==', currentItemCode).limit(80).get(),
  ]);

  rootSnap.docs.forEach((docSnap) => {
    candidateDocs.set(docSnap.ref.path, docSnap);
  });
  scopedSnap.docs.forEach((docSnap) => {
    if (String(docSnap.ref.path || '').startsWith(`${ctx.planningPath}/`)) {
      candidateDocs.set(docSnap.ref.path, docSnap);
    }
  });

  const currentSortMillis = toPlanningSortMillis(
    currentOrderData?.plannedDate || currentOrderData?.deliveryDate || currentOrderData?.orderCreationDate
  );
  const currentDeliveryMillis = toOrderDeliveryMillisServer(currentOrderData);
  const currentSortOrderId = currentOrderId || String(currentOrderDoc?.id || '');

  const candidates = Array.from(candidateDocs.values())
    .filter((docSnap) => String(docSnap.ref.path || '') !== String(currentOrderDoc?.ref?.path || ''))
    .map((docSnap) => ({ docSnap, data: docSnap.data() || {} }))
    .filter(({ data }) => {
      const candidateOrderId = clean(data.orderId);
      const candidateMachineNorm = normalizeMachineForPlanningServer(data.machine || originStation);
      const sameItemCode = clean(data.itemCode) === currentItemCode;

      if (!candidateOrderId || candidateOrderId === currentOrderId) return false;
      if (isClosedPlanningStatusServer(data.status)) return false;
      if (candidateMachineNorm !== currentMachineNorm) return false;
      if (!sameItemCode) return false;
      if (getPlanningOrderRemainingForStationServer(data, originStation) <= 0) return false;

      return true;
    })
    .sort((left, right) => {
      const leftDelivery = toOrderDeliveryMillisServer(left.data);
      const rightDelivery = toOrderDeliveryMillisServer(right.data);
      const leftMillis = leftDelivery ?? Number.MAX_SAFE_INTEGER;
      const rightMillis = rightDelivery ?? Number.MAX_SAFE_INTEGER;
      if (leftMillis !== rightMillis) return leftMillis - rightMillis;
      return String(left.data?.orderId || left.docSnap.id).localeCompare(String(right.data?.orderId || right.docSnap.id));
    });

  const nextCandidate = candidates.find(({ data, docSnap }) => {
    const candidateDelivery = toOrderDeliveryMillisServer(data);
    const candidateMillis = candidateDelivery ?? Number.MAX_SAFE_INTEGER;
    const candidateOrderId = clean(data?.orderId) || String(docSnap.id || '');

    if (currentDeliveryMillis !== null) {
      if (candidateDelivery === null) return false;
      if (candidateDelivery !== currentDeliveryMillis) {
        return candidateDelivery > currentDeliveryMillis;
      }
      return candidateOrderId.localeCompare(currentSortOrderId) > 0;
    }

    if (candidateMillis !== currentSortMillis) {
      return candidateMillis > currentSortMillis;
    }
    return candidateOrderId.localeCompare(currentSortOrderId) > 0;
  });

  if (!nextCandidate) {
    return null;
  }

  const routeStation = resolveAutoOverproductionRouteStationServer({
    targetOrderData: nextCandidate.data,
    sourceItem: clean(currentOrderData?.item),
    originMachine: originStation,
  });

  if (!routeStation) {
    return null;
  }

  return {
    targetOrderDoc: nextCandidate.docSnap,
    targetOrderData: nextCandidate.data,
    routeStation,
  };
};

const getNextFlowStateServer = (eventType = '') => {
  const type = String(eventType || '').toUpperCase();
  if (type === 'START_WINDING') {
    return { currentStep: 'Wikkelen', status: 'In Productie' };
  }
  if (type === 'FINISH_WINDING') {
    return { currentStep: 'Wacht op Lossen', status: 'Te Lossen' };
  }
  return { currentStep: 'Wikkelen', status: 'In Productie' };
};

const getLossenRouteServer = (itemText, originStation = '') => {
  const originNorm = String(originStation || '').toUpperCase().replace(/\s/g, '');
  if (['BH12', 'BH15', 'BH17'].includes(originNorm)) {
    return { mode: 'STATION', station: 'LOSSEN 12/18' };
  }

  const text = String(itemText || '').toUpperCase();
  const isTB = text.includes('TB');
  const isCB = text.includes('CB');
  const isELB = text.includes('ELB');
  const isAB = /\bAB\b/.test(text) || text.includes('ABAB');
  const isSB = /\bSB\b/.test(text);
  const isElbow = isELB || isCB;
  if (isElbow && (isAB || isSB)) return { mode: 'STATION', station: 'LOSSEN' };

  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((match) => Number(match[0]));
  const candidates = numberMatches.filter((value) => Number.isFinite(value) && value >= 25 && value <= 2000);
  const diameter = candidates.length > 0 ? candidates[0] : 0;

  if (isTB && diameter >= 300) return { mode: 'STATION', station: 'LOSSEN' };
  if ((isCB || isELB) && diameter >= 350) return { mode: 'STATION', station: 'LOSSEN' };

  return { mode: 'TAB', station: originNorm || '' };
};

const findPrintQueueJobDocById = async ({ jobId }) => {
  const safeJobId = clean(jobId);
  if (!safeJobId) return null;

  const rootRef = db.collection(PRINT_QUEUE_COLLECTION).doc(safeJobId);
  const rootSnap = await rootRef.get();
  if (rootSnap.exists) return rootSnap;

  // Fallback voor oudere scoped-only jobs.
  const scopedById = await db
    .collectionGroup('items')
    .where('id', '==', safeJobId)
    .limit(20)
    .get();

  const scopedDoc = scopedById.docs.find((snap) => String(snap.ref?.path || '').includes('/print_queue/'));
  if (scopedDoc) return scopedDoc;

  return null;
};

const getPendingPrintQueueDocs = async () => {
  const rootSnap = await db
    .collection(PRINT_QUEUE_COLLECTION)
    .where('status', '==', 'pending')
    .limit(300)
    .get();

  let scopedDocs = [];
  try {
    const scopedSnap = await db
      .collectionGroup('items')
      .where('_scopeType', '==', 'print_queue')
      .limit(SCOPED_PRINT_QUEUE_PENDING_LIMIT)
      .get();

    scopedDocs = scopedSnap.docs;
  } catch (error) {
    // Print queue cleanup is best-effort; canceling production must not fail on index/query limits.
    console.warn('getPendingPrintQueueDocs scoped query skipped:', {
      code: error?.code || null,
      message: error?.message || String(error),
    });
  }

  const byPath = new Map();

  rootSnap.docs.forEach((docSnap) => {
    byPath.set(docSnap.ref.path, docSnap);
  });

  scopedDocs
    .filter((docSnap) => String((docSnap.data() || {}).status || '').toLowerCase() === 'pending')
    .forEach((docSnap) => {
      byPath.set(docSnap.ref.path, docSnap);
    });

  return Array.from(byPath.values());
};

const reconcileOrderControlState = async ({ ctx, orderId, machine }) => {
  const safeOrderId = clean(orderId);
  const safeMachine = clean(machine);
  if (!safeOrderId || !safeMachine) {
    return { ok: false, error: 'MISSING_PARAMS' };
  }

  const dep = resolveScopedDepartment(null, null);
  const mc = resolveScopedMachine(safeMachine, safeMachine);

  // 1. Haal alle LOT_ISSUED events op voor dit order+machine.
  const eventsSnap = await db
    .collection(`${ctx.eventsPath}/${dep}/machines/${mc}/items`)
    .where('orderId', '==', safeOrderId)
    .where('eventType', '==', 'LOT_ISSUED')
    .limit(CONTROL_EVENTS_READ_LIMIT)
    .get();

  const eventLots = eventsSnap.docs
    .map((d) => clean(d.data().lotNumber))
    .filter(Boolean);
  const uniqueEventLots = [...new Set(eventLots)];

  // 2. Haal actieve tracked products op voor dit order+machine.
  const trackingSnap = await db
    .collection(ctx.trackingPath)
    .where('orderId', '==', safeOrderId)
    .where('originMachine', '==', safeMachine)
    .limit(TRACKING_ORDER_MACHINE_READ_LIMIT)
    .get();

  const trackedLots = trackingSnap.docs
    .map((d) => clean(d.data().lotNumber || d.id))
    .filter(Boolean);
  const uniqueTrackedLots = [...new Set(trackedLots)];

  // 3. Haal planning-teller op.
  const orderDoc = await getPlanningOrderDocByOrderId(safeOrderId, ctx._rds);
  const stationField = getStartedCounterFieldServer(safeMachine);
  const planningCounter = orderDoc
    ? Number(orderDoc.data()?.[stationField] || 0)
    : null;

  // 4. Vergelijk.
  const discrepancies = [];

  // Lots in events maar niet in tracking (mogelijke ghost-lots).
  const missingFromTracking = uniqueEventLots.filter((l) => !uniqueTrackedLots.includes(l));
  if (missingFromTracking.length > 0) {
    discrepancies.push({
      type: 'GHOST_LOT',
      description: `Lots in events maar NIET in tracked_products: ${missingFromTracking.join(', ')}`,
      lots: missingFromTracking,
    });
  }

  // Lots in tracking maar niet in events (ongedocumenteerde start).
  const missingFromEvents = uniqueTrackedLots.filter((l) => !uniqueEventLots.includes(l));
  if (missingFromEvents.length > 0) {
    discrepancies.push({
      type: 'UNDOCUMENTED_LOT',
      description: `Lots in tracked_products maar NIET in events: ${missingFromEvents.join(', ')}`,
      lots: missingFromEvents,
    });
  }

  // Planner-teller afwijking.
  if (planningCounter !== null && planningCounter !== uniqueEventLots.length) {
    discrepancies.push({
      type: 'COUNTER_MISMATCH',
      description: `Planning-teller ${stationField}=${planningCounter} maar events telt ${uniqueEventLots.length} unieke lots`,
      planningCounter,
      eventCount: uniqueEventLots.length,
    });
  }

  // Machine-code validatie op lot-nummers uit events.
  const stationNorm = normalizeMachineForCounter(safeMachine);
  const stationDigits = stationNorm.replace(/\D/g, '').slice(0, 3);
  if (stationDigits.length === 3) {
    const wrongMachineLots = uniqueEventLots.filter((l) => {
      const digits = l.replace(/\D/g, '');
      return digits.length === 15 && digits.slice(6, 9) !== stationDigits;
    });
    if (wrongMachineLots.length > 0) {
      discrepancies.push({
        type: 'WRONG_MACHINE_CODE',
        description: `Lots met verkeerde machinecode (verwacht ${stationDigits}): ${wrongMachineLots.join(', ')}`,
        lots: wrongMachineLots,
      });
    }
  }

  const ok = discrepancies.length === 0;

  // Persisteer discrepanties als CONTROL_DISCREPANCY event zodat ze achteraf inzichtelijk zijn.
  if (!ok) {
    try {
      const colRef = getScopedEventsCollectionRef({ ctx, department: null, machine: safeMachine });
      await colRef.add({
        eventType: 'CONTROL_DISCREPANCY',
        orderId: safeOrderId,
        machine: safeMachine,
        department: dep,
        checkedAt: admin.firestore.FieldValue.serverTimestamp(),
        discrepancies,
        summary: `${discrepancies.length} discrepantie(s) gevonden`,
      });
    } catch (err) {
      console.warn('[reconcileOrderControlState] discrepancy-logging mislukt:', err?.message);
    }
  }

  return {
    ok,
    orderId: safeOrderId,
    machine: safeMachine,
    eventLots: uniqueEventLots,
    trackedLots: uniqueTrackedLots,
    planningCounter,
    discrepancies,
  };
};

// ---------------------------------------------------------------------------
// Einde Production Control Events helpers
// ---------------------------------------------------------------------------

const bulkImportPlanningOrdersService = async ({
  orders,
  importMode,
  hoursOnlyMode = false,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeImportMode = String(importMode || 'new_only').trim().toLowerCase();
  const safeHoursOnly = Boolean(hoursOnlyMode);

  let createdCount = 0;
  let updatedCount = 0;
  let processedCount = 0;
  const referenceOpsConfig = await loadReferenceOperationsConfigServer();

  const CHUNK = 350;
  for (let i = 0; i < safeOrders.length; i += CHUNK) {
    const chunk = safeOrders.slice(i, i + CHUNK);
    const batch = db.batch();

    chunk.forEach((rawItem) => {
      const item = rawItem && typeof rawItem === 'object' ? rawItem : null;
      const docId = clean(item?.id);
      if (!item || !docId) return;

      const dbData = { ...item };
      // LN 'Hoeveelheid gereed' is informatief en mag Gemaakt/produced in FF niet overschrijven.
      delete dbData.produced;
      delete dbData.inspectionApprovedQty;
      delete dbData.deliveryInspectionDelta;
      delete dbData.deliveryInspectionMismatch;
      delete dbData.isValidForImport;
      delete dbData.isExistingOrder;
      delete dbData.planningVisible;

      const normalizedItem = clean(dbData.item || dbData.itemDescription || '');
      const normalizedItemDescription = clean(dbData.itemDescription || dbData.item || '');
      const { productionHours, postHours, qcHours } = getSplitPlannedHoursServer(
        item.operations,
        item.totalPlannedHours || 0,
        referenceOpsConfig,
      );
      const operationByCode = buildReferenceOperationSummaryServer(item.operations, referenceOpsConfig);
      const deliveryInspectionSync = buildDeliveryInspectionSyncFields(dbData);

      const isExistingOrder = Boolean(item.isExistingOrder);
      const isSmartUpdate = safeImportMode === 'smart_update' && isExistingOrder;
      const scopedPlanningRef = getScopedPlanningDocRef({
        ctx,
        department: dbData.department || dbData.departmentId || item.department || item.departmentId,
        machine: dbData.machine || item.machine,
        docId,
      });

      if (isSmartUpdate) {
        const lnPayload = {};
        
        // In hoursOnlyMode: ALLEEN uurvelden updaten, geen hoeveelheden/status/notes
        const fieldsToUpdate = safeHoursOnly
          ? ['totalPlannedHours', 'totalActualHours', 'operations']
          : LN_UPDATABLE_FIELDS_SERVER;
        
        fieldsToUpdate.forEach((field) => {
          if (dbData[field] !== undefined) lnPayload[field] = dbData[field];
        });

        const planningPayload = {
          ...lnPayload,
          ...deliveryInspectionSync,
          item: normalizedItem,
          itemDescription: normalizedItemDescription,
          plannedHoursBH: productionHours,
          plannedHoursNabewerken: postHours,
          plannedHoursBM01: qcHours,
          plannedMinutesBH: productionHours * 60,
          plannedMinutesNabewerken: postHours * 60,
          plannedMinutesBM01: qcHours * 60,
          referenceOperationTimes: operationByCode,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (scopedPlanningRef) {
          batch.set(scopedPlanningRef, planningPayload, { merge: true });
        }
      } else {
        const planningPayload = {
          ...dbData,
          ...deliveryInspectionSync,
          item: normalizedItem,
          itemDescription: normalizedItemDescription,
          plannedHoursBH: productionHours,
          plannedHoursNabewerken: postHours,
          plannedHoursBM01: qcHours,
          plannedMinutesBH: productionHours * 60,
          plannedMinutesNabewerken: postHours * 60,
          plannedMinutesBM01: qcHours * 60,
          referenceOperationTimes: operationByCode,
          planningHidden: item.planningVisible === false,
          issuedLotNumbers: [],
          importDate: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (scopedPlanningRef) {
          batch.set(scopedPlanningRef, planningPayload, { merge: true });
        }
      }

      const productionMinutes = productionHours * 60;
      const postProcessingMinutes = postHours * 60;
      const qcMinutes = qcHours * 60;
      const standardMinutes = productionMinutes + postProcessingMinutes;
      const actualMinutes = (Number(item.totalActualHours) || 0) * 60;
      const qty = Number(item.plan) || Number(item.toDoQty) || Number(item.quantity) || 1;

      batch.set(
        db.collection(ctx.efficiencyPath).doc(docId),
        {
          orderId: docId,
          itemCode: clean(item.itemCode),
          itemDescription: normalizedItemDescription,
          machine: clean(item.machine),
          standardTimeTotal: standardMinutes,
          productionTimeTotal: productionMinutes,
          actualTimeTotal: actualMinutes,
          qcTimeTotal: qcMinutes,
          postProcessingTimeTotal: postProcessingMinutes,
          quantity: qty,
          minutesPerUnit: qty > 0 ? standardMinutes / qty : 0,
          status: 'active',
          source: isSmartUpdate ? (safeHoursOnly ? 'ln_hours_sync' : 'ln_smart_sync') : 'ln_import',
          lastSync: new Date().toISOString(),
        },
        { merge: true }
      );

      const scopedEfficiencyRef = getScopedEfficiencyDocRef({
        ctx,
        department: item.department || item.departmentId || DEFAULT_SCOPED_DEPARTMENT,
        machine: item.machine,
        docId,
      });
      if (scopedEfficiencyRef) {
        batch.set(
          scopedEfficiencyRef,
          {
            orderId: docId,
            itemCode: clean(item.itemCode),
            itemDescription: normalizedItemDescription,
            machine: resolveScopedMachine(item.machine),
            standardTimeTotal: standardMinutes,
            productionTimeTotal: productionMinutes,
            actualTimeTotal: actualMinutes,
            qcTimeTotal: qcMinutes,
            postProcessingTimeTotal: postProcessingMinutes,
            quantity: qty,
            minutesPerUnit: qty > 0 ? standardMinutes / qty : 0,
            status: 'active',
            source: isSmartUpdate ? (safeHoursOnly ? 'ln_hours_sync' : 'ln_smart_sync') : 'ln_import',
            lastSync: new Date().toISOString(),
            departmentId: resolveScopedDepartment(item.department || item.departmentId || DEFAULT_SCOPED_DEPARTMENT),
            machineId: resolveScopedMachine(item.machine),
            _scopeType: 'efficiency_hours',
          },
          { merge: true }
        );
      }

      // Auto-learn Productie Tijd Standaarden per product/machine
      const minutesPerUnit = qty > 0 ? standardMinutes / qty : 0;
      if (minutesPerUnit > 0 && item.itemCode && item.machine) {
        const itemCodeClean = clean(item.itemCode);
        const machineClean = clean(item.machine);
        const stdId = `${itemCodeClean}_${machineClean}`;
        
        batch.set(
          db.collection(ctx.standardsPath || `${BASE}/production/time_standards`).doc(stdId),
          {
            itemCode: itemCodeClean,
            machine: machineClean,
            standardMinutes: minutesPerUnit,
            description: normalizedItemDescription || `Auto-imported from LN`,
            source: 'ln_import',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      processedCount += 1;
      if (isExistingOrder) updatedCount += 1;
      else createdCount += 1;
    });

    await batch.commit();
  }

  return {
    ok: true,
    importMode: safeImportMode,
    hoursOnlyMode: safeHoursOnly,
    processedCount,
    createdCount,
    updatedCount,
  };
};

const archivePlanningOrderService = async ({ orderDocId, requestedReason, source, auth, userRole, allowWithActiveProducts = false, dbCtx = null }) => {
  const ctx = dbCtx || resolveDbContext(null);
  const { orderDoc } = await resolvePlanningOrderLocator({ ctx, orderDocId });
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderDoc.data() || {};

  // Blokkeer archivering wanneer er nog actieve tracked products zijn voor deze order,
  // tenzij de aanroeper expliciet wil overrulen (allowWithActiveProducts=true, bijv. bij 'manual' of 'rejected').
  // De order mag pas naar archief als het laatste product bij Eindinspectie goedgekeurd is.
  if (!allowWithActiveProducts && source !== 'auto_on_last_product') {
    const orderIdForCheck = clean(orderData.orderId) || '';
    if (orderIdForCheck && orderIdForCheck !== 'NOG_TE_BEPALEN') {
      const activeCount = await countActiveTrackedProductsForOrder({
        ctx,
        orderId: orderIdForCheck,
      });
      if (activeCount > 0) {
        throw new Error('ACTIVE_PRODUCTS_REMAIN');
      }
    }
  }

  const year = new Date().getFullYear();
  const targetArchiveRef = db.collection(ctx.archivePlanningPath(year)).doc(orderDoc.id);

  const archiveData = {
    ...orderData,
    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    archiveReason: requestedReason,
    archiveYear: year,
    originalStatus: orderData?.status || null,
    archivedFrom: 'digital_planning',
    archivedBy: auth.uid,
    archivedByRole: userRole,
    archiveSource: source || null,
  };

  const batch = db.batch();
  batch.set(targetArchiveRef, archiveData, { merge: true });
  batch.delete(orderDoc.ref);

  // Verwijder ook alle sibling-documenten met hetzelfde orderId of docId in de planning collection.
  // Orders kunnen zowel in het root-pad als in scoped machine-paden bestaan; beide moeten opgeruimd worden.
  const resolvedOrderId = clean(orderData.orderId || orderData.orderNumber || '');
  const lookupId = orderDoc.id;
  if (resolvedOrderId) {
    try {
      const siblingsByOrderId = await db
        .collectionGroup('orders')
        .where('orderId', '==', resolvedOrderId)
        .limit(20)
        .get();
      siblingsByOrderId.docs.forEach((sibDoc) => {
        const sibPath = String(sibDoc.ref.path || '');
        if (sibDoc.ref.path !== orderDoc.ref.path && sibPath.startsWith(ctx.planningPath + '/')) {
          batch.delete(sibDoc.ref);
        }
      });
    } catch (err) {
      console.warn('[archivePlanningOrderService] sibling cleanup overgeslagen:', err?.message || String(err));
    }
    try {
      const siblingsByDocId = await db
        .collectionGroup('orders')
        .where(admin.firestore.FieldPath.documentId(), '==', lookupId)
        .limit(10)
        .get();
      siblingsByDocId.docs.forEach((sibDoc) => {
        const sibPath = String(sibDoc.ref.path || '');
        if (sibDoc.ref.path !== orderDoc.ref.path && sibPath.startsWith(ctx.planningPath + '/')) {
          batch.delete(sibDoc.ref);
        }
      });
    } catch (err) {
      console.warn('[archivePlanningOrderService] sibling docId cleanup overgeslagen:', err?.message || String(err));
    }
  }

  await batch.commit();

  return {
    ok: true,
    orderDocId: orderDoc.id,
    archiveYear: year,
    archiveReason: requestedReason,
  };
};

const updatePlanningOrderPriorityService = async ({
  orderDocId,
  priority,
  productDocId,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const { orderDoc } = await resolvePlanningOrderLocator({ ctx, orderDocId });
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const userLabel = getActorLabel(auth, actorLabel);
  const orderData = orderDoc.data() || {};
  const normalizedPriority = priority === false ? false : clean(priority).toLowerCase();
  const priorityValue = ['high', 'urgent', 'immediate'].includes(normalizedPriority)
    ? normalizedPriority
    : false;
  const nowIso = new Date().toISOString();

  const batch = db.batch();
  batch.set(orderDoc.ref, {
    priority: priorityValue,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  let productHistoryUpdated = false;
  const cleanProductDocId = clean(productDocId);
  if (cleanProductDocId) {
    const planningLikeDoc = await getPlanningOrderDocById(cleanProductDocId, ctx._rds);
    if (planningLikeDoc) {
      batch.set(planningLikeDoc.ref, {
        history: admin.firestore.FieldValue.arrayUnion({
          station: 'PLANNING',
          user: userLabel,
          action: 'Prioriteit Wijziging',
          details: `Prioriteit gewijzigd naar: ${getPriorityLabel(priorityValue)}`,
          time: nowIso,
          source: source || null,
        }),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      productHistoryUpdated = true;
    } else {
      const trackedDoc = await getTrackedProductDocByIdOrLot(cleanProductDocId, ctx._rds);
      if (trackedDoc) {
        batch.set(trackedDoc.ref, {
          history: admin.firestore.FieldValue.arrayUnion({
            station: 'PLANNING',
            user: userLabel,
            action: 'Prioriteit Wijziging',
            details: `Prioriteit gewijzigd naar: ${getPriorityLabel(priorityValue)}`,
            time: nowIso,
            source: source || null,
          }),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        productHistoryUpdated = true;
      }
    }
  }

  await batch.commit();

  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    priority: priorityValue,
    productHistoryUpdated,
  };
};

const retrievePlanningOrderService = async ({ orderDocId, auth, actorLabel, source, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const { orderDoc } = await resolvePlanningOrderLocator({ ctx, orderDocId });
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderDoc.data() || {};
  const nextMachine = clean(orderData.returnStation) || clean(orderData.originalMachine) || 'BH11';
  const nextDepartment = clean(orderData.originalDepartment).toLowerCase() || 'fittings';

  await orderDoc.ref.set({
    machine: nextMachine,
    department: nextDepartment,
    delegatedTo: null,
    status: 'planned',
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    machine: nextMachine,
    department: nextDepartment,
    actorLabel: getActorLabel(auth, actorLabel),
    source: source || null,
  };
};

const updatePlanningOrderDetailsService = async ({
  orderDocId,
  notes,
  plan,
  planDelta,
  started,
  manualTodo,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  let { orderDoc } = await resolvePlanningOrderLocator({
    ctx,
    orderDocId,
    orderId: orderDocId,
  });

  let restoredFromArchive = false;
  let archivedOrderData = null;

  if (!orderDoc) {
    const archivedLookup = await findArchivedPlanningOrderDoc({
      ctx,
      orderDocId,
      orderId: orderDocId,
    });

    if (archivedLookup?.doc?.exists) {
      const archivedDoc = archivedLookup.doc;
      archivedOrderData = archivedDoc.data() || {};

      const basePlan = Number(archivedOrderData.plan || archivedOrderData.quantity || 0);
      const normalizedPlanDelta = Number.isFinite(planDelta) ? planDelta : null;
      const normalizedPlan = Number.isFinite(plan)
        ? plan
        : (normalizedPlanDelta !== null ? Math.max(0, basePlan + normalizedPlanDelta) : basePlan);

      const machine =
        clean(archivedOrderData.machine) ||
        clean(archivedOrderData.originalMachine) ||
        clean(archivedOrderData.returnStation) ||
        DEFAULT_SCOPED_MACHINE;

      const department = resolveScopedDepartment(
        archivedOrderData.department,
        archivedOrderData.departmentName,
        archivedOrderData.departmentId,
        inferDepartmentFromMachine(machine),
      );

      const scopedDocRef = getScopedPlanningDocRef({
        ctx,
        department,
        machine,
        docId: archivedDoc.id,
      });

      if (!scopedDocRef) {
        throw new Error('NOT_FOUND_ORDER');
      }

      const now = new Date();
      const { week, year } = getISOWeekInfoServer(now);
      const produced = Number(archivedOrderData.produced || 0);
      const nextPlan = Number.isFinite(normalizedPlan) ? normalizedPlan : basePlan;
      const currentQuantity = Number(archivedOrderData.quantity || 0);
      const nextQuantity = Math.max(currentQuantity, nextPlan);
      const autoTodo = Math.max(0, nextPlan - produced);

      const restoreUpdates = {
        ...archivedOrderData,
        plan: nextPlan,
        quantity: nextQuantity,
        machine: normalizeMachineForPlanningServer(machine),
        normMachine: normalizeMachineForPlanningServer(machine),
        department,
        departmentId: department,
        status: 'planned',
        archivedAt: admin.firestore.FieldValue.delete(),
        archiveReason: admin.firestore.FieldValue.delete(),
        archiveYear: admin.firestore.FieldValue.delete(),
        originalStatus: admin.firestore.FieldValue.delete(),
        archivedFrom: admin.firestore.FieldValue.delete(),
        archivedBy: admin.firestore.FieldValue.delete(),
        archivedByRole: admin.firestore.FieldValue.delete(),
        archiveSource: admin.firestore.FieldValue.delete(),
        todoAmount: autoTodo,
        toDoQty: autoTodo,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        retrievedFromArchiveAt: admin.firestore.FieldValue.serverTimestamp(),
        retrievedFromArchiveBy: getActorLabel(auth, actorLabel),
        weekNumber: week,
        weekYear: year,
      };

      const batch = db.batch();
      batch.set(scopedDocRef, restoreUpdates, { merge: true });
      batch.delete(archivedDoc.ref);
      await batch.commit();

      await writeActivityLog({
        auth,
        action: 'PLANNING_REOPEN_FROM_ARCHIVE',
        details: `Order ${clean(archivedOrderData.orderId) || archivedDoc.id} heropend uit archief met plan ${nextPlan}.`,
        source: source || 'updatePlanningOrderDetails',
        actorLabel: getActorLabel(auth, actorLabel),
        orderId: clean(archivedOrderData.orderId) || null,
        orderDocId: archivedDoc.id,
      });

      const reopenedSnap = await scopedDocRef.get();
      if (reopenedSnap.exists) {
        orderDoc = reopenedSnap;
        restoredFromArchive = true;
      }
    }
  }

  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderDoc.data() || {};
  let resolvedPlan = Number.isFinite(plan) ? plan : null;
  if (resolvedPlan === null && Number.isFinite(planDelta)) {
    const currentPlan = Number(orderData.plan || orderData.quantity || 0);
    resolvedPlan = Math.max(0, currentPlan + planDelta);
  }

  const updates = {
    notes: clean(notes),
    poText: clean(notes),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (Number.isFinite(resolvedPlan)) {
    updates.plan = resolvedPlan;
    const currentQuantity = Number(orderData?.quantity || 0);
    if (resolvedPlan > currentQuantity) {
      updates.quantity = resolvedPlan;
    }
  }

  if (Number.isFinite(manualTodo)) {
    updates.todoAmountManual = manualTodo;
    updates.todoAmount = manualTodo;
    updates.toDoQty = manualTodo;
  } else if (restoredFromArchive && Number.isFinite(resolvedPlan)) {
    const produced = Number(orderData?.produced || archivedOrderData?.produced || 0);
    const autoTodo = Math.max(0, resolvedPlan - produced);
    updates.todoAmount = autoTodo;
    updates.toDoQty = autoTodo;
    updates.todoAmountManual = admin.firestore.FieldValue.delete();
    updates.status = 'planned';
  }

  if (Number.isFinite(started) && started >= 0) {
    const machine = clean(orderData.machine || orderData.machineId || '');
    const stationField = getStartedCounterFieldServer(machine);
    if (stationField) {
      updates[stationField] = started;
    }
  }

  await orderDoc.ref.set(updates, { merge: true });

  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    notes: updates.notes,
    plan: Number.isFinite(resolvedPlan) ? resolvedPlan : Number(orderData.plan || 0),
    actorLabel: getActorLabel(auth, actorLabel),
    source: source || null,
    restoredFromArchive,
    before: orderData,
    after: { ...orderData, ...updates },
  };
};

const patchPlanningOrderMetadataService = async ({
  orderDocId,
  patch,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const { orderDoc } = await resolvePlanningOrderLocator({ ctx, orderDocId });
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const updates = {};

  if ('articleCode' in safePatch) updates.articleCode = clampText(safePatch.articleCode, 120);
  if ('isConverted' in safePatch) updates.isConverted = Boolean(safePatch.isConverted);
  if ('drawingUrl' in safePatch) updates.drawingUrl = clampText(safePatch.drawingUrl, 1500);
  if ('hasDrawing' in safePatch) updates.hasDrawing = Boolean(safePatch.hasDrawing);
  if ('description' in safePatch) updates.description = clampText(safePatch.description, 600);
  if ('drawing' in safePatch) updates.drawing = clampText(safePatch.drawing, 600);
  if ('lastSync' in safePatch) updates.lastSync = clampText(safePatch.lastSync, 80);
  if ('smartSyncExcluded' in safePatch) updates.smartSyncExcluded = Boolean(safePatch.smartSyncExcluded);
  if ('smartSyncIncluded' in safePatch) updates.smartSyncIncluded = Boolean(safePatch.smartSyncIncluded);
  if ('quantity' in safePatch) {
    const q = Number(safePatch.quantity);
    if (!Number.isFinite(q) || q < 0 || q > 1000000) {
      throw new Error('INVALID_PATCH_QUANTITY');
    }
    updates.quantity = q;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('INVALID_PATCH_PAYLOAD');
  }

  updates.lastUpdated = admin.firestore.FieldValue.serverTimestamp();
  await orderDoc.ref.set(updates, { merge: true });

  const orderData = orderDoc.data() || {};
  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    patchedFields: Object.keys(updates).filter((key) => key !== 'lastUpdated'),
    actorLabel: getActorLabel(auth, actorLabel),
    source: source || null,
  };
};

const createPlanningOrderManualService = async ({
  orderId,
  item,
  machine,
  plan,
  itemCode = '',
  itemDescription = '',
  drawing = '',
  notes = '',
  project = '',
  projectDesc = '',
  extraCode = '',
  plannedDate = '',
  deliveryDate = '',
  totalPlannedHours = 0,
  onlyLabelPrint = false,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeOrderId = clean(orderId);
  const safeItem = clampText(item, 220);
  const safeMachine = clean(machine);
  const safePlan = Number(plan);

  if (!safeOrderId || !safeItem || !safeMachine || !Number.isFinite(safePlan) || safePlan <= 0) {
    throw new Error('INVALID_MANUAL_ORDER_PAYLOAD');
  }

  const existingOrder = await getPlanningOrderDocByOrderId(safeOrderId, ctx._rds);
  if (existingOrder) {
    throw new Error('ORDER_ALREADY_EXISTS');
  }

  const now = new Date();
  const { week, year } = getISOWeekInfoServer(now);
  const scopedMachine = resolveScopedMachine(safeMachine);
  const scopedDepartment = resolveScopedDepartment(inferDepartmentFromMachine(safeMachine));
  const safeDocId = toFirestoreSegment(`${safeOrderId}_${safeItem}`, safeOrderId);
  const newDocRef = getScopedPlanningDocRef({
    ctx,
    department: scopedDepartment,
    machine: scopedMachine,
    docId: safeDocId,
  });

  await newDocRef.set({
    _scopeType: 'planning_order',
    orderId: safeOrderId,
    item: safeItem,
    itemDescription: clean(itemDescription) || safeItem,
    itemCode: clean(itemCode),
    drawing: clean(drawing),
    notes: clean(notes),
    project: clean(project),
    projectDesc: clean(projectDesc),
    extraCode: clean(extraCode),
    plannedDate: plannedDate ? new Date(plannedDate).toISOString() : null,
    deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
    totalPlannedHours: Number(totalPlannedHours) || 0,
    onlyLabelPrint: Boolean(onlyLabelPrint),
    machine: scopedMachine,
    machineId: scopedMachine,
    department: scopedDepartment,
    departmentId: scopedDepartment,
    plan: safePlan,
    quantity: safePlan,
    toDoQty: onlyLabelPrint ? 0 : safePlan,
    status: 'planned',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    week,
    year,
  }, { merge: true });

  return {
    ok: true,
    orderDocId: newDocRef.id,
    orderId: safeOrderId,
  };
};

const addOrderDependencyService = async ({ orderId, dependencyId, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderRef = db.collection(ctx.planningPath).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('NOT_FOUND_ORDER');
  }

  await orderRef.set({
    dependencies: admin.firestore.FieldValue.arrayUnion(dependencyId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

const removeOrderDependencyService = async ({ orderId, dependencyId, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderRef = db.collection(ctx.planningPath).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('NOT_FOUND_ORDER');
  }

  await orderRef.set({
    dependencies: admin.firestore.FieldValue.arrayRemove(dependencyId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

const updateOrderPlannedDateService = async ({ orderId, plannedDate, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderRef = db.collection(ctx.planningPath).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderSnap.data() || {};
  const previousPlannedDate = orderData.plannedDate || null;

  await orderRef.set({
    plannedDate,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    before: {
      plannedDate: previousPlannedDate,
    },
    after: {
      plannedDate,
    },
  };
};

const updateOrderKanbanStatusService = async ({ orderId, status, auth, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderRef = db.collection(ctx.planningPath).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderSnap.data() || {};
  const previousStatus = clean(orderData.status) || null;

  await orderRef.set({
    status,
    statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    statusUpdatedBy: getActorLabel(auth, null),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    before: {
      status: previousStatus,
    },
    after: {
      status,
    },
  };
};


module.exports = {
  reconcileOrderControlState,
  bulkImportPlanningOrdersService,
  archivePlanningOrderService,
  updatePlanningOrderPriorityService,
  retrievePlanningOrderService,
  updatePlanningOrderDetailsService,
  patchPlanningOrderMetadataService,
  createPlanningOrderManualService,
  addOrderDependencyService,
  removeOrderDependencyService,
  updateOrderPlannedDateService,
  updateOrderKanbanStatusService,
};
