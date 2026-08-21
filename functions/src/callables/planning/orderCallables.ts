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
const { validateCallableData } = require('../../utils/validatedCallable');
const { planningOrderLookupCallableSchema } = require('../../utils/callableSchemas');
const { reconcileOrderCallableSchema } = require('../../utils/callableSchemas');
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

const startWorkstationProductionRun = withAudit('START_WORKSTATION_PRODUCTION_RUN', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productie te starten.');
  }

  const orderDocId = clean(data?.orderDocId);
  const commandId = clean(data?.commandId);
  const lotStart = clean(data?.lotStart);
  const stringCount = Number(data?.stringCount);
  const stationId = clean(data?.stationId);
  const actorLabel = clampText(data?.actorLabel, 120);
  const labelZplData = typeof data?.labelZplData === 'string' ? data.labelZplData : '';
  const labelTemplateId = clean(data?.labelTemplateId);
  const seriesGroupId = clean(data?.seriesGroupId);
  const isFlangeSeries = Boolean(data?.isFlangeSeries);
  const lotNumbers = Array.isArray(data?.lotNumbers)
    ? data.lotNumbers.map((entry) => clean(entry)).filter(Boolean)
    : [];
  const source = clampText(data?.source, 80);
  const stationOperators = Array.isArray(data?.stationOperators)
    ? data.stationOperators.map((entry) => clampText(entry, 80)).filter(Boolean).slice(0, 50)
    : [];

  if (!orderDocId || !lotStart || !stationId || !Number.isFinite(stringCount) || stringCount < 1 || stringCount > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId, lotStart, stationId en geldige stringCount zijn verplicht.');
  }

  try {
    const result = await startWorkstationProductionRunService({
      commandId,
      orderDocId,
      lotStart,
      stringCount,
      stationId,
      actorLabel,
      labelZplData,
      labelTemplateId,
      seriesGroupId,
      isFlangeSeries,
      lotNumbers,
      stationOperators,
      source,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(),
    });
    
    auditService.logCallable(
      context, 
      'START_PRODUCTION_RUN', 
      { orderDocId, stationId, lotStart, stringCount, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    if (error === 'ALREADY_PROCESSED' || error?.message === 'ALREADY_PROCESSED') return { ok: true, status: 'already_processed', message: 'Command already processed successfully' };
    handleCallableError(error);
  }
});

