// @ts-nocheck

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { DB_PATHS } = require('../config/dbPaths');
const {
  REJECT_ALLOWED_ROLES,
  TEMP_REJECT_ALLOWED_ROLES,
  MANUAL_MOVE_ALLOWED_ROLES,
  PLANNING_ARCHIVE_ALLOWED_ROLES,
  ALLOWED_ARCHIVE_REASONS,
  COMPLETE_ALLOWED_ROLES,
  ALLOWED_FINISH_TYPES,
  CANCEL_ALLOWED_ROLES,
  ORDER_PRIORITY_ALLOWED_ROLES,
  ORDER_CANCEL_ALLOWED_ROLES,
  ORDER_EDIT_ALLOWED_ROLES,
  ALLOWED_ORDER_PRIORITIES,
  OCCUPANCY_ALLOWED_ROLES,
  START_PRODUCTION_ALLOWED_ROLES,
  TRANSITION_ALLOWED_ROLES,
  OVERPRODUCTION_ALLOWED_ROLES,
  ARCHIVE_RESTORE_ALLOWED_ROLES,
} = require('../config/planningConstants');
const { clean, clampText } = require('../utils/text');
const { resolveUserRoleForContext } = require('../auth/resolveUserRole');
const { resolveDbContext } = require('../repositories/planningRepository');
const {
  rejectTrackedProductFinalService,
  archiveRejectedTrackedProductService,
  moveTrackedProductManualService,
  archivePlanningOrderService,
  completeTrackedProductService,
  cancelTrackedProductionService,
  updatePlanningOrderPriorityService,
  movePlanningOrderService,
  retrievePlanningOrderService,
  togglePlanningOrderHoldService,
  updatePlanningOrderDetailsService,
  patchPlanningOrderMetadataService,
  assignOverproductionService,
  tempRejectTrackedProductService,
  advanceTrackedProductService,
  completeTrackedProductRepairService,
  routeTrackedProductsToLossenService,
  toggleTrackedProductPauseService,
  markTrackedProductReminderService,
  startWorkstationProductionRunService,
  cancelPlanningOrderService,
  assignPersonnelToStationService,
  removePersonnelAssignmentService,
  loanPersonnelService,
  startProductionLotsService,
  editTrackedProductLotNumberService,
  reassignTrackedProductOrderService,
  linkPlanningOrderProductService,
  createPlanningOrderManualService,
  markMazakLabelsPrintedService,
  appendQcNoteService,
  reserveAutoLotNumberRangeService,
  saveOccupancyAssignmentsService,
  deleteOccupancyAssignmentsService,
  savePersonnelRecordService,
  addOrderDependencyService,
  removeOrderDependencyService,
  updateOrderPlannedDateService,
  updateOrderKanbanStatusService,
  createProductionMessagesService,
  transitionPrintQueueJobStatusService,
  requeuePrintQueueJobService,
  deletePrintQueueJobService,
  markReadyForNextStepService,
  startTrackedProductRepairService,
  restoreArchivedTrackedProductService,
  reportShopFloorIssueService,
  resolveShopFloorIssueService,
  bulkImportPlanningOrdersService,
  reconcileOrderControlState,
} = require('../services/planning/application');

const { queuePrintJobService } = require('../services/printingService');
const {
  updateUserProfileService,
  clearPasswordChangeFlagService,
  submitAccountRequestService,
  updateUserLanguageService,
} = require('../services/adminService');
const { executeAutomationRuleService } = require('../services/automationService');
const {
  saveProductRecordService,
  deleteProductRecordService,
  verifyProductRecordService,
} = require('../services/productCatalogService');
const {
  upsertConversionRecordService,
  deleteConversionRecordService,
  deleteAllConversionRecordsService,
  upsertConversionBatchService,
} = require('../services/conversionCatalogService');
const { processInforUpdateService } = require('../services/inforSyncService');
const { handleCallableError } = require('../utils/errorHandler');
const { withAudit } = require('../utils/withAudit');
const auditService = require('../services/auditService');
const {
  saveAiContextConfigService,
  createAiDocumentRecordService,
  updateAiDocumentRecordService,
  deleteAiDocumentRecordService,
  verifyAiKnowledgeEntryService,
  deleteAiKnowledgeEntryService,
  migrateAiKnowledgeFieldsService,
} = require('../services/aiAdminService');

