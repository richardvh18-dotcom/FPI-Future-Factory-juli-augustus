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

const assignPersonnelToStation = withAudit('ASSIGN_PERSONNEL_TO_STATION', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor personeels-toewijzing.');
  }

  const stationId = clean(data?.stationId);
  const operatorId = clean(data?.operatorId);
  const operatorNumber = clean(data?.operatorNumber);
  const operatorName = clampText(data?.operatorName, 140);
  const date = clean(data?.date);
  const departmentId = clean(data?.departmentId);
  const hoursWorked = Number(data?.hoursWorked);
  const shiftType = clampText(data?.shiftType, 40);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!stationId || !operatorId || !date) {
    throw new functions.https.HttpsError('invalid-argument', 'stationId, operatorId en date zijn verplicht.');
  }

  auditService.logCallable(context, 'ASSIGN_PERSONNEL', { stationId, operatorId, date }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await assignPersonnelToStationService({
      stationId,
      operatorId,
      operatorNumber,
      operatorName,
      date,
      departmentId,
      hoursWorked,
      shiftType,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    throw error;
  }
});

const removePersonnelAssignment = withAudit('REMOVE_PERSONNEL_ASSIGNMENT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor personeels-toewijzing.');
  }

  const assignmentId = clean(data?.assignmentId);
  const stationId = clean(data?.stationId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!assignmentId) {
    throw new functions.https.HttpsError('invalid-argument', 'assignmentId is verplicht.');
  }

  auditService.logCallable(context, 'REMOVE_PERSONNEL', { assignmentId, stationId }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await removePersonnelAssignmentService({
      assignmentId,
      stationId,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const loanPersonnelToDepartment = withAudit('LOAN_PERSONNEL_TO_DEPARTMENT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor personeels-uitlening.');
  }

  const operatorNumber = clean(data?.operatorNumber);
  const operatorName = clampText(data?.operatorName, 140);
  const targetDepartment = clean(data?.targetDepartment);
  const targetStation = clean(data?.targetStation);
  const date = clean(data?.date);
  const shiftLabel = clampText(data?.shiftLabel, 80);
  const shiftStart = clampText(data?.shiftStart, 12);
  const shiftEnd = clampText(data?.shiftEnd, 12);
  const hoursWorked = Number(data?.hoursWorked);
  const isPloeg = Boolean(data?.isPloeg);
  const loanFromDepartment = clean(data?.loanFromDepartment);
  const loanFromStation = clean(data?.loanFromStation);
  const originalShift = clampText(data?.originalShift, 120);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!operatorNumber || !targetDepartment || !targetStation || !date) {
    throw new functions.https.HttpsError('invalid-argument', 'operatorNumber, targetDepartment, targetStation en date zijn verplicht.');
  }

  auditService.logCallable(context, 'LOAN_PERSONNEL', { operatorNumber, targetDepartment, targetStation, date }, { category: 'PRODUCTION', severity: 'INFO' });

  return loanPersonnelService({
    operatorNumber,
    operatorName,
    targetDepartment,
    targetStation,
    date,
    shiftLabel,
    shiftStart,
    shiftEnd,
    hoursWorked,
    isPloeg,
    loanFromDepartment,
    loanFromStation,
    originalShift,
    source,
    actorLabel,
    auth: context.auth,
    userRole,
  });
});

const saveOccupancyAssignments = withAudit('SAVE_OCCUPANCY_ASSIGNMENTS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor occupancy-mutaties.');
  }

  const records = Array.isArray(data?.records) ? data.records : [];
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  auditService.logCallable(context, 'SAVE_OCCUPANCY', { recordCount: records.length }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await saveOccupancyAssignmentsService({
      records,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const deleteOccupancyAssignments = withAudit('DELETE_OCCUPANCY_ASSIGNMENTS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor occupancy-mutaties.');
  }

  const assignmentIds = Array.isArray(data?.assignmentIds) ? data.assignmentIds : [];
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  auditService.logCallable(context, 'DELETE_OCCUPANCY', { assignmentCount: assignmentIds.length }, { category: 'PRODUCTION', severity: 'WARNING' });

  try {
    return await deleteOccupancyAssignmentsService({
      assignmentIds,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const savePersonnelRecord = withAudit('SAVE_PERSONNEL_RECORD', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor personeelsmutaties.');
  }

  const personId = clean(data?.personId);
  const payload = data?.data && typeof data.data === 'object' ? data.data : null;
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!payload) {
    throw new functions.https.HttpsError('invalid-argument', 'data is verplicht.');
  }

  auditService.logCallable(context, 'SAVE_PERSONNEL_RECORD', { personId }, { category: 'ADMIN', severity: 'INFO' });

  try {
    return await savePersonnelRecordService({
      personId,
      data: payload,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});


module.exports = {
  assignPersonnelToStation,
  removePersonnelAssignment,
  loanPersonnelToDepartment,
  saveOccupancyAssignments,
  deleteOccupancyAssignments,
  savePersonnelRecord
};
