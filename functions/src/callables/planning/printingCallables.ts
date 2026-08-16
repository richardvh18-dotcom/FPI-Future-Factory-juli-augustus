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

const transitionPrintQueueJobStatus = withAudit('TRANSITION_PRINT_QUEUE_JOB_STATUS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor print queue mutaties.');
  }

  const jobId = clean(data?.jobId);
  const status = clean(data?.status);
  const errorMessage = clampText(data?.error, 1000);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  const printerName = clampText(data?.printerName, 120);

  if (!jobId || !status) {
    throw new functions.https.HttpsError('invalid-argument', 'jobId en status zijn verplicht.');
  }

  auditService.logCallable(context, 'TRANSITION_PRINT_JOB', { jobId, status }, { category: 'SYSTEM', severity: 'INFO' });

  try {
    return await transitionPrintQueueJobStatusService({
      jobId,
      status,
      error: errorMessage,
      source,
      actorLabel,
      printerName,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const requeuePrintQueueJob = withAudit('REQUEUE_PRINT_QUEUE_JOB', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor print queue mutaties.');
  }

  const jobId = clean(data?.jobId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!jobId) {
    throw new functions.https.HttpsError('invalid-argument', 'jobId is verplicht.');
  }

  auditService.logCallable(context, 'REQUEUE_PRINT_JOB', { jobId }, { category: 'SYSTEM', severity: 'INFO' });

  try {
    return await requeuePrintQueueJobService({
      jobId,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const deletePrintQueueJob = withAudit('DELETE_PRINT_JOB', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (userRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Alleen admins mogen printjobs verwijderen.');
  }

  const jobId = clean(data?.jobId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!jobId) {
    throw new functions.https.HttpsError('invalid-argument', 'jobId is verplicht.');
  }

  auditService.logCallable(context, 'DELETE_PRINT_JOB', { jobId }, { category: 'ADMIN', severity: 'WARNING' });

  try {
    return await deletePrintQueueJobService({
      jobId,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const markMazakLabelsPrinted = withAudit('MARK_LABELS_PRINTED', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om labelstatus te wijzigen.');
  }

  const productIds = Array.isArray(data?.productIds)
    ? data.productIds.map((entry) => clean(entry)).filter(Boolean).slice(0, 200)
    : [];
  const stationId = clean(data?.stationId);
  const isReprint = Boolean(data?.isReprint);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (productIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'productIds is verplicht.');
  }

  auditService.logCallable(context, 'MARK_LABELS_PRINTED', { productCount: productIds.length, stationId, isReprint }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await markMazakLabelsPrintedService({
      productIds,
      stationId,
      isReprint,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const queuePrintJob = withAudit('PRINT_JOB', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const printerId = clean(data?.printerId);
  const zplData = clean(data?.zplData);
  const metadata = (typeof data?.metadata === 'object' && data.metadata) || {};

  if (!printerId) {
    throw new functions.https.HttpsError('invalid-argument', 'printerId is verplicht.');
  }

  if (!zplData) {
    throw new functions.https.HttpsError('invalid-argument', 'zplData is verplicht.');
  }

  const orderId = clean(metadata?.orderId || metadata?.productionOrder || metadata?.jobId || '');
  const quantity = Number(metadata?.quantity ?? metadata?.copies ?? 1);

  try {
    const jobId = await queuePrintJobService(printerId, zplData, metadata, context);

    auditService.logCallable(
      context,
      'PRINT_JOB',
      {
        jobId,
        printerId,
        orderId: orderId || null,
        quantity: Number.isFinite(quantity) ? quantity : null,
      },
      { category: 'SYSTEM', severity: 'INFO' }
    );

    return jobId;
  } catch (error) {
    auditService.logCallable(
      context,
      'PRINT_JOB_FAILED',
      {
        printerId,
        orderId: orderId || null,
        quantity: Number.isFinite(quantity) ? quantity : null,
        errorCode: clean(error?.code) || 'unknown',
        errorMessage: clean(error?.message) || 'PRINT_JOB_FAILED',
      },
      { category: 'SYSTEM', severity: 'WARNING' }
    );
    handleCallableError(error);
  }
});


module.exports = {
  transitionPrintQueueJobStatus,
  requeuePrintQueueJob,
  deletePrintQueueJob,
  markMazakLabelsPrinted,
  queuePrintJob
};
