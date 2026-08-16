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

const saveAiContextConfig = withAudit('SAVE_AI_CONFIG', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI configuratie te wijzigen.');
  }

  const systemPrompt = String(data?.systemPrompt || '');

  auditService.logCallable(context, 'SAVE_AI_CONFIG', {}, { category: 'ADMIN', severity: 'WARNING' });

  return saveAiContextConfigService({
    systemPrompt,
    actorEmail: clean(context.auth?.token?.email),
  });
});

const createAiDocumentRecord = withAudit('CREATE_AI_DOCUMENT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI documenten te uploaden.');
  }

  const payload = (typeof data?.payload === 'object' && data.payload) || {};

  auditService.logCallable(context, 'CREATE_AI_DOCUMENT', {}, { category: 'ADMIN', severity: 'INFO' });

  return createAiDocumentRecordService({
    payload,
    actorEmail: clean(context.auth?.token?.email),
  });
});

const updateAiDocumentRecord = withAudit('UPDATE_AI_DOCUMENT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI documenten te wijzigen.');
  }

  const docId = clean(data?.docId);
  const patch = (typeof data?.patch === 'object' && data.patch) || {};

  auditService.logCallable(context, 'UPDATE_AI_DOCUMENT', { docId }, { category: 'ADMIN', severity: 'INFO' });

  return updateAiDocumentRecordService({ docId, patch });
});

const deleteAiDocumentRecord = withAudit('DELETE_AI_DOCUMENT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI documenten te verwijderen.');
  }

  const docId = clean(data?.docId);

  auditService.logCallable(context, 'DELETE_AI_DOCUMENT', { docId }, { category: 'ADMIN', severity: 'WARNING' });

  return deleteAiDocumentRecordService({ docId });
});

const verifyAiKnowledgeEntry = withAudit('VERIFY_AI_KNOWLEDGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI training te valideren.');
  }

  const entryId = clean(data?.entryId);
  const correctedAnswer = data?.correctedAnswer || null;

  auditService.logCallable(context, 'VERIFY_AI_KNOWLEDGE', { entryId }, { category: 'ADMIN', severity: 'INFO' });

  return verifyAiKnowledgeEntryService({
    entryId,
    correctedAnswer,
    actorEmail: clean(context.auth?.token?.email),
  });
});

const deleteAiKnowledgeEntry = withAudit('DELETE_AI_KNOWLEDGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI training entries te verwijderen.');
  }

  const entryId = clean(data?.entryId);

  auditService.logCallable(context, 'DELETE_AI_KNOWLEDGE', { entryId }, { category: 'ADMIN', severity: 'WARNING' });

  return deleteAiKnowledgeEntryService({ entryId });
});

const migrateAiKnowledgeFields = withAudit('MIGRATE_AI_KNOWLEDGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (userRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Alleen admins mogen AI kennis migratie uitvoeren.');
  }

  auditService.logCallable(context, 'MIGRATE_AI_KNOWLEDGE', {}, { category: 'ADMIN', severity: 'CRITICAL' });

  return migrateAiKnowledgeFieldsService();
});


module.exports = {
  saveAiContextConfig,
  createAiDocumentRecord,
  updateAiDocumentRecord,
  deleteAiDocumentRecord,
  verifyAiKnowledgeEntry,
  deleteAiKnowledgeEntry,
  migrateAiKnowledgeFields
};
