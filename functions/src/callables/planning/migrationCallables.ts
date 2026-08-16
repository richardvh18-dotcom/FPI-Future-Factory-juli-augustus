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

const migrateLegacyActivityLogs = withAudit('MIGRATE_LEGACY_ACTIVITY_LOGS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (userRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Alleen admins mogen legacy logs migreren.');
  }

  const dryRun = Boolean(data?.dryRun);
  const deleteSource = Boolean(data?.deleteSource);
  const markSourceMigrated = data?.markSourceMigrated !== false;
  const limit = Math.min(Math.max(Number(data?.limit) || 500, 1), 2000);
  const maxScan = Math.min(Math.max(Number(data?.maxScan) || 5000, 100), 20000);
  const pageSize = Math.min(Math.max(Number(data?.pageSize) || 250, 50), 500);

  const sourceRef = admin.firestore()
    .collection(DB_PATHS.ACTIVITY_LOGS);
  const targetRef = admin.firestore()
    .collection(DB_PATHS.AUDIT_LOGS);

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  let deleted = 0;
  let cursor = null;
  let reachedEnd = false;

  while (scanned < maxScan && migrated < limit) {
    let q = sourceRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);

    if (cursor) {
      q = q.startAfter(cursor);
    }

    const snapshot = await q.get();
    if (snapshot.empty) {
      reachedEnd = true;
      break;
    }

    for (const docSnap of snapshot.docs) {
      scanned += 1;

      const oldData = docSnap.data() || {};
      const targetId = `legacy_${docSnap.id}`;
      const existingTarget = await targetRef.doc(targetId).get();

      const now = new Date();
      const legacyDate = (() => {
        const value = oldData.timestamp;
        if (!value) return now;
        if (typeof value.toDate === 'function') {
          const parsed = value.toDate();
          return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : now;
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? now : parsed;
      })();
      const year = legacyDate.getUTCFullYear();
      const month = legacyDate.getUTCMonth() + 1;
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

      const detailsMessage = typeof oldData.details === 'string'
        ? oldData.details
        : clampText(JSON.stringify(oldData.details || {}), 4000);

      const mappedEntry = {
        timestamp: oldData.timestamp || admin.firestore.FieldValue.serverTimestamp(),
        userId: clean(oldData.userId) || 'legacy',
        userEmail: clean(oldData.userEmail) || null,
        action: clean(oldData.action) || 'LEGACY_ACTIVITY_LOG',
        category: 'SYSTEM',
        severity: String(oldData.status || '').toUpperCase() === 'FAILED' ? 'WARNING' : 'INFO',
        year,
        month,
        yearMonth,
        details: {
          legacy: true,
          legacyPath: DB_PATHS.ACTIVITY_LOGS,
          legacyLogId: docSnap.id,
          message: detailsMessage || null,
          source: clean(oldData.source) || null,
          ipAddress: clean(oldData.ipAddress) || null,
          status: clean(oldData.status) || null,
          changes: oldData.changes || null,
        },
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedBy: context.auth.uid,
      };

      if (!existingTarget.exists) {
        migrated += 1;
        if (!dryRun) {
          await targetRef.doc(targetId).set(mappedEntry, { merge: true });
        }
      } else {
        skipped += 1;
      }

      if (!dryRun && deleteSource) {
        await docSnap.ref.delete();
        deleted += 1;
      }

      if (!dryRun && !deleteSource && markSourceMigrated) {
        await docSnap.ref.set(
          {
            migratedToAudit: true,
            migratedToAuditAt: admin.firestore.FieldValue.serverTimestamp(),
            migratedAuditId: targetId,
          },
          { merge: true },
        );
      }

      if (scanned >= maxScan || migrated >= limit) {
        break;
      }
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  auditService.logCallable(
    context,
    'MIGRATE_LEGACY_ACTIVITY_LOGS',
    {
      dryRun,
      deleteSource,
      markSourceMigrated,
      limit,
      maxScan,
      scanned,
      migrated,
      skipped,
      deleted,
      reachedEnd,
    },
    { category: 'ADMIN', severity: dryRun ? 'INFO' : 'WARNING' },
  );

  return {
    ok: true,
    dryRun,
    scanned,
    migrated,
    skipped,
    deleted,
    reachedEnd,
    hasMore: !reachedEnd,
  };
});

/**
 * Reconcileert de control events in production/events met tracked_products
 * en de planning-teller voor een order+machine combinatie.
 *
 * Input: { orderId: string, machine: string }
 * Output: { ok, orderId, machine, eventLots, trackedLots, planningCounter, discrepancies }
 */

module.exports = {
  migrateLegacyActivityLogs
};
