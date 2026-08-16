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

const restoreArchivedTrackedProductService = async ({
  productId,
  targetRoute,
  note,
  actorLabel,
  source,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeProductId = clean(productId);
  if (!safeProductId) {
    throw new Error('INVALID_PRODUCT_ID');
  }

  const safeRoute = clean(targetRoute).toUpperCase();
  const allowedRoutes = new Set(['BH31', 'NABEWERKING', 'BM01']);
  if (!allowedRoutes.has(safeRoute)) {
    throw new Error('INVALID_RESTORE_ROUTE');
  }

  const activeDoc = await getTrackedProductDocByIdOrLot(safeProductId, ctx._rds);
  if (activeDoc) {
    throw new Error('ALREADY_ACTIVE_IN_TRACKING');
  }

  const archivedLookup = await findArchivedTrackedProductDocByIdOrLot({
    ctx,
    productId: safeProductId,
  });
  if (!archivedLookup?.doc?.exists) {
    throw new Error('NOT_FOUND_ARCHIVED_PRODUCT');
  }

  const archivedDoc = archivedLookup.doc;
  const archivedData = archivedDoc.data() || {};
  const lotNumber = clean(archivedData.lotNumber) || archivedDoc.id;
  const userLabel = getActorLabel(auth, actorLabel);
  const nowIso = new Date().toISOString();

  const routeMap = {
    BH31: { station: 'BH31', currentStep: 'Reparatie', status: 'Tijdelijke afkeur' },
    NABEWERKING: { station: 'Nabewerking', currentStep: 'Nabewerking', status: 'Te Nabewerken' },
    BM01: { station: 'BM01', currentStep: 'Eindinspectie', status: 'Te Keuren' },
  };
  const route = routeMap[safeRoute];

  const restoredData = {
    ...archivedData,
    lotNumber,
    currentStation: route.station,
    lastStation: clean(archivedData.currentStation) || clean(archivedData.lastStation) || route.station,
    currentStep: route.currentStep,
    status: route.status,
    archivedAt: admin.firestore.FieldValue.delete(),
    archivedReason: admin.firestore.FieldValue.delete(),
    completedBy: admin.firestore.FieldValue.delete(),
    completedByRole: admin.firestore.FieldValue.delete(),
    rejectedBy: admin.firestore.FieldValue.delete(),
    rejectedByRole: admin.firestore.FieldValue.delete(),
    rejectionSource: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    restoredFromArchiveAt: admin.firestore.FieldValue.serverTimestamp(),
    restoredFromArchiveBy: userLabel,
    restoredFromArchiveRoute: safeRoute,
    repairActive: safeRoute === 'BH31',
    inspection: safeRoute === 'BH31'
      ? {
          status: 'Tijdelijke afkeur',
          reasons: ['Herstel na gereedmelding uit archief'],
          timestamp: nowIso,
        }
      : admin.firestore.FieldValue.delete(),
    note: [clampText(archivedData.note, 1200), note ? `Heropend: ${clampText(note, 600)}` : 'Heropend vanuit archief voor herstel']
      .filter(Boolean)
      .join('\n'),
    history: admin.firestore.FieldValue.arrayUnion({
      action: 'Heropend uit archief',
      timestamp: nowIso,
      user: userLabel,
      station: route.station,
      details: `Teruggezet naar ${route.currentStep} (${route.status})${note ? ` - ${clampText(note, 400)}` : ''}`,
      source: source || null,
    }),
  };

  const stepKey = toTimestampStepKey(route.currentStep);
  if (stepKey) {
    restoredData[`timestamps.${stepKey}_start`] = admin.firestore.FieldValue.serverTimestamp();
  }
  if (safeRoute === 'BH31') {
    restoredData['timestamps.repair_start'] = admin.firestore.FieldValue.serverTimestamp();
    restoredData['timestamps.repair_end'] = null;
  }
  if (safeRoute === 'BM01') {
    restoredData['timestamps.bm01_start'] = admin.firestore.FieldValue.serverTimestamp();
  }

  const scopedDepartment = resolveScopedDepartment(
    archivedData.department,
    archivedData.departmentName,
    archivedData.deptName,
    archivedData.departmentId,
    'Fittings',
  );
  const scopedMachine = resolveScopedMachine(route.station, archivedData.machine, archivedData.originMachine);

  const batch = db.batch();
  const rootTrackedRef = db.collection(ctx.trackingPath).doc(lotNumber);
  batch.set(rootTrackedRef, restoredData, { merge: true });

  const scopedTrackedRef = getScopedTrackingDocRef({
    ctx,
    department: scopedDepartment,
    machine: scopedMachine,
    docId: lotNumber,
  });
  if (scopedTrackedRef) {
    batch.set(scopedTrackedRef, restoredData, { merge: true });
  }

  batch.delete(archivedDoc.ref);
  await batch.commit();

  await writeActivityLog({
    auth,
    action: 'QUALITY_RESTORE_FROM_ARCHIVE',
    details: `Lot ${lotNumber} heropend uit archief en gerouteerd naar ${route.station}`,
    source: source || null,
    actorLabel: userLabel,
    actorRole: userRole,
    productId: lotNumber,
    orderId: clean(archivedData.orderId) || null,
    routeStation: route.station,
  });

  return {
    ok: true,
    productId: lotNumber,
    lotNumber,
    currentStation: route.station,
    currentStep: route.currentStep,
    status: route.status,
    restoredFromArchiveYear: archivedLookup.year,
  };
};
const assignOverproductionService = async ({
  targetOrderDocId,
  targetOrderId,
  productIds,
  routeStation,
  sourceOrderId,
  originMachine,
  actorLabel,
  source,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const targetOrderDoc = await getPlanningOrderDocById(targetOrderDocId, ctx._rds);
  if (!targetOrderDoc) {
    throw new Error('NOT_FOUND_TARGET_ORDER');
  }

  const safeTargetOrderId = clean(targetOrderId);
  const safeRouteStation = clean(routeStation);
  const safeSourceOrderId = clean(sourceOrderId);
  const safeOriginMachine = clean(originMachine);
  const userLabel = getActorLabel(auth, actorLabel);
  const routeState = getStepForStationServer(safeRouteStation);
  const productIdList = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((id) => clean(id)).filter(Boolean)));

  if (!safeTargetOrderId || !safeRouteStation || productIdList.length === 0) {
    throw new Error('INVALID_OVERPRODUCTION_PAYLOAD');
  }

  const targetOrderData = targetOrderDoc.data() || {};
  const productSnapshots = await Promise.all(
    productIdList.map(async (productId) => {
      const snap = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
      return snap?.exists ? snap : null;
    })
  );
  const existingProducts = productSnapshots.filter(Boolean);

  if (existingProducts.length === 0) {
    throw new Error('NOT_FOUND_OVERPRODUCTION_PRODUCTS');
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  const sortedProducts = [...existingProducts].sort((a, b) => {
    const aLot = clean(a?.data?.()?.lotNumber) || clean(a?.id);
    const bLot = clean(b?.data?.()?.lotNumber) || clean(b?.id);
    return aLot.localeCompare(bLot);
  });

  const overproductionSeriesGroupId = [
    'OVERPROD',
    safeTargetOrderId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60),
    safeRouteStation.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30),
    nowIso.replace(/[^0-9]/g, '').slice(0, 14),
  ].filter(Boolean).join('_');

  sortedProducts.forEach((productSnap, idx) => {
    batch.set(productSnap.ref, {
      orderId: safeTargetOrderId,
      currentStation: safeRouteStation,
      currentStep: routeState.currentStep || 'Nabewerking',
      status: routeState.status || 'Te Nabewerken',
      seriesGroupId: overproductionSeriesGroupId,
      seriesOrderNumber: safeTargetOrderId,
      seriesSize: sortedProducts.length,
      seriesIndex: idx + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      overproductionResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      overproductionResolvedBy: userLabel,
      overproductionAssignedOrderId: safeTargetOrderId,
      overproductionRoutingStation: safeRouteStation,
      note: `Overproduction linked to order ${safeTargetOrderId} and forwarded to ${safeRouteStation}`,
      'timestamps.overproduction_assigned': admin.firestore.FieldValue.serverTimestamp(),
      'timestamps.routing_override': nowIso,
      history: admin.firestore.FieldValue.arrayUnion({
        action: 'Overproduction Linked',
        timestamp: nowIso,
        user: userLabel,
        station: safeRouteStation,
        details: `Linked to order ${safeTargetOrderId} via ${safeRouteStation}`,
        source: source || null,
      }),
    }, { merge: true });
  });

  batch.set(targetOrderDoc.ref, {
    machine: safeRouteStation,
    status: routeState.status || 'Te Nabewerken',
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    overproductionLinkedCount: admin.firestore.FieldValue.increment(existingProducts.length),
    overproductionLastLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
    overproductionSourceOrderId: safeSourceOrderId || null,
  }, { merge: true });

  if (safeSourceOrderId) {
    const originalOrderDoc = await getPlanningOrderDocByOrderId(safeSourceOrderId, ctx._rds);
    if (originalOrderDoc) {
      const startedField = getSafeStartedField(safeOriginMachine);
      const currentStarted = Number((originalOrderDoc.data() || {})[startedField] || 0);
      if (startedField) {
        batch.set(originalOrderDoc.ref, {
          [startedField]: Math.max(0, currentStarted - existingProducts.length),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  }

  const messageRef = db.collection(`${BASE}/messages`).doc();
  batch.set(messageRef, {
    to: clean(auth?.token?.email).toLowerCase() || 'admin',
    from: 'SYSTEM',
    senderId: 'system-auto',
    subject: `Overproduction linked: ${safeTargetOrderId}`,
    content: `${existingProducts.length} extra products from ${safeSourceOrderId || 'unknown'} have been linked to ${safeTargetOrderId} and forwarded to ${safeRouteStation}.`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    archived: false,
    priority: 'normal',
    type: 'system',
  });

  await batch.commit();

  await writeActivityLog({
    auth,
    action: 'OVERPRODUCTION_ASSIGN',
    details: `Overproduction linked: ${existingProducts.length} pieces from ${safeSourceOrderId || 'unknown'} -> ${safeTargetOrderId}, station ${safeRouteStation}`,
    source: source || null,
    actorLabel: userLabel,
    actorRole: userRole,
    targetOrderId: safeTargetOrderId,
    sourceOrderId: safeSourceOrderId || null,
    routeStation: safeRouteStation,
    linkedCount: existingProducts.length,
  });

  return {
    ok: true,
    targetOrderDocId: targetOrderDoc.id,
    targetOrderId: clean(targetOrderData.orderId) || safeTargetOrderId,
    routeStation: safeRouteStation,
    linkedCount: existingProducts.length,
  };
};

const markTrackedProductReminderService = async ({
  productId,
  reminderSent,
  source,
  actorLabel,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const safeReminderSent = reminderSent !== false;
  const userLabel = getActorLabel(auth, actorLabel);

  await trackedDoc.ref.set({
    reminderSent: safeReminderSent,
    reminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    history: admin.firestore.FieldValue.arrayUnion({
      action: 'Reminder Status Bijgewerkt',
      timestamp: new Date().toISOString(),
      user: userLabel,
      station: clean(trackedDoc.data()?.currentStation) || clean(trackedDoc.data()?.machine) || 'Onbekend',
      details: `reminderSent=${safeReminderSent}`,
      source: source || null,
    }),
  }, { merge: true });

  return {
    ok: true,
    productId: trackedDoc.id,
    reminderSent: safeReminderSent,
  };
};

const editTrackedProductLotNumberService = async ({
  productId,
  newLotNumber,
  reason,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const trackedData = trackedDoc.data() || {};
  const oldLotNumber = clean(trackedData.lotNumber) || trackedDoc.id;
  const safeNewLotNumber = clean(newLotNumber).toUpperCase();
  const safeReason = clampText(reason, 300);

  if (!safeNewLotNumber || !safeReason) {
    throw new Error('INVALID_LOT_EDIT_PAYLOAD');
  }
  if (safeNewLotNumber === oldLotNumber) {
    throw new Error('LOT_NUMBER_UNCHANGED');
  }

  const duplicateSnap = await db
    .collection(ctx.trackingPath)
    .where('lotNumber', '==', safeNewLotNumber)
    .limit(5)
    .get();
  const duplicateExists = duplicateSnap.docs.some((docSnap) => docSnap.id !== trackedDoc.id);
  if (duplicateExists) {
    throw new Error('LOT_NUMBER_EXISTS');
  }

  const userLabel = getActorLabel(auth, actorLabel);
  const historyEntry = {
    action: 'Lotnummer gewijzigd',
    timestamp: new Date().toISOString(),
    station: clean(trackedData.currentStation) || 'Teamleader',
    user: userLabel,
    details: `${oldLotNumber} -> ${safeNewLotNumber} | Reden: ${safeReason}`,
    source: source || null,
  };

  await trackedDoc.ref.set({
    lotNumber: safeNewLotNumber,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    history: admin.firestore.FieldValue.arrayUnion(historyEntry),
  }, { merge: true });

  return {
    ok: true,
    productId: trackedDoc.id,
    oldLotNumber,
    lotNumber: safeNewLotNumber,
    before: {
      lotNumber: oldLotNumber,
    },
    after: {
      lotNumber: safeNewLotNumber,
    },
  };
};

const markMazakLabelsPrintedService = async ({
  productIds,
  stationId,
  isReprint,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((entry) => clean(entry)).filter(Boolean))).slice(0, 200);
  if (ids.length === 0) {
    throw new Error('NO_PRODUCTS_TO_UPDATE');
  }

  const userLabel = getActorLabel(auth, actorLabel);
  const safeStation = clean(stationId) || 'Mazak';
  const batch = db.batch();
  let updatedCount = 0;

  for (const id of ids) {
    const trackedDoc = await getTrackedProductDocByIdOrLot(id, ctx._rds);
    if (!trackedDoc) continue;
    updatedCount += 1;

    batch.set(trackedDoc.ref, {
      mazakLabelPrinted: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion({
        action: isReprint ? 'Label Herprint' : 'Labels Geprint',
        timestamp: new Date().toISOString(),
        user: userLabel,
        station: safeStation,
        details: isReprint ? 'Label opnieuw naar print queue verstuurd' : 'Label(s) verstuurd naar print queue',
        source: source || null,
      }),
    }, { merge: true });
  }

  if (updatedCount === 0) {
    throw new Error('NO_PRODUCTS_FOUND');
  }

  await batch.commit();

  return {
    ok: true,
    updatedCount,
  };
};

const reserveAutoLotNumberRangeService = async ({
  stationId,
  count,
  reserve,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const qty = Math.max(1, parseInt(String(count || 1), 10) || 1);
  if (qty > 200) {
    throw new Error('INVALID_LOT_RANGE_SIZE');
  }

  // path resolved via ctx
  const now = new Date();
  const iso = getISOWeekInfoServer(now);
  const yearShort = String(iso.year).slice(-2);
  const week = String(iso.week).padStart(2, '0');
  const machine = getMachineCodeForLotServer(stationId);
  const baseLot = `40${yearShort}${week}${machine}40`;

  const safeStationId = String(stationId || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const counterDocId = `${safeStationId}_${yearShort}${week}`;
  const counterRef = db.collection(`${BASE}/production/counters`).doc(counterDocId);

  const result = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const counterData = counterSnap.exists ? (counterSnap.data() || {}) : {};

    const lastSequence = Number.isFinite(Number(counterData.lastSequence))
      ? Number(counterData.lastSequence)
      : 0;
    const recycled = Array.isArray(counterData.recycledSequences)
      ? Array.from(new Set(counterData.recycledSequences
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)))
        .sort((a, b) => a - b)
      : [];
    const used = Array.isArray(counterData.usedSequences)
      ? Array.from(new Set(counterData.usedSequences
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)))
        .sort((a, b) => a - b)
      : [];

    const existsInTracking = async (seqStart) => {
      for (let i = 0; i < qty; i += 1) {
        const seq = seqStart + i;
        const candidateLot = `${baseLot}${String(seq).padStart(4, '0')}`;

        // Lotnummers worden als document-id opgeslagen; directe doc-lookup is veel sneller
        // dan een query en voorkomt meerdere index-scans in de transactielus.
        const directDoc = await tx.get(db.collection(ctx.trackingPath).doc(candidateLot));
        if (directDoc.exists) return true;
      }
      return false;
    };

    // Zoek proactief vanaf 1 naar een aaneengesloten gat van `qty` nummers die niet in `used` zitten
    let sequenceToTry = 1;
    let foundStartSeq = false;

    if (qty === 1 && recycled.length > 0) {
      // Als qty === 1 en we hebben expliciet gerecyclede sequences, proberen we die eerst
      for (const recSeq of recycled) {
        const collision = await existsInTracking(recSeq);
        if (!collision) {
          sequenceToTry = recSeq;
          foundStartSeq = true;
          break;
        }
      }
    }

    if (!foundStartSeq) {
      // Zoek vanaf 1 naar een aaneengesloten reeks van `qty` vrije nummers
      for (let candidate = 1; candidate <= lastSequence; candidate += 1) {
        let isRangeFree = true;
        for (let i = 0; i < qty; i += 1) {
          if (used.includes(candidate + i)) {
            isRangeFree = false;
            break;
          }
        }
        if (isRangeFree) {
          const collision = await existsInTracking(candidate);
          if (!collision) {
            sequenceToTry = candidate;
            foundStartSeq = true;
            break;
          }
        }
      }
    }

    if (!foundStartSeq) {
      // Geen gat gevonden, dus we gaan verder na de lastSequence
      sequenceToTry = lastSequence + 1;
    }

    const maxAttempts = 300;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts += 1;

      if (sequenceToTry <= 0 || sequenceToTry + qty - 1 > 9999) {
        sequenceToTry += 1;
        continue;
      }

      const collision = await existsInTracking(sequenceToTry);
      if (!collision) {
        const lotStart = `${baseLot}${String(sequenceToTry).padStart(4, '0')}`;

        if (reserve !== false) {
          const isRecycledSequence = recycled.includes(sequenceToTry);
          const nextRecycled = isRecycledSequence
            ? recycled.filter((n) => n !== sequenceToTry)
            : recycled;
          const newLast = Math.max(lastSequence, sequenceToTry + qty - 1);

          const newlyReserved = Array.from({ length: qty }, (_, idx) => sequenceToTry + idx);
          const nextUsed = Array.from(new Set([...used, ...newlyReserved])).sort((a, b) => a - b);

          tx.set(counterRef, {
            lastSequence: newLast,
            recycledSequences: nextRecycled,
            usedSequences: nextUsed,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        return {
          lotStart,
          baseLot,
          sequence: sequenceToTry,
          week,
          yearShort,
          counterDocId,
          reserved: reserve !== false,
        };
      }

      sequenceToTry += 1;
    }

    throw new Error('NO_UNIQUE_LOT_AVAILABLE');
  });

  if (reserve !== false) {
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const oldIso = getISOWeekInfoServer(twoWeeksAgo);
    const oldDocId = `${safeStationId}_${String(oldIso.year).slice(-2)}${String(oldIso.week).padStart(2, '0')}`;
    if (oldDocId !== result.counterDocId) {
      await db.collection(`${BASE}/production/counters`).doc(oldDocId).delete().catch(() => {});
    }
  }

  return {
    ok: true,
    ...result,
  };
};

const DOWNTIME_COLLECTION = `${BASE}/production/downtime_reports`;
const DEFECTS_COLLECTION = `${BASE}/production/defect_reports`;
const MESSAGES_COLLECTION = `${BASE}/production/messages`;

const createProductionMessagesService = async ({ messages, auth, source, actorLabel, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeMessages = Array.isArray(messages) ? messages.slice(0, 50) : [];
  if (!safeMessages.length) {
    throw new Error('INVALID_MESSAGES_PAYLOAD');
  }

  const actor = getActorLabel(auth, actorLabel);
  let createdCount = 0;

  for (const entry of safeMessages) {
    const rawEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const title = clampText(rawEntry.title, 180);
    const message = clampText(rawEntry.message, 1500);
    const subject = clampText(rawEntry.subject, 180) || title;
    const content = clampText(rawEntry.content, 2000) || message;

    if (!subject && !content && !title && !message) {
      continue;
    }

    const explicitRecipients = uniqueLowercaseEmails([
      ...(Array.isArray(rawEntry.recipients) ? rawEntry.recipients : []),
      rawEntry.to,
    ]);
    const roleRecipients = await resolveTargetRoleEmails(rawEntry.targetRoles);
    const recipients = uniqueLowercaseEmails([...explicitRecipients, ...roleRecipients]);
    const finalRecipients = recipients.length > 0 ? recipients : (rawEntry.broadcastToAll === true ? ['all'] : []);

    if (!finalRecipients.length) {
      continue;
    }

    const payloadBase = {
      senderId: clean(rawEntry.senderId) || auth?.uid || 'system',
      from: clampText(rawEntry.from, 120) || 'SYSTEM',
      subject,
      content,
      title,
      message,
      type: clampText(rawEntry.type, 80) || 'system',
      priority: clampText(rawEntry.priority, 40) || 'normal',
      status: clampText(rawEntry.status, 40) || 'unread',
      read: rawEntry.read === true,
      archived: rawEntry.archived === true,
      source: clampText(rawEntry.source, 80) || clampText(source, 80) || 'BackendCommand',
      relatedLot: rawEntry.relatedLot ? clampText(rawEntry.relatedLot, 120) : null,
      targetGroup: rawEntry.targetGroup ? clampText(rawEntry.targetGroup, 120) : null,
      metadata: sanitizeNestedValue(rawEntry.metadata) || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: auth?.uid || null,
      actorLabel: actor,
    };

    await Promise.all(finalRecipients.map((recipient) => db.collection(MESSAGES_COLLECTION).add({
      ...payloadBase,
      to: recipient,
    })));

    createdCount += finalRecipients.length;
  }

  await writeActivityLog({
    auth,
    action: 'PRODUCTION_MESSAGE_CREATE',
    details: `${createdCount} productieberichten aangemaakt via ${clampText(source, 80) || 'backend-command'}`,
    extra: { source: clampText(source, 80) || null, actorLabel: actor },
  });

  return { ok: true, createdCount };
};


module.exports = {
  restoreArchivedTrackedProductService,
  assignOverproductionService,
  markTrackedProductReminderService,
  editTrackedProductLotNumberService,
  markMazakLabelsPrintedService,
  reserveAutoLotNumberRangeService,
  createProductionMessagesService,
};
