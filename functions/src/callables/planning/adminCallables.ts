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

const updateUserProfile = withAudit('UPDATE_USER_PROFILE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const profileData = (typeof data?.profileData === 'object' && data.profileData) || {};
  
  if (!profileData.name || !profileData.language) {
    throw new functions.https.HttpsError('invalid-argument', 'name en language zijn verplicht.');
  }

  auditService.logCallable(context, 'UPDATE_USER_PROFILE', { targetUid: context.auth.uid }, { category: 'ADMIN', severity: 'INFO' });

  return updateUserProfileService(context.auth.uid, profileData);
});

const clearPasswordChangeFlag = withAudit('CLEAR_PASSWORD_FLAG', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  auditService.logCallable(context, 'CLEAR_PASSWORD_FLAG', { targetUid: context.auth.uid }, { category: 'ADMIN', severity: 'INFO' });

  return clearPasswordChangeFlagService(context.auth.uid);
});

const submitAccountRequest = withAudit('SUBMIT_ACCOUNT_REQUEST', async (data, context) => {
  const requestData = (typeof data?.requestData === 'object' && data.requestData) || {};

  if (!requestData.name || !requestData.email) {
    throw new functions.https.HttpsError('invalid-argument', 'Naam en e-mailadres zijn verplicht.');
  }

  auditService.logCallable(context, 'SUBMIT_ACCOUNT_REQUEST', { email: requestData.email }, { category: 'SECURITY', severity: 'INFO' });

  return submitAccountRequestService(requestData);
});

const updateUserLanguage = withAudit('UPDATE_USER_LANGUAGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const language = clean(data?.language);

  if (!language) {
    throw new functions.https.HttpsError('invalid-argument', 'language is verplicht.');
  }

  auditService.logCallable(context, 'UPDATE_USER_LANGUAGE', { language }, { category: 'ADMIN', severity: 'INFO' });

  return updateUserLanguageService(context.auth.uid, language);
});

const executeAutomationRule = withAudit('EXECUTE_AUTOMATION_RULE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const rule = (typeof data?.rule === 'object' && data.rule) || null;
  if (!rule) {
    throw new functions.https.HttpsError('invalid-argument', 'rule is verplicht.');
  }

  auditService.logCallable(context, 'EXECUTE_AUTOMATION_RULE', { ruleId: rule?.id || 'unknown' }, { category: 'SYSTEM', severity: 'WARNING' });

  return executeAutomationRuleService(rule);
});

const updateProductionStandard = withAudit('UPDATE_PRODUCTION_STANDARD', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productietijdstandaarden bij te werken.');
  }

  const standardId = clean(data?.standardId);
  const standardMinutes = Number(data?.standardMinutes);
  const autoLearning = (typeof data?.autoLearning === 'object' && data.autoLearning) || null;

  if (!standardId) {
    throw new functions.https.HttpsError('invalid-argument', 'standardId is verplicht.');
  }
  if (!Number.isFinite(standardMinutes) || standardMinutes <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'standardMinutes moet een positief getal zijn.');
  }

  const { db } = require('../config/firebase');
  const dbCtx = resolveDbContext();
  const docRef = db.doc(`${dbCtx.standardsPath}/${standardId}`);

  const before = await docRef.get().then((snap) => snap.exists ? snap.data() : null);

  const patch = {
    standardMinutes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(autoLearning ? { autoLearning } : {}),
  };

  await docRef.set(patch, { merge: true });

  auditService.logCallable(
    context,
    'UPDATE_PRODUCTION_STANDARD',
    { standardId, standardMinutes, before, after: patch },
    { category: 'PRODUCTION', severity: 'INFO' }
  );

  return { ok: true, standardId, standardMinutes };
});


module.exports = {
  updateUserProfile,
  clearPasswordChangeFlag,
  submitAccountRequest,
  updateUserLanguage,
  executeAutomationRule,
  updateProductionStandard
};