const IMPORT_ALLOWED_MODES = new Set(['new_only', 'overwrite', 'smart_update']);
const REFERENCE_OPS_ALLOWED_ROLES = new Set(['admin']);
const REFERENCE_OPS_ALLOWED_TYPES = new Set(['production', 'post', 'qc']);

const extractRds = (data) => {
  const source = data?.runtimeDataSource;
  if (!source || typeof source !== 'object') return null;
  return source;
};

const extractRdsFromSourcePath = () => null;

const resolveRdsForRequest = () => null;

const sanitizeRejectReasons = (rawReasons) => {
  if (!Array.isArray(rawReasons) || rawReasons.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimaal 1 afkeurreden is verplicht.');
  }

  const reasons = rawReasons
    .map((r) => clampText(clean(r), 100))
    .filter(Boolean)
    .slice(0, 8);

  if (!reasons.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimaal 1 geldige afkeurreden is verplicht.');
  }

  return Array.from(new Set(reasons));
};

const throwUnauthenticated = (context, action) => {
  auditService.logCallableSecurityDenied(context, action, 'UNAUTHENTICATED');
  throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
};

const throwPermissionDenied = (context, action, userRole, message) => {
  auditService.logCallableSecurityDenied(context, action, 'PERMISSION_DENIED', {
    role: userRole || 'unknown',
  });
  throw new functions.https.HttpsError('permission-denied', message);
};

const saveProductRecord = withAudit('SAVE_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om producten te bewerken.');
  }

  const productId = clean(data?.productId);
  const productData = (typeof data?.productData === 'object' && data.productData) || {};
  const clearVerification = data?.clearVerification === true;

  auditService.logCallable(context, 'SAVE_PRODUCT', { productId }, { category: 'ADMIN', severity: 'INFO' });

  return saveProductRecordService({
    productId,
    productData,
    actorUid: context.auth.uid,
    clearVerification,
  });
});

const deleteProductRecord = withAudit('DELETE_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om producten te verwijderen.');
  }

  const productId = clean(data?.productId);

  auditService.logCallable(context, 'DELETE_PRODUCT', { productId }, { category: 'ADMIN', severity: 'WARNING' });

  return deleteProductRecordService({ productId });
});

const verifyProductRecord = withAudit('VERIFY_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om producten te verifiëren.');
  }

  const productId = clean(data?.productId);
  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  const actorName = clean(data?.actorName) || clean(context.auth?.token?.name) || clean(context.auth?.token?.email);

  auditService.logCallable(context, 'VERIFY_PRODUCT', { productId }, { category: 'QUALITY', severity: 'INFO' });

  return verifyProductRecordService({
    productId,
    actor: {
      uid: context.auth.uid,
      name: actorName,
      email: clean(context.auth?.token?.email),
    },
    isAdmin: userRole === 'admin',
  });
});

const upsertConversionRecord = withAudit('UPSERT_CONVERSION', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om conversies te bewerken.');
  }

  const recordId = clean(data?.recordId);
  const recordData = (typeof data?.recordData === 'object' && data.recordData) || {};

  auditService.logCallable(context, 'UPSERT_CONVERSION', { recordId }, { category: 'ADMIN', severity: 'INFO' });

  return upsertConversionRecordService({
    recordId,
    recordData,
    actorLabel: clean(context.auth?.token?.email) || context.auth.uid,
  });
});

const deleteConversionRecord = withAudit('DELETE_CONVERSION', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om conversies te verwijderen.');
  }

  const recordId = clean(data?.recordId);

  auditService.logCallable(context, 'DELETE_CONVERSION', { recordId }, { category: 'ADMIN', severity: 'WARNING' });

  return deleteConversionRecordService({ recordId });
});

const deleteAllConversionRecords = withAudit('DELETE_ALL_CONVERSIONS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (userRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Alleen admins kunnen alle conversies verwijderen.');
  }

  auditService.logCallable(context, 'DELETE_ALL_CONVERSIONS', {}, { category: 'ADMIN', severity: 'CRITICAL' });

  return deleteAllConversionRecordsService();
});

