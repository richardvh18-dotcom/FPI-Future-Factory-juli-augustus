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

const rejectTrackedProductFinal = withAudit('REJECT_PRODUCT_FINAL', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!REJECT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor definitieve afkeur.');
  }

  const productId = clean(data?.productId);
  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  const reasons = sanitizeRejectReasons(data?.reasons);
  const note = clampText(data?.note, 600);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  try {
    const result = await rejectTrackedProductFinalService({
      productId,
      reasons,
      note,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'REJECT_PRODUCT_FINAL', 
      { productId, before: result.before || null, after: result.after || null }, 
      { category: 'QUALITY', severity: 'CRITICAL' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const tempRejectTrackedProduct = withAudit('TEMP_REJECT_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TEMP_REJECT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor tijdelijke afkeur.');
  }

  const productId = clean(data?.productId);
  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  const reasons = sanitizeRejectReasons(data?.reasons);
  const note = clampText(data?.note, 600);
  const station = clampText(data?.station, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const previousStep = clampText(data?.previousStep, 120);
  const previousStatus = clampText(data?.previousStatus, 120);
  const source = clampText(data?.source, 80);

  try {
    const result = await tempRejectTrackedProductService({
      productId,
      reasons,
      note,
      station,
      actorLabel,
      previousStep,
      previousStatus,
      source,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'TEMP_REJECT_PRODUCT', 
      { productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'QUALITY', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    const rawMessage = String(error?.message || '').toLowerCase();
    if (rawMessage.includes('document path') || rawMessage.includes('document id') || rawMessage.includes('invalid query')) {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId of documentpad voor annuleren.');
    }

    console.error('cancelTrackedProduction onverwachte fout:', {
      message: error?.message || String(error),
      stack: error?.stack || null,
      productId,
      selectedStation,
      source,
      actorLabel,
    });
    throw error;
  }
});

const advanceTrackedProduct = withAudit('ADVANCE_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor producttransitie.');
  }

  const productId = clean(data?.productId);
  const nextStation = clampText(data?.nextStation, 80);
  const nextStep = clampText(data?.nextStep, 120);
  const nextStatus = clampText(data?.nextStatus, 120);
  const lastStation = clampText(data?.lastStation, 80);
  const note = clampText(data?.note, 600);
  const actorLabel = clampText(data?.actorLabel, 120);
  const previousStep = clampText(data?.previousStep, 120);
  const historyAction = clampText(data?.historyAction, 120);
  const historyDetails = clampText(data?.historyDetails, 600);
  const clearManualMove = Boolean(data?.clearManualMove);
  const source = clampText(data?.source, 80);
  const measurements = data?.measurements && typeof data.measurements === 'object' ? data.measurements : null;

  if (!productId || !nextStep || !nextStatus) {
    throw new functions.https.HttpsError('invalid-argument', 'productId, nextStep en nextStatus zijn verplicht.');
  }

  try {
    const result = await advanceTrackedProductService({
      productId,
      nextStation,
      nextStep,
      nextStatus,
      lastStation,
      note,
      actorLabel,
      previousStep,
      historyAction,
      historyDetails,
      clearManualMove,
      measurements,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ADVANCE_PRODUCT', 
      { productId, nextStep, nextStatus, before: result.before || null, after: result.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const completeTrackedProductRepair = withAudit('COMPLETE_REPAIR', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om reparatie af te ronden.');
  }

  const productId = clean(data?.productId);
  const station = clampText(data?.station, 80);
  const note = clampText(data?.note, 600);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);
  const actions = Array.isArray(data?.actions) ? data.actions.map((entry) => clampText(entry, 120)).filter(Boolean) : [];

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  try {
    const result = await completeTrackedProductRepairService({
      productId,
      station,
      actions,
      note,
      actorLabel,
      source,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'COMPLETE_REPAIR', 
      { productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'QUALITY', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const routeTrackedProductsToLossen = withAudit('ROUTE_TO_LOSSEN', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om naar Lossen te routeren.');
  }

  const productIds = Array.isArray(data?.productIds)
    ? data.productIds.map((entry) => clean(entry)).filter(Boolean).slice(0, 200)
    : [];
  const originStation = clampText(data?.originStation, 80);
  const centralStation = clampText(data?.centralStation, 80);
  const centralOperators = Array.isArray(data?.centralOperators)
    ? data.centralOperators.map((entry) => clampText(entry, 80)).filter(Boolean).slice(0, 50)
    : [];
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (productIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'productIds is verplicht.');
  }

  try {
    const result = await routeTrackedProductsToLossenService({
      productIds,
      originStation,
      centralStation,
      centralOperators,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ROUTE_TO_LOSSEN', 
      { productCount: productIds.length, originStation, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const toggleTrackedProductPause = withAudit('TOGGLE_TRACKED_PRODUCT_PAUSE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om pauzestatus te wijzigen.');
  }

  const productId = clean(data?.productId);
  const note = clampText(data?.note, 600);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  try {
    const result = await toggleTrackedProductPauseService({
      productId,
      note,
      actorLabel,
      source,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'TOGGLE_PRODUCT_PAUSE', 
      { productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const markTrackedProductReminder = withAudit('MARK_TRACKED_PRODUCT_REMINDER', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om reminderstatus te wijzigen.');
  }

  const productId = clean(data?.productId);
  const reminderSent = data?.reminderSent !== false;
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  try {
    const result = await markTrackedProductReminderService({
      productId,
      reminderSent,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'MARK_PRODUCT_REMINDER', 
      { productId, reminderSent, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const moveTrackedProductManual = withAudit('MOVE_TRACKED_PRODUCT_MANUAL', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor handmatige verplaatsing.');
  }

  const productOrLotId = clean(data?.productOrLotId);
  const newStation = clean(data?.newStation);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const isRepairMove = Boolean(data?.isRepairMove);
  const repairInstruction = clampText(data?.repairInstruction, 600);

  if (!productOrLotId || productOrLotId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productOfLotId.');
  }

  if (!newStation || newStation.length > 80) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig doelstation.');
  }

  try {
    const result = await moveTrackedProductManualService({
      productOrLotId,
      newStation,
      source,
      actorLabel,
      isRepairMove,
      repairInstruction,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'MOVE_PRODUCT_MANUAL', 
      { productOrLotId, newStation, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const archiveRejectedTrackedProduct = withAudit('ARCHIVE_REJECTED_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om afkeur af te sluiten.');
  }

  const productId = clean(data?.productId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  try {
    const result = await archiveRejectedTrackedProductService({
      productId,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ARCHIVE_REJECTED_PRODUCT', 
      { productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'QUALITY', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const completeTrackedProduct = withAudit('COMPLETE_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!COMPLETE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor productafronding.');
  }

  const productId = clean(data?.productId);
  const finishType = clean(data?.finishType).toLowerCase();
  const fromStation = clampText(data?.fromStation, 80);
  const note = clampText(data?.note, 600);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  if (!ALLOWED_FINISH_TYPES.has(finishType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Niet-toegestaan finishType. Gebruik "archive", "forward" of "post_inspection".');
  }

  try {
    const result = await completeTrackedProductService({
      productId,
      finishType,
      fromStation,
      note,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'COMPLETE_PRODUCT', 
      { productId, finishType, before: result?.before || null, after: result?.after || null }, 
      { category: 'QUALITY', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const cancelTrackedProduction = withAudit('CANCEL_TRACKED_PRODUCTION', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!CANCEL_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productie te annuleren.');
  }

  const productId = clean(data?.productId);
  const selectedStation = clampText(data?.selectedStation, 80);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  try {
    const result = await cancelTrackedProductionService({
      productId,
      selectedStation,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'CANCEL_PRODUCTION', 
      { productId, selectedStation, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const assignOverproduction = withAudit('ASSIGN_OVERPRODUCTION', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OVERPRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om overproduction te koppelen.');
  }

  const targetOrderDocId = clean(data?.targetOrderDocId);
  const targetOrderId = clean(data?.targetOrderId);
  const routeStation = clean(data?.routeStation);
  const sourceOrderId = clean(data?.sourceOrderId);
  const originMachine = clean(data?.originMachine);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);
  const productIds = Array.isArray(data?.productIds)
    ? data.productIds.map((id) => clean(id)).filter(Boolean).slice(0, 200)
    : [];

  if (!targetOrderDocId || !targetOrderId || !routeStation || productIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'targetOrderDocId, targetOrderId, routeStation en productIds zijn verplicht.');
  }

  try {
    const result = await assignOverproductionService({
      targetOrderDocId,
      targetOrderId,
      productIds,
      routeStation,
      sourceOrderId,
      originMachine,
      actorLabel,
      source,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ASSIGN_OVERPRODUCTION', 
      { targetOrderDocId, productCount: productIds.length, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const startProductionLots = withAudit('START_PRODUCTION_LOTS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  const isVirtualLot = Boolean(data?.isVirtualLot);
  const virtualReason = clampText(data?.virtualReason, 300);
  const normalizedUserRole = clean(userRole).toLowerCase();
  const roleBase = normalizedUserRole.split(/[_\-\s]+/)[0] || normalizedUserRole;
  const isOperatorRole = ['operator', 'op', 'operatorrol', 'production-operator'].includes(normalizedUserRole) || ['operator', 'op', 'operatorrol', 'production-operator'].includes(roleBase);

  if (normalizedUserRole === 'qc' && !isVirtualLot) {
    throw new functions.https.HttpsError('permission-denied', 'QC mag alleen virtuele lots uitgeven.');
  }

  const canStartLots = true;
  if (!canStartLots) {
    console.warn('startProductionLots permission denied', {
      uid: context.auth?.uid || null,
      userRole: normalizedUserRole || 'unknown',
      roleBase,
      isOperatorRole,
      isVirtualLot,
      orderDocId: clean(data?.orderDocId),
      orderId: clean(data?.orderId),
      stationId: clean(data?.stationId),
    });
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productie te starten.');
  }

  const orderDocId = clean(data?.orderDocId);
  const orderDocPath = clean(data?.orderDocPath);
  const orderSourcePath = clean(data?.orderSourcePath);
  const orderId = clean(data?.orderId);
  const itemCode = clean(data?.itemCode);
  const item = clampText(data?.item, 180);
  const lotStart = clean(data?.lotStart);
  const totalToProduce = Number(data?.totalToProduce);
  const stationId = clean(data?.stationId);
  const stationLabel = clampText(data?.stationLabel, 120);
  const actorLabel = clampText(data?.actorLabel, 120);
  const labelZplData = typeof data?.labelZplData === 'string' ? data.labelZplData : '';
  const labelTemplateId = clean(data?.labelTemplateId);
  const seriesGroupId = clean(data?.seriesGroupId);
  const isFlangeSeries = Boolean(data?.isFlangeSeries);
  const lotNumbers = Array.isArray(data?.lotNumbers)
    ? data.lotNumbers.map((entry) => clean(entry)).filter(Boolean)
    : [];
  const hasOrderLocator = Boolean(orderDocId || orderDocPath || orderSourcePath || orderId);
  if (!hasOrderLocator || !itemCode || !lotStart || !stationId) {
    throw new functions.https.HttpsError('invalid-argument', 'order locator (orderDocId/orderDocPath/orderSourcePath/orderId), itemCode, lotStart en stationId zijn verplicht.');
  }

  if (!Number.isFinite(totalToProduce) || totalToProduce < 1 || totalToProduce > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'totalToProduce moet tussen 1 en 200 liggen.');
  }

  try {
    const result = await startProductionLotsService({
      orderDocId,
      orderDocPath,
      orderSourcePath,
      orderId,
      itemCode,
      item,
      lotStart,
      totalToProduce,
      stationId,
      stationLabel,
      actorLabel,
      labelZplData,
      labelTemplateId,
      seriesGroupId,
      isFlangeSeries,
      lotNumbers,
      isVirtualLot,
      virtualReason,
      dbCtx: resolveDbContext(),
    });
    
    auditService.logCallable(
      context, 
      'START_PRODUCTION_LOTS', 
      { orderDocId, orderDocPath, orderSourcePath, orderId, stationId, lotStart, totalToProduce, isVirtualLot, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    const rawMessage = String(error?.message || '').toLowerCase();
    if (
      rawMessage.includes('document path') ||
      rawMessage.includes('document id') ||
      rawMessage.includes('resource path') ||
      rawMessage.includes('even number of segments')
    ) {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldig order documentpad of order-id bij productie-start.');
    }

    // Log altijd vóór handleCallableError, omdat die kan gooien en dan nooit gelogd wordt.
    console.error('startProductionLots fout:', {
      message: error?.message || String(error),
      code: error?.code ?? null,
      stack: error?.stack || null,
      orderDocId,
      orderDocPath,
      orderSourcePath,
      orderId,
      stationId,
      totalToProduce,
    });

    // PERMISSION_DENIED (code 7) van Firestore Admin SDK duidt op een IAM-probleem.
    if (error?.code === 7 || rawMessage.includes('permission_denied') || rawMessage.includes('permission denied')) {
      throw new functions.https.HttpsError('internal', 'Starten van productie is mislukt (Firestore-toegang geweigerd). Controleer de IAM-instellingen.');
    }

    handleCallableError(error);
    throw new functions.https.HttpsError('internal', 'Starten van productie is mislukt.');
  }
});

const editTrackedProductLotNumber = withAudit('EDIT_LOT_NUMBER', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'EDIT_LOT_NUMBER');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'EDIT_LOT_NUMBER', userRole, 'Geen rechten om lotnummer te wijzigen.');
  }

  const productId = clean(data?.productId);
  const newLotNumber = clean(data?.newLotNumber);
  const reason = clampText(data?.reason, 300);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId || !newLotNumber || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'productId, newLotNumber en reason zijn verplicht.');
  }

  try {
    const result = await editTrackedProductLotNumberService({
      productId,
      newLotNumber,
      reason,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });

    auditService.logCallable(
      context,
      'EDIT_LOT_NUMBER',
      {
        productId,
        before: result.before || null,
        after: result.after || null,
        reason,
      },
      { category: 'QUALITY', severity: 'WARNING' },
    );

    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const reassignTrackedProductOrder = withAudit('REASSIGN_TRACKED_PRODUCT_ORDER', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'REASSIGN_TRACKED_PRODUCT_ORDER');
  }

  const userRole = await resolveUserRoleForContext(context);
  const source = clampText(data?.source, 80);
  const isMazakOperatorReassign =
    String(userRole || '').toLowerCase() === 'operator' &&
    source.toLowerCase().startsWith('mazakview');

  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole) && !isMazakOperatorReassign) {
    throwPermissionDenied(context, 'REASSIGN_TRACKED_PRODUCT_ORDER', userRole, 'Geen rechten om product-ordernummer te wijzigen.');
  }

  const productId = clean(data?.productId);
  const newOrderId = clean(data?.newOrderId);
  const targetOrderDocId = clean(data?.targetOrderDocId);
  const targetOrderPath = clean(data?.targetOrderPath);
  const reason = clampText(data?.reason, 300);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!productId || !newOrderId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'productId, newOrderId en reason zijn verplicht.');
  }

  try {
    const result = await reassignTrackedProductOrderService({
      productId,
      newOrderId,
      targetOrderDocId,
      targetOrderPath,
      reason,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });

    auditService.logCallable(
      context,
      'REASSIGN_TRACKED_PRODUCT_ORDER',
      {
        productId,
        before: result.before || null,
        after: result.after || null,
        reason,
      },
      { category: 'PLANNING', severity: 'WARNING' },
    );

    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const linkPlanningOrderProduct = withAudit('LINK_ORDER_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order te koppelen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const productId = clean(data?.productId);
  const productImage = typeof data?.productImage === 'string' ? data.productImage : '';

  if (!orderDocId || !productId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId en productId zijn verplicht.');
  }

  try {
    const result = await linkPlanningOrderProductService({
      orderDocId,
      productId,
      productImage,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'LINK_ORDER_PRODUCT', 
      { orderDocId, productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const appendQcNote = withAudit('APPEND_QC_NOTE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om QC-notities toe te voegen.');
  }

  const productId = clean(data?.productId);
  const note = clampText(data?.note, 800);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);
  const archivedYear = Number(data?.archivedYear);

  if (!productId || !note) {
    throw new functions.https.HttpsError('invalid-argument', 'productId en note zijn verplicht.');
  }

  auditService.logCallable(context, 'APPEND_QC_NOTE', { productId }, { category: 'QUALITY', severity: 'INFO' });

  try {
    return await appendQcNoteService({
      productId,
      note,
      archivedYear: Number.isFinite(archivedYear) ? archivedYear : null,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const reserveAutoLotNumberRange = withAudit('RESERVE_AUTO_LOT_NUMBER_RANGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om lotnummers te reserveren.');
  }

  const stationId = clean(data?.stationId);
  const count = Number(data?.count);
  const reserve = data?.reserve !== false;
  if (!stationId || !Number.isFinite(count) || count < 1 || count > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'stationId en geldige count (1-200) zijn verplicht.');
  }

  auditService.logCallable(context, 'RESERVE_LOT_RANGE', { stationId, count }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await reserveAutoLotNumberRangeService({
      stationId,
      count,
      reserve,
      dbCtx: resolveDbContext(),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const markReadyForNextStep = withAudit('MARK_READY_FOR_NEXT_STEP', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om product gereed te markeren.');
  }

  const productId = clean(data?.productId);
  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  auditService.logCallable(context, 'MARK_READY_FOR_NEXT_STEP', { productId }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await markReadyForNextStepService({
        productId,
        auth: context.auth,
        dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const startTrackedProductRepair = withAudit('START_TRACKED_PRODUCT_REPAIR', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om reparatie te starten.');
  }

  const productId = clean(data?.productId);
  const repairReason = clampText(data?.repairReason, 500);
  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  auditService.logCallable(context, 'START_REPAIR', { productId }, { category: 'QUALITY', severity: 'INFO' });

  try {
    return await startTrackedProductRepairService({
      productId,
      repairReason,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const restoreArchivedTrackedProduct = withAudit('RESTORE_ARCHIVED_TRACKED_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ARCHIVE_RESTORE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Alleen teamleader/admin mag gearchiveerde producten herstellen.');
  }

  const productId = clean(data?.productId);
  const targetRoute = clean(data?.targetRoute).toUpperCase();
  const note = clampText(data?.note, 600);
  const sourceContext = clean(data?.sourceContext).toUpperCase();

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }
  if (!['BH31', 'NABEWERKING', 'BM01'].includes(targetRoute)) {
    throw new functions.https.HttpsError('invalid-argument', 'targetRoute moet BH31, NABEWERKING of BM01 zijn.');
  }
  if (sourceContext !== 'TEAMLEADER_FULL_LIST') {
    throw new functions.https.HttpsError('permission-denied', 'Deze actie kan alleen vanuit Teamleader Volledige Lijst.');
  }

  auditService.logCallable(
    context,
    'RESTORE_ARCHIVED_TRACKED_PRODUCT',
    { productId, targetRoute, sourceContext },
    { category: 'QUALITY', severity: 'WARNING' },
  );

  try {
    return await restoreArchivedTrackedProductService({
      productId,
      targetRoute,
      note,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const reportShopFloorIssue = withAudit('REPORT_SHOP_FLOOR_ISSUE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om meldingen te registreren.');
  }

  const type = clean(data?.type);
  const machine = clampText(data?.machine, 120);
  const orderId = clean(data?.orderId);
  const lotNumber = clean(data?.lotNumber);
  const description = clampText(data?.description, 1000);
  const operatorName = clampText(data?.operatorName, 120);

  if (!['downtime', 'defect'].includes(type)) {
    throw new functions.https.HttpsError('invalid-argument', 'type moet downtime of defect zijn.');
  }

  auditService.logCallable(context, 'REPORT_SHOP_FLOOR_ISSUE', { type, machine: clampText(data?.machine, 120), orderId: clean(data?.orderId) }, { category: 'QUALITY', severity: 'WARNING' });

  return reportShopFloorIssueService({
    type,
    machine,
    orderId,
    lotNumber,
    description,
    operatorName,
    auth: context.auth,
  });
});

const resolveShopFloorIssue = withAudit('RESOLVE_SHOP_FLOOR_ISSUE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om meldingen op te lossen.');
  }

  const type = clean(data?.type);
  const issueId = clean(data?.issueId);
  if (!type || !issueId) {
    throw new functions.https.HttpsError('invalid-argument', 'type en issueId zijn verplicht.');
  }

  auditService.logCallable(context, 'RESOLVE_SHOP_FLOOR_ISSUE', { type, issueId }, { category: 'QUALITY', severity: 'INFO' });

  try {
    return await resolveShopFloorIssueService({
        type,
        issueId,
        auth: context.auth,
        dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});


module.exports = {
  rejectTrackedProductFinal,
  tempRejectTrackedProduct,
  advanceTrackedProduct,
  completeTrackedProductRepair,
  routeTrackedProductsToLossen,
  toggleTrackedProductPause,
  markTrackedProductReminder,
  moveTrackedProductManual,
  archiveRejectedTrackedProduct,
  completeTrackedProduct,
  cancelTrackedProduction,
  assignOverproduction,
  startProductionLots,
  editTrackedProductLotNumber,
  reassignTrackedProductOrder,
  linkPlanningOrderProduct,
  appendQcNote,
  reserveAutoLotNumberRange,
  markReadyForNextStep,
  startTrackedProductRepair,
  restoreArchivedTrackedProduct,
  reportShopFloorIssue,
  resolveShopFloorIssue
};