const archivePlanningOrder = withAudit('ARCHIVE_ORDER', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!PLANNING_ARCHIVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om orders te archiveren.');
  }

  const orderDocId = clean(data?.orderDocId);
  const requestedReason = clean(data?.reason).toLowerCase();
  const source = clampText(data?.source, 80);

  if (!orderDocId || orderDocId.length > 220) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig orderDocId.');
  }

  if (!ALLOWED_ARCHIVE_REASONS.has(requestedReason)) {
    throw new functions.https.HttpsError('invalid-argument', 'Niet-toegestane archive reason.');
  }

  try {
    const result = await archivePlanningOrderService({
      orderDocId,
      requestedReason,
      source,
      auth: context.auth,
      userRole,
      // 'manual' en 'rejected' mogen altijd archiveren, ook als er nog actieve producten zijn.
      allowWithActiveProducts: requestedReason === 'manual' || requestedReason === 'rejected',
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ARCHIVE_ORDER', 
      { orderDocId, reason: requestedReason, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const updatePlanningOrderPriority = withAudit('UPDATE_ORDER_PRIORITY', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_PRIORITY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order-prioriteit te wijzigen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const productDocId = clean(data?.productDocId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const rawPriority = data?.priority;

  if (!orderDocId || orderDocId.length > 220) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig orderDocId.');
  }

  const normalizedPriority = rawPriority === false
    ? false
    : clean(rawPriority).toLowerCase();

  if (!(normalizedPriority === false || ALLOWED_ORDER_PRIORITIES.has(normalizedPriority))) {
    throw new functions.https.HttpsError('invalid-argument', 'Priority moet "high", "urgent", "immediate" of false zijn.');
  }

  try {
    const result = await updatePlanningOrderPriorityService({
      orderDocId,
      priority: normalizedPriority,
      productDocId,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'UPDATE_ORDER_PRIORITY', 
      { orderDocId, priority: normalizedPriority, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const movePlanningOrder = withAudit('MOVE_PLANNING_ORDER', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order te verplaatsen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const targetType = clean(data?.targetType).toLowerCase();
  const targetId = clampText(data?.targetId, 120);
  const currentDepartment = clampText(data?.currentDepartment, 80);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId || !targetId || !['department', 'station'].includes(targetType)) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId, targetType en targetId zijn verplicht.');
  }

  try {
    const result = await movePlanningOrderService({
      orderDocId,
      targetType,
      targetId,
      currentDepartment,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'MOVE_ORDER', 
      { orderDocId, targetType, targetId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const retrievePlanningOrder = functions.region('europe-west1').https.onCall(async (data, context) => {
  const { orderDocId, source, actorLabel } = validateCallableData(planningOrderLookupCallableSchema, data);
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order terug te halen.');
  }

  const normalizedOrderDocId = clean(orderDocId);
  const normalizedSource = clampText(source, 80);
  const normalizedActorLabel = clampText(actorLabel, 120);

  if (!normalizedOrderDocId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId is verplicht.');
  }

  try {
    const result = await retrievePlanningOrderService({
      orderDocId: normalizedOrderDocId,
      source: normalizedSource,
      actorLabel: normalizedActorLabel,
      orderDocId,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'RETRIEVE_ORDER', 
      { orderDocId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const togglePlanningOrderHold = withAudit('TOGGLE_ORDER_HOLD', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om hold-status te wijzigen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId is verplicht.');
  }

  try {
    const result = await togglePlanningOrderHoldService({
      orderDocId,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'TOGGLE_ORDER_HOLD', 
      { orderDocId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const updatePlanningOrderDetails = withAudit('UPDATE_ORDER_DETAILS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om orderdetails te wijzigen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const notes = clampText(data?.notes, 2000);
  const rawPlan = data?.plan;
  const rawPlanDelta = data?.planDelta;
  const rawStarted = data?.started;
  const rawManualTodo = data?.manualTodo;
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const plan = rawPlan === null || rawPlan === undefined || rawPlan === '' ? null : Number(rawPlan);
  const planDelta = rawPlanDelta === null || rawPlanDelta === undefined || rawPlanDelta === '' ? null : Number(rawPlanDelta);
  const started = rawStarted === null || rawStarted === undefined || rawStarted === '' ? null : Number(rawStarted);
  const manualTodo = rawManualTodo === null || rawManualTodo === undefined || rawManualTodo === '' ? null : Number(rawManualTodo);

  if (!orderDocId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId is verplicht.');
  }

  if (plan !== null && (!Number.isFinite(plan) || plan < 0 || plan > 1000000)) {
    throw new functions.https.HttpsError('invalid-argument', 'plan moet een geldig getal van 0 of hoger zijn.');
  }

  if (planDelta !== null && (!Number.isFinite(planDelta) || planDelta < -1000000 || planDelta > 1000000)) {
    throw new functions.https.HttpsError('invalid-argument', 'planDelta moet een geldig getal zijn.');
  }

  if (started !== null && (!Number.isFinite(started) || started < 0 || started > 1000000)) {
    throw new functions.https.HttpsError('invalid-argument', 'started moet een geldig getal van 0 of hoger zijn.');
  }

  if (manualTodo !== null && (!Number.isFinite(manualTodo) || manualTodo < 0 || manualTodo > 1000000)) {
    throw new functions.https.HttpsError('invalid-argument', 'To do moet een geldig getal van 0 of hoger zijn.');
  }

  try {
    const result = await updatePlanningOrderDetailsService({
      orderDocId,
      notes,
      plan,
      planDelta,
      started,
      manualTodo,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'UPDATE_ORDER_DETAILS', 
      { orderDocId, before: result.before || null, after: result.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const patchPlanningOrderMetadata = withAudit('PATCH_ORDER_METADATA', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om planningmetadata te wijzigen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const patch = data?.patch && typeof data.patch === 'object' ? data.patch : null;
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId || !patch) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId en patch zijn verplicht.');
  }

  try {
    const result = await patchPlanningOrderMetadataService({
      orderDocId,
      patch,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'PATCH_ORDER_METADATA', 
      { orderDocId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const cancelPlanningOrder = withAudit('CANCEL_ORDER', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_CANCEL_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order te annuleren.');
  }

  const orderDocId = clean(data?.orderDocId);
  const reason = clampText(data?.reason, 600);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId || orderDocId.length > 220) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig orderDocId.');
  }

  try {
    const result = await cancelPlanningOrderService({
      orderDocId,
      reason,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'CANCEL_ORDER', 
      { orderDocId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const createPlanningOrderManual = withAudit('CREATE_ORDER_MANUAL', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om handmatig order aan te maken.');
  }

  const orderId = clean(data?.orderId);
  const item = clampText(data?.item, 220);
  const machine = clean(data?.machine);
  const plan = Number(data?.plan);
  const itemCode = clean(data?.itemCode || '');
  const itemDescription = clampText(data?.itemDescription || data?.item || '', 220);
  const drawing = clean(data?.drawing || '');
  const notes = clampText(data?.notes || '', 600);
  const project = clean(data?.project || '');
  const projectDesc = clampText(data?.projectDesc || '', 220);
  const extraCode = clean(data?.extraCode || '');
  const plannedDate = clean(data?.plannedDate || '');
  const deliveryDate = clean(data?.deliveryDate || '');
  const totalPlannedHours = Number(data?.totalPlannedHours || 0);
  const onlyLabelPrint = Boolean(data?.onlyLabelPrint || false);

  if (!orderId || !item || !machine || !Number.isFinite(plan) || plan <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId, item, machine en geldige plan zijn verplicht.');
  }

  try {
    const result = await createPlanningOrderManualService({
      orderId,
      item,
      machine,
      plan,
      itemCode,
      itemDescription,
      drawing,
      notes,
      project,
      projectDesc,
      extraCode,
      plannedDate,
      deliveryDate,
      totalPlannedHours,
      onlyLabelPrint,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'CREATE_ORDER_MANUAL', 
      { orderId, machine, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const addOrderDependency = withAudit('ADD_ORDER_DEPENDENCY', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om dependencies te beheren.');
  }

  const orderId = clean(data?.orderId);
  const dependencyId = clean(data?.dependencyId);

  if (!orderId || !dependencyId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en dependencyId zijn verplicht.');
  }

  auditService.logCallable(context, 'ADD_ORDER_DEPENDENCY', { orderId, dependencyId }, { category: 'PLANNING', severity: 'INFO' });

  try {
    return await addOrderDependencyService({
        orderId,
        dependencyId,
        dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const removeOrderDependency = withAudit('REMOVE_ORDER_DEPENDENCY', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om dependencies te beheren.');
  }

  const orderId = clean(data?.orderId);
  const dependencyId = clean(data?.dependencyId);

  if (!orderId || !dependencyId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en dependencyId zijn verplicht.');
  }

  auditService.logCallable(context, 'REMOVE_ORDER_DEPENDENCY', { orderId, dependencyId }, { category: 'PLANNING', severity: 'INFO' });

  try {
    return await removeOrderDependencyService({
        orderId,
        dependencyId,
        dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const updateOrderPlannedDate = withAudit('UPDATE_ORDER_PLANNED_DATE', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'UPDATE_PLANNED_DATE');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'UPDATE_PLANNED_DATE', userRole, 'Geen rechten om geplande datum te wijzigen.');
  }

  const orderId = clean(data?.orderId);
  const plannedDateRaw = data?.plannedDate;
  const plannedDate = new Date(plannedDateRaw);

  if (!orderId || !plannedDateRaw || Number.isNaN(plannedDate.getTime())) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en geldige plannedDate zijn verplicht.');
  }

  try {
    const result = await updateOrderPlannedDateService({
        orderId,
        plannedDate,
        dbCtx: resolveDbContext(extractRds(data)),
    });

    auditService.logCallable(
      context,
      'UPDATE_PLANNED_DATE',
      {
        orderId,
        before: result.before || null,
        after: result.after || null,
      },
      { category: 'PLANNING', severity: 'INFO' },
    );

    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const updateOrderKanbanStatus = withAudit('UPDATE_ORDER_KANBAN_STATUS', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'UPDATE_KANBAN_STATUS');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'UPDATE_KANBAN_STATUS', userRole, 'Geen rechten om orderstatus te wijzigen.');
  }

  const orderId = clean(data?.orderId);
  const status = clean(data?.status);

  if (!orderId || !status || status.length > 80) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en geldige status zijn verplicht.');
  }

  try {
    const result = await updateOrderKanbanStatusService({
        orderId,
        status,
        auth: context.auth,
        dbCtx: resolveDbContext(extractRds(data)),
    });

    auditService.logCallable(
      context,
      'UPDATE_KANBAN_STATUS',
      {
        orderId,
        before: result.before || null,
        after: result.after || null,
      },
      { category: 'PLANNING', severity: 'INFO' },
    );

    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const importPlanningOrders = withAudit('IMPORT_PLANNING_ORDERS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om planning te importeren.');
  }

  const importMode = clean(data?.importMode).toLowerCase() || 'new_only';
  if (!IMPORT_ALLOWED_MODES.has(importMode)) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldige importMode.');
  }

  const hoursOnlyMode = Boolean(data?.hoursOnlyMode);

  const orders = Array.isArray(data?.orders) ? data.orders.slice(0, 1500) : [];
  if (orders.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimaal 1 order is verplicht.');
  }

  auditService.logCallable(context, 'IMPORT_PLANNING_ORDERS', { orderCount: orders.length, importMode, hoursOnlyMode }, { category: 'PLANNING', severity: 'INFO' });

  return bulkImportPlanningOrdersService({
    orders,
    importMode,
    hoursOnlyMode,
    dbCtx: resolveDbContext(extractRds(data)),
  });
});

const reconcileOrderControl = functions.region('europe-west1').https.onCall(async (data, context) => {
  const { orderId, machine } = validateCallableData(reconcileOrderCallableSchema, data);
  const auth = context?.auth;
  if (!auth?.uid) throw new Error('UNAUTHENTICATED');

  const { resolveDbContext } = require('../repositories/planningRepository');
  const ctx = resolveDbContext();

  const normalizedOrderId = String(orderId).trim();
  const normalizedMachine = String(machine).trim();

  if (!normalizedOrderId || !normalizedMachine) {
    throw new Error('INVALID_PARAMS');
  }

  return reconcileOrderControlState({ ctx, orderId: normalizedOrderId, machine: normalizedMachine });
});


module.exports = {
  startWorkstationProductionRun,
  archivePlanningOrder,
  updatePlanningOrderPriority,
  movePlanningOrder,
  retrievePlanningOrder,
  togglePlanningOrderHold,
  updatePlanningOrderDetails,
  patchPlanningOrderMetadata,
  cancelPlanningOrder,
  createPlanningOrderManual,
  addOrderDependency,
  removeOrderDependency,
  updateOrderPlannedDate,
  updateOrderKanbanStatus,
  importPlanningOrders,
  reconcileOrderControl
};