const upsertConversionBatch = withAudit('UPSERT_CONVERSION_BATCH', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om conversies te importeren.');
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const mode = clean(data?.mode || 'merge');

  auditService.logCallable(context, 'UPSERT_CONVERSION_BATCH', { itemCount: items.length, mode }, { category: 'ADMIN', severity: 'INFO' });

  return upsertConversionBatchService({
    items,
    mode,
    actorLabel: clean(context.auth?.token?.email) || context.auth.uid,
  });
});

const importReferenceOperations = withAudit('IMPORT_REFERENCE_OPERATIONS', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'IMPORT_REFERENCE_OPERATIONS');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!REFERENCE_OPS_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'IMPORT_REFERENCE_OPERATIONS', userRole, 'Alleen admins mogen LN stamdata importeren.');
  }

  const rawRecords = Array.isArray(data?.records) ? data.records : [];
  if (!rawRecords.length) {
    throw new functions.https.HttpsError('invalid-argument', 'records is verplicht en mag niet leeg zijn.');
  }
  if (rawRecords.length > 5000) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximaal 5000 records per import.');
  }

  const sanitizedRecords = [];
  const seenCodes = new Set();
  for (const entry of rawRecords) {
    const code = clean(entry?.code);
    if (!code || !/^\d{3,10}$/.test(code)) {
      throw new functions.https.HttpsError('invalid-argument', `Ongeldige refOp code: ${String(entry?.code || '')}`);
    }

    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const description = clampText(clean(entry?.description), 200) || code;
    const type = clean(entry?.type).toLowerCase();
    if (!REFERENCE_OPS_ALLOWED_TYPES.has(type)) {
      throw new functions.https.HttpsError('invalid-argument', `Ongeldig type voor ${code}. Verwacht production, post of qc.`);
    }

    const site = clean(entry?.site) || '101';
    if (!(site === '101' || site === '101.0')) {
      throw new functions.https.HttpsError('invalid-argument', `Alleen site 101 is toegestaan. Fout bij ${code}.`);
    }

    const descriptions = Array.isArray(entry?.descriptions)
      ? Array.from(new Set(entry.descriptions.map((value) => clampText(clean(value), 200)).filter(Boolean))).slice(0, 100)
      : [];
    const workCenters = Array.isArray(entry?.workCenters)
      ? Array.from(new Set(entry.workCenters.map((value) => clampText(clean(value), 80)).filter(Boolean))).slice(0, 100)
      : [];

    sanitizedRecords.push({
      code,
      description,
      descriptions,
      type,
      site: '101',
      workCenters,
      updatedAt: new Date().toISOString(),
      updatedBy: context.auth.uid,
    });
  }

  const refOpsCol = admin.firestore().collection(DB_PATHS.REFERENCE_OPERATIONS);
  const existingSnap = await refOpsCol.get();
  const existingCodes = new Set(existingSnap.docs.map((doc) => doc.id));

  const BATCH_SIZE = 450;
  let written = 0;
  let skipped = 0;

  for (let i = 0; i < sanitizedRecords.length; i += BATCH_SIZE) {
    const batch = admin.firestore().batch();
    const chunk = sanitizedRecords.slice(i, i + BATCH_SIZE);
    chunk.forEach((record) => {
      const docRef = refOpsCol.doc(record.code);
      batch.set(docRef, record, { merge: false });
      if (existingCodes.has(record.code)) skipped += 1;
      else written += 1;
    });
    await batch.commit();
  }

  auditService.logCallable(
    context,
    'IMPORT_REFERENCE_OPERATIONS',
    {
      total: sanitizedRecords.length,
      written,
      overwritten: skipped,
      site: '101',
    },
    { category: 'ADMIN', severity: 'WARNING' },
  );

  return {
    ok: true,
    written: sanitizedRecords.length,
    inserted: written,
    overwritten: skipped,
  };
});


module.exports = {
  saveProductRecord,
  deleteProductRecord,
  verifyProductRecord,
  upsertConversionRecord,
  deleteConversionRecord,
  deleteAllConversionRecords,
  upsertConversionBatch,
  importReferenceOperations
};
