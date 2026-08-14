import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";

const functions = getFunctions(app, 'europe-west1');

export interface BaseResponse {
  ok: boolean;
  [key: string]: unknown;
}

export function createCallableWrapper<TInput, TOutput = BaseResponse>(
  functionName: string,
  validator?: (payload: TInput) => TInput | void
) {
  const callable = httpsCallable(functions, functionName);
  return async (payload: TInput): Promise<TOutput> => {
    let processedPayload = payload;
    if (validator) {
      const validated = validator(payload);
      if (validated !== undefined) {
        processedPayload = validated as TInput;
      }
    }
    const result = await callable(processedPayload);
    return (result?.data as TOutput) || ({ ok: false } as unknown as TOutput);
  };
}

type CallableFn = (payload?: unknown) => Promise<{ data?: unknown }>;
const callableWithRuntime = (callable: CallableFn) => async (payload: unknown = {}) => callable(payload);


const rejectTrackedProductFinalCallable = callableWithRuntime(httpsCallable(functions, "rejectTrackedProductFinal"));
const tempRejectTrackedProductCallable = callableWithRuntime(httpsCallable(functions, "tempRejectTrackedProduct"));
const advanceTrackedProductCallable = callableWithRuntime(httpsCallable(functions, "advanceTrackedProduct"));
const completeTrackedProductRepairCallable = callableWithRuntime(httpsCallable(functions, "completeTrackedProductRepair"));
const routeTrackedProductsToLossenCallable = callableWithRuntime(httpsCallable(functions, "routeTrackedProductsToLossen"));
const startWorkstationProductionRunCallable = callableWithRuntime(httpsCallable(functions, "startWorkstationProductionRun"));
const toggleTrackedProductPauseCallable = callableWithRuntime(httpsCallable(functions, "toggleTrackedProductPause"));
const markTrackedProductReminderCallable = callableWithRuntime(httpsCallable(functions, "markTrackedProductReminder"));
const moveTrackedProductManualCallable = callableWithRuntime(httpsCallable(functions, "moveTrackedProductManual"));
const archiveRejectedTrackedProductCallable = callableWithRuntime(httpsCallable(functions, "archiveRejectedTrackedProduct"));
const cancelTrackedProductionCallable = callableWithRuntime(httpsCallable(functions, "cancelTrackedProduction"));
const updatePlanningOrderPriorityCallable = callableWithRuntime(httpsCallable(functions, "updatePlanningOrderPriority"));
const movePlanningOrderCallable = callableWithRuntime(httpsCallable(functions, "movePlanningOrder"));
const retrievePlanningOrderCallable = callableWithRuntime(httpsCallable(functions, "retrievePlanningOrder"));
const togglePlanningOrderHoldCallable = callableWithRuntime(httpsCallable(functions, "togglePlanningOrderHold"));
const updatePlanningOrderDetailsCallable = callableWithRuntime(httpsCallable(functions, "updatePlanningOrderDetails"));
const patchPlanningOrderMetadataCallable = callableWithRuntime(httpsCallable(functions, "patchPlanningOrderMetadata"));
const archivePlanningOrderCallable = callableWithRuntime(httpsCallable(functions, "archivePlanningOrder"));
const assignOverproductionCallable = callableWithRuntime(httpsCallable(functions, "assignOverproduction"));
const cancelPlanningOrderCallable = callableWithRuntime(httpsCallable(functions, "cancelPlanningOrder"));
const assignPersonnelToStationCallable = callableWithRuntime(httpsCallable(functions, "assignPersonnelToStation"));
const removePersonnelAssignmentCallable = callableWithRuntime(httpsCallable(functions, "removePersonnelAssignment"));
const loanPersonnelToDepartmentCallable = callableWithRuntime(httpsCallable(functions, "loanPersonnelToDepartment"));
const saveOccupancyAssignmentsCallable = callableWithRuntime(httpsCallable(functions, "saveOccupancyAssignments"));
const deleteOccupancyAssignmentsCallable = callableWithRuntime(httpsCallable(functions, "deleteOccupancyAssignments"));
const savePersonnelRecordCallable = callableWithRuntime(httpsCallable(functions, "savePersonnelRecord"));
const createProductionMessagesCallable = callableWithRuntime(httpsCallable(functions, "createProductionMessages"));
const transitionPrintQueueJobStatusCallable = callableWithRuntime(httpsCallable(functions, "transitionPrintQueueJobStatus"));
const requeuePrintQueueJobCallable = callableWithRuntime(httpsCallable(functions, "requeuePrintQueueJob"));
const deletePrintQueueJobCallable = callableWithRuntime(httpsCallable(functions, "deletePrintQueueJob"));
const startProductionLotsCallable = callableWithRuntime(httpsCallable(functions, "startProductionLots"));
const editTrackedProductLotNumberCallable = callableWithRuntime(httpsCallable(functions, "editTrackedProductLotNumber"));
const reassignTrackedProductOrderCallable = callableWithRuntime(httpsCallable(functions, "reassignTrackedProductOrder"));
const linkPlanningOrderProductCallable = callableWithRuntime(httpsCallable(functions, "linkPlanningOrderProduct"));
const createPlanningOrderManualCallable = callableWithRuntime(httpsCallable(functions, "createPlanningOrderManual"));
const markMazakLabelsPrintedCallable = callableWithRuntime(httpsCallable(functions, "markMazakLabelsPrinted"));
const appendQcNoteCallable = callableWithRuntime(httpsCallable(functions, "appendQcNote"));
const reserveAutoLotNumberRangeCallable = callableWithRuntime(httpsCallable(functions, "reserveAutoLotNumberRange"));
const addOrderDependencyCallable = callableWithRuntime(httpsCallable(functions, "addOrderDependency"));
const removeOrderDependencyCallable = callableWithRuntime(httpsCallable(functions, "removeOrderDependency"));
const updateOrderPlannedDateCallable = callableWithRuntime(httpsCallable(functions, "updateOrderPlannedDate"));
const updateOrderKanbanStatusCallable = callableWithRuntime(httpsCallable(functions, "updateOrderKanbanStatus"));
const markReadyForNextStepCallable = callableWithRuntime(httpsCallable(functions, "markReadyForNextStep"));
const startTrackedProductRepairCallable = callableWithRuntime(httpsCallable(functions, "startTrackedProductRepair"));
const restoreArchivedTrackedProductCallable = callableWithRuntime(httpsCallable(functions, "restoreArchivedTrackedProduct"));
const reportShopFloorIssueCallable = callableWithRuntime(httpsCallable(functions, "reportShopFloorIssue"));
const resolveShopFloorIssueCallable = callableWithRuntime(httpsCallable(functions, "resolveShopFloorIssue"));
const importPlanningOrdersCallable = callableWithRuntime(httpsCallable(functions, "importPlanningOrders"));
const queuePrintJobCallable = httpsCallable(functions, "queuePrintJob");
const updateUserProfileCallable = httpsCallable(functions, "updateUserProfile");
const clearPasswordChangeFlagCallable = httpsCallable(functions, "clearPasswordChangeFlag");
const submitAccountRequestCallable = httpsCallable(functions, "submitAccountRequest");
const updateUserLanguageCallable = httpsCallable(functions, "updateUserLanguage");
const executeAutomationRuleCallable = httpsCallable(functions, "executeAutomationRule");
const saveProductRecordCallable = httpsCallable(functions, "saveProductRecord");
const deleteProductRecordCallable = httpsCallable(functions, "deleteProductRecord");
const verifyProductRecordCallable = httpsCallable(functions, "verifyProductRecord");
const upsertConversionRecordCallable = httpsCallable(functions, "upsertConversionRecord");
const deleteConversionRecordCallable = httpsCallable(functions, "deleteConversionRecord");
const deleteAllConversionRecordsCallable = httpsCallable(functions, "deleteAllConversionRecords");
const upsertConversionBatchCallable = httpsCallable(functions, "upsertConversionBatch");
const processInforUpdateCallable = httpsCallable(functions, "processInforUpdate");
const saveAiContextConfigCallable = httpsCallable(functions, "saveAiContextConfig");
const createAiDocumentRecordCallable = httpsCallable(functions, "createAiDocumentRecord");
const updateAiDocumentRecordCallable = httpsCallable(functions, "updateAiDocumentRecord");
const deleteAiDocumentRecordCallable = httpsCallable(functions, "deleteAiDocumentRecord");
const verifyAiKnowledgeEntryCallable = httpsCallable(functions, "verifyAiKnowledgeEntry");
const deleteAiKnowledgeEntryCallable = httpsCallable(functions, "deleteAiKnowledgeEntry");
const migrateAiKnowledgeFieldsCallable = httpsCallable(functions, "migrateAiKnowledgeFields");
const runMigrationToolCallable = httpsCallable(functions, "runMigrationTool");
const previewAtpsOccupancyExportCallable = callableWithRuntime(httpsCallable(functions, "previewAtpsOccupancyExport"));
const executeAtpsOccupancyExportCallable = callableWithRuntime(httpsCallable(functions, "executeAtpsOccupancyExport"));
const getAtpsExportMonitorCallable = callableWithRuntime(httpsCallable(functions, "getAtpsExportMonitor"));
const saveLnQrExportHistoryCallable = callableWithRuntime(httpsCallable(functions, "saveLnQrExportHistory"));
const completeTrackedProductCallable = httpsCallable(functions, "completeTrackedProduct");
const updateProductionStandardCallable = callableWithRuntime(httpsCallable(functions, "updateProductionStandard"));


export interface RejectTrackedProductFinalInput {
  productId: any;
  reasons?: string[];
  note?: string;
  source?: string;
  actorLabel?: string;
}

export interface TempRejectTrackedProductInput {
  productId: any;
  reasons?: string[];
  note?: string;
  station?: string;
  actorLabel?: string;
  previousStep?: string;
  previousStatus?: string;
  source?: string;
}

export interface AdvanceTrackedProductInput {
  productId: any;
  nextStation?: string;
  nextStep: any;
  nextStatus: any;
  lastStation?: string;
  note?: string;
  actorLabel?: string;
  previousStep?: string;
  historyAction?: string;
  historyDetails?: string;
  clearManualMove?: boolean;
  measurements?: any;
  source?: string;
}

export interface CompleteTrackedProductRepairInput {
  productId: any;
  station?: string;
  actions?: string[];
  note?: string;
  actorLabel?: string;
  source?: string;
}

export interface RouteTrackedProductsToLossenInput {
  productIds: any;
  originStation?: string;
  centralStation?: any;
  centralOperators?: string[];
  actorLabel?: string;
  source?: string;
}

export interface StartWorkstationProductionRunInput {
  orderDocId: any;
  lotStart: any;
  stringCount: any;
  stationId: any;
  orderDocPath?: string;
  orderSourcePath?: string;
  actorLabel?: string;
  labelZplData?: string;
  labelTemplateId?: string;
  seriesGroupId?: string;
  isFlangeSeries?: boolean;
  lotNumbers?: string[];
  stationOperators?: string[];
  source?: string;
}

export interface ToggleTrackedProductPauseInput {
  productId: any;
  note?: string;
  actorLabel?: string;
  source?: string;
}

export interface MarkTrackedProductReminderInput {
  productId: any;
  reminderSent?: boolean;
  actorLabel?: string;
  source?: string;
}

export interface MoveTrackedProductManualInput {
  productOrLotId: any;
  newStation: any;
  isRepairMove?: boolean;
  repairInstruction?: string;
  source?: string;
  actorLabel?: string;
}

export interface ArchiveRejectedTrackedProductInput {
  productId: any;
  source?: string;
  actorLabel?: string;
}

export interface CompleteTrackedProductInput {
  productId: any;
  finishType: any;
  fromStation?: string;
  note?: string;
  actorLabel?: string;
  source?: string;
}

export interface CancelTrackedProductionInput {
  productId: any;
  selectedStation?: string;
  source?: string;
  actorLabel?: string;
}

export interface MovePlanningOrderInput {
  orderDocId: any;
  targetType: any;
  targetId: any;
  currentDepartment?: string;
  source?: string;
  actorLabel?: string;
}

export interface RetrievePlanningOrderInput {
  orderDocId: any;
  source?: string;
  actorLabel?: string;
}

export interface TogglePlanningOrderHoldInput {
  orderDocId: any;
  source?: string;
  actorLabel?: string;
}

export interface ArchivePlanningOrderInput {
  orderDocId: any;
  reason?: any;
  source?: string;
  actorLabel?: string;
}

export interface AssignOverproductionInput {
  targetOrderDocId: any;
  targetOrderId: any;
  productIds: any;
  routeStation: any;
  sourceOrderId?: string;
  originMachine?: string;
  source?: string;
  actorLabel?: string;
}

export interface CancelPlanningOrderInput {
  orderDocId: any;
  reason?: string;
  source?: string;
  actorLabel?: string;
}

export interface AssignPersonnelToStationInput {
  stationId: any;
  operatorId: any;
  operatorNumber?: string;
  operatorName?: string;
  date: any;
  departmentId?: string;
  hoursWorked?: number;
  shiftType?: any;
  source?: string;
  actorLabel?: string;
}

export interface RemovePersonnelAssignmentInput {
  assignmentId: any;
  stationId?: string;
  source?: string;
  actorLabel?: string;
}

export interface LoanPersonnelToDepartmentInput {
  operatorNumber: any;
  operatorName?: string;
  targetDepartment: any;
  targetStation: any;
  date: any;
  shiftLabel?: string;
  shiftStart?: string;
  shiftEnd?: string;
  hoursWorked?: number;
  isPloeg?: boolean;
  loanFromDepartment?: string;
  loanFromStation?: string;
  originalShift?: string;
  source?: string;
  actorLabel?: string;
}

export interface CreateProductionMessagesInput {
  messages: any;
  source?: string;
  actorLabel?: string;
}

export interface TransitionPrintQueueJobStatusInput {
  jobId: any;
  status: any;
  error?: string;
  source?: string;
  actorLabel?: string;
  printerName?: string;
}

export interface RequeuePrintQueueJobInput {
  jobId: any;
  source?: string;
  actorLabel?: string;
}

export interface DeletePrintQueueJobInput {
  jobId: any;
  source?: string;
  actorLabel?: string;
}

export interface StartProductionLotsInput {
  orderDocId: any;
  orderDocPath?: string;
  orderSourcePath?: string;
  orderId: any;
  itemCode: any;
  item?: string;
  lotStart: any;
  totalToProduce: any;
  stationId: any;
  stationLabel?: string;
  actorLabel?: string;
  labelZplData?: string;
  labelTemplateId?: string;
  seriesGroupId?: string;
  isFlangeSeries?: boolean;
  lotNumbers?: string[];
  isVirtualLot?: boolean;
  virtualReason?: string;
}

export interface EditTrackedProductLotNumberInput {
  productId: any;
  newLotNumber: any;
  reason: any;
  source?: string;
  actorLabel?: string;
}

export interface ReassignTrackedProductOrderInput {
  productId: any;
  newOrderId: any;
  targetOrderDocId?: string;
  targetOrderPath?: string;
  reason: any;
  source?: string;
  actorLabel?: string;
}

export interface LinkPlanningOrderProductInput {
  orderDocId: any;
  productId: any;
  productImage?: string;
}

export interface CreatePlanningOrderManualInput {
  orderId: any;
  item: any;
  machine: any;
  plan: any;
  itemCode?: any;
  itemDescription?: any;
  drawing?: any;
  notes?: any;
  project?: any;
  projectDesc?: any;
  extraCode?: any;
  plannedDate?: any;
  deliveryDate?: any;
  totalPlannedHours?: any;
  onlyLabelPrint?: any;
}

export interface MarkMazakLabelsPrintedInput {
  productIds: any;
  stationId?: string;
  isReprint?: boolean;
  source?: string;
  actorLabel?: string;
}

export interface AddOrderDependencyInput {
  orderId: any;
  dependencyId: any;
}

export interface RemoveOrderDependencyInput {
  orderId: any;
  dependencyId: any;
}

export interface UpdateOrderKanbanStatusInput {
  orderId: any;
  status: any;
}

export interface SaveProductRecordInput {
  productId?: string;
  productData?: any;
  clearVerification?: boolean;
}

export interface VerifyProductRecordInput {
  productId?: string;
  actorName?: string;
}

export interface UpsertConversionRecordInput {
  recordId?: string;
  recordData?: any;
}

export interface UpsertConversionBatchInput {
  items?: string[];
  mode?: any;
}

export const rejectTrackedProductFinal = createCallableWrapper<RejectTrackedProductFinalInput>(
  "rejectTrackedProductFinal",
  (payload) => {
    const { productId, reasons, note, source, actorLabel } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        reasons: Array.isArray(reasons) ? reasons : [],
        note: String(note || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    
      if (!processed.reasons.length) {
        throw new Error("Minimaal 1 afkeurreden is verplicht.");
      }
    return processed;
  }
);

export const tempRejectTrackedProduct = createCallableWrapper<TempRejectTrackedProductInput>(
  "tempRejectTrackedProduct",
  (payload) => {
    const { productId, reasons, note, station, actorLabel, previousStep, previousStatus, source } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        reasons: Array.isArray(reasons) ? reasons : [],
        note: String(note || "").trim(),
        station: String(station || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
        previousStep: String(previousStep || "").trim(),
        previousStatus: String(previousStatus || "").trim(),
        source: String(source || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    
      if (!processed.reasons.length) {
        throw new Error("Minimaal 1 afkeurreden is verplicht.");
      }
    return processed;
  }
);

export const advanceTrackedProduct = createCallableWrapper<AdvanceTrackedProductInput>(
  "advanceTrackedProduct",
  (payload) => {
    const { productId, nextStation, nextStep, nextStatus, lastStation, note, actorLabel, previousStep, historyAction, historyDetails, clearManualMove, measurements, source } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        nextStation: String(nextStation || "").trim(),
        nextStep: String(nextStep || "").trim(),
        nextStatus: String(nextStatus || "").trim(),
        lastStation: String(lastStation || "").trim(),
        note: String(note || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
        previousStep: String(previousStep || "").trim(),
        historyAction: String(historyAction || "").trim(),
        historyDetails: String(historyDetails || "").trim(),
        clearManualMove: Boolean(clearManualMove),
        measurements: measurements && typeof measurements === "object" ? measurements : null,
        source: String(source || "").trim(),
      };
    if (!processed.productId || !processed.nextStep || !processed.nextStatus) {
        throw new Error("productId, nextStep en nextStatus zijn verplicht.");
      }
    return processed;
  }
);

export const completeTrackedProductRepair = createCallableWrapper<CompleteTrackedProductRepairInput>(
  "completeTrackedProductRepair",
  (payload) => {
    const { productId, station, actions, note, actorLabel, source } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        station: String(station || "").trim(),
        actions: Array.isArray(actions) ? actions.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
        note: String(note || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
        source: String(source || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    return processed;
  }
);

export const routeTrackedProductsToLossen = createCallableWrapper<RouteTrackedProductsToLossenInput>(
  "routeTrackedProductsToLossen",
  (payload) => {
    const { productIds, originStation, centralStation, centralOperators, actorLabel, source } = payload;
    const processed = {
        productIds: Array.isArray(productIds) ? productIds.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
        originStation: String(originStation || "").trim(),
        centralStation: String(centralStation || "").trim(),
        centralOperators: Array.isArray(centralOperators) ? centralOperators.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
        actorLabel: String(actorLabel || "").trim(),
        source: String(source || "").trim(),
      };
    if (processed.productIds.length === 0) {
        throw new Error("productIds is verplicht.");
      }
    return processed;
  }
);

export const startWorkstationProductionRun = createCallableWrapper<StartWorkstationProductionRunInput>(
  "startWorkstationProductionRun",
  (payload) => {
    const { orderDocId, lotStart, stringCount, stationId, orderDocPath, orderSourcePath, actorLabel, labelZplData, labelTemplateId, seriesGroupId, isFlangeSeries, lotNumbers, stationOperators, source } = payload;
    const processed = {
        orderDocId: String(orderDocId || "").trim(),
        lotStart: String(lotStart || "").trim(),
        stringCount: Number(stringCount),
        stationId: String(stationId || "").trim(),
        orderDocPath: String(orderDocPath || "").trim(),
        orderSourcePath: String(orderSourcePath || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
        labelZplData: typeof labelZplData === "string" ? labelZplData : "",
        labelTemplateId: String(labelTemplateId || "").trim(),
        seriesGroupId: String(seriesGroupId || "").trim(),
        isFlangeSeries: Boolean(isFlangeSeries),
        lotNumbers: Array.isArray(lotNumbers) ? lotNumbers.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
        stationOperators: Array.isArray(stationOperators)
          ? stationOperators.map((entry) => String(entry || "").trim()).filter(Boolean)
          : [],
        source: String(source || "").trim(),
      };
    if (!processed.orderDocId || !processed.lotStart || !processed.stationId || !Number.isFinite(processed.stringCount) || processed.stringCount < 1) {
        throw new Error("orderDocId, lotStart, stationId en geldige stringCount zijn verplicht.");
      }
    return processed;
  }
);

export const toggleTrackedProductPause = createCallableWrapper<ToggleTrackedProductPauseInput>(
  "toggleTrackedProductPause",
  (payload) => {
    const { productId, note, actorLabel, source } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        note: String(note || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
        source: String(source || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    return processed;
  }
);

export const markTrackedProductReminder = createCallableWrapper<MarkTrackedProductReminderInput>(
  "markTrackedProductReminder",
  (payload) => {
    const { productId, reminderSent, actorLabel, source } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        reminderSent: reminderSent !== false,
        actorLabel: String(actorLabel || "").trim(),
        source: String(source || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    return processed;
  }
);

export const moveTrackedProductManual = createCallableWrapper<MoveTrackedProductManualInput>(
  "moveTrackedProductManual",
  (payload) => {
    const { productOrLotId, newStation, isRepairMove, repairInstruction, source, actorLabel } = payload;
    const processed = {
        productOrLotId: String(productOrLotId || "").trim(),
        newStation: String(newStation || "").trim(),
        isRepairMove: Boolean(isRepairMove),
        repairInstruction: String(repairInstruction || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.productOrLotId) {
        throw new Error("productOrLotId is verplicht.");
      }
    
      if (!processed.newStation) {
        throw new Error("newStation is verplicht.");
      }
    return processed;
  }
);

export const archiveRejectedTrackedProduct = createCallableWrapper<ArchiveRejectedTrackedProductInput>(
  "archiveRejectedTrackedProduct",
  (payload) => {
    const { productId, source, actorLabel } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    return processed;
  }
);

export const completeTrackedProduct = createCallableWrapper<CompleteTrackedProductInput>(
  "completeTrackedProduct",
  (payload) => {
    const { productId, finishType, fromStation, note, actorLabel, source } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        finishType: String(finishType || "").trim(),
        fromStation: String(fromStation || "").trim(),
        note: String(note || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
        source: String(source || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    
      if (!["archive", "forward", "post_inspection"].includes(processed.finishType)) {
        throw new Error('finishType moet "archive", "forward" of "post_inspection" zijn.');
      }
    return processed;
  }
);

export const cancelTrackedProduction = createCallableWrapper<CancelTrackedProductionInput>(
  "cancelTrackedProduction",
  (payload) => {
    const { productId, selectedStation, source, actorLabel } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        selectedStation: String(selectedStation || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    return processed;
  }
);

export const updatePlanningOrderPriority = async ({
  orderDocId,
  priority,
  productDocId = "",
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  const normalizedPriority = priority === false ? false : String(priority || "").trim().toLowerCase();
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    priority: normalizedPriority,
    productDocId: String(productDocId || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.orderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  if (!(payload.priority === false || ["high", "urgent", "immediate"].includes(payload.priority as string))) {
    throw new Error('priority moet "high", "urgent", "immediate" of false zijn.');
  }

  const result = await updatePlanningOrderPriorityCallable(payload);
  return result?.data || { ok: false };
};



export const movePlanningOrder = createCallableWrapper<MovePlanningOrderInput>(
  "movePlanningOrder",
  (payload) => {
    const { orderDocId, targetType, targetId, currentDepartment, source, actorLabel } = payload;
    const processed = {
        orderDocId: String(orderDocId || "").trim(),
        targetType: String(targetType || "").trim().toLowerCase(),
        targetId: String(targetId || "").trim(),
        currentDepartment: String(currentDepartment || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.orderDocId || !processed.targetId || !["department", "station"].includes(processed.targetType)) {
        throw new Error("orderDocId, targetType en targetId zijn verplicht.");
      }
    return processed;
  }
);

export const retrievePlanningOrder = createCallableWrapper<RetrievePlanningOrderInput>(
  "retrievePlanningOrder",
  (payload) => {
    const { orderDocId, source, actorLabel } = payload;
    const processed = {
        orderDocId: String(orderDocId || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.orderDocId) {
        throw new Error("orderDocId is verplicht.");
      }
    return processed;
  }
);

export const togglePlanningOrderHold = createCallableWrapper<TogglePlanningOrderHoldInput>(
  "togglePlanningOrderHold",
  (payload) => {
    const { orderDocId, source, actorLabel } = payload;
    const processed = {
        orderDocId: String(orderDocId || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.orderDocId) {
        throw new Error("orderDocId is verplicht.");
      }
    return processed;
  }
);

export const updatePlanningOrderDetails = async ({
  orderDocId,
  notes = "",
  plan = null,
  planDelta = null,
  started = null,
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  const normalizedPlan = plan === null || plan === undefined || plan === "" ? null : Number(plan);
  const normalizedPlanDelta = planDelta === null || planDelta === undefined || planDelta === "" ? null : Number(planDelta);
  const normalizedStarted = started === null || started === undefined || started === "" ? null : Number(started);
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    notes: String(notes || "").trim(),
    plan: normalizedPlan,
    planDelta: normalizedPlanDelta,
    started: normalizedStarted,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.orderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  if (payload.plan !== null && (!Number.isFinite(payload.plan) || payload.plan < 0)) {
    throw new Error("plan moet een geldig getal van 0 of hoger zijn.");
  }

  if (payload.planDelta !== null && !Number.isFinite(payload.planDelta)) {
    throw new Error("planDelta moet een geldig getal zijn.");
  }

  if (payload.started !== null && (!Number.isFinite(payload.started) || payload.started < 0)) {
    throw new Error("started moet een geldig getal van 0 of hoger zijn.");
  }

  const result = await updatePlanningOrderDetailsCallable(payload);
  return result?.data || { ok: false };
};



export const patchPlanningOrderMetadata = async ({
  orderDocId,
  patch,
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  const safeOrderDocId = String(orderDocId || "").trim();
  if (!safeOrderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("patch is verplicht.");
  }

  const result = await patchPlanningOrderMetadataCallable({
    orderDocId: safeOrderDocId,
    patch,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  });

  return result?.data || { ok: false };
};



export const archivePlanningOrder = createCallableWrapper<ArchivePlanningOrderInput>(
  "archivePlanningOrder",
  (payload) => {
    const { orderDocId, reason, source, actorLabel } = payload;
    const processed = {
        orderDocId: String(orderDocId || "").trim(),
        reason: String(reason || "").trim().toLowerCase(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.orderDocId) {
        throw new Error("orderDocId is verplicht.");
      }
    
      if (!["completed", "manual", "rejected"].includes(processed.reason)) {
        throw new Error('reason moet "completed", "manual" of "rejected" zijn.');
      }
    return processed;
  }
);

export const assignOverproduction = createCallableWrapper<AssignOverproductionInput>(
  "assignOverproduction",
  (payload) => {
    const { targetOrderDocId, targetOrderId, productIds, routeStation, sourceOrderId, originMachine, source, actorLabel } = payload;
    const processed = {
        targetOrderDocId: String(targetOrderDocId || "").trim(),
        targetOrderId: String(targetOrderId || "").trim(),
        productIds: Array.isArray(productIds) ? productIds.map((id) => String(id || "").trim()).filter(Boolean) : [],
        routeStation: String(routeStation || "").trim(),
        sourceOrderId: String(sourceOrderId || "").trim(),
        originMachine: String(originMachine || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.targetOrderDocId || !processed.targetOrderId || !processed.routeStation || processed.productIds.length === 0) {
        throw new Error("targetOrderDocId, targetOrderId, routeStation en productIds zijn verplicht.");
      }
    return processed;
  }
);

export const cancelPlanningOrder = createCallableWrapper<CancelPlanningOrderInput>(
  "cancelPlanningOrder",
  (payload) => {
    const { orderDocId, reason, source, actorLabel } = payload;
    const processed = {
        orderDocId: String(orderDocId || "").trim(),
        reason: String(reason || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.orderDocId) {
        throw new Error("orderDocId is verplicht.");
      }
    return processed;
  }
);

export const assignPersonnelToStation = createCallableWrapper<AssignPersonnelToStationInput>(
  "assignPersonnelToStation",
  (payload) => {
    const { stationId, operatorId, operatorNumber, operatorName, date, departmentId, hoursWorked, shiftType, source, actorLabel } = payload;
    const processed = {
        stationId: String(stationId || "").trim(),
        operatorId: String(operatorId || "").trim(),
        operatorNumber: String(operatorNumber || "").trim(),
        operatorName: String(operatorName || "").trim(),
        date: String(date || "").trim(),
        departmentId: String(departmentId || "").trim(),
        hoursWorked: Number(hoursWorked),
        shiftType: String(shiftType || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.stationId || !processed.operatorId || !processed.date) {
        throw new Error("stationId, operatorId en date zijn verplicht.");
      }
    return processed;
  }
);

export const removePersonnelAssignment = createCallableWrapper<RemovePersonnelAssignmentInput>(
  "removePersonnelAssignment",
  (payload) => {
    const { assignmentId, stationId, source, actorLabel } = payload;
    const processed = {
        assignmentId: String(assignmentId || "").trim(),
        stationId: String(stationId || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.assignmentId) {
        throw new Error("assignmentId is verplicht.");
      }
    return processed;
  }
);

export const loanPersonnelToDepartment = createCallableWrapper<LoanPersonnelToDepartmentInput>(
  "loanPersonnelToDepartment",
  (payload) => {
    const { operatorNumber, operatorName, targetDepartment, targetStation, date, shiftLabel, shiftStart, shiftEnd, hoursWorked, isPloeg, loanFromDepartment, loanFromStation, originalShift, source, actorLabel } = payload;
    const processed = {
        operatorNumber: String(operatorNumber || "").trim(),
        operatorName: String(operatorName || "").trim(),
        targetDepartment: String(targetDepartment || "").trim(),
        targetStation: String(targetStation || "").trim(),
        date: String(date || "").trim(),
        shiftLabel: String(shiftLabel || "").trim(),
        shiftStart: String(shiftStart || "").trim(),
        shiftEnd: String(shiftEnd || "").trim(),
        hoursWorked: Number(hoursWorked),
        isPloeg: Boolean(isPloeg),
        loanFromDepartment: String(loanFromDepartment || "").trim(),
        loanFromStation: String(loanFromStation || "").trim(),
        originalShift: String(originalShift || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.operatorNumber || !processed.targetDepartment || !processed.targetStation || !processed.date) {
        throw new Error("operatorNumber, targetDepartment, targetStation en date zijn verplicht.");
      }
    return processed;
  }
);

export const saveOccupancyAssignments = async ({
  records,
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  const safeRecords = Array.isArray(records)
    ? records.filter((entry) => entry && typeof entry === "object")
    : [];

  if (safeRecords.length === 0) {
    throw new Error("records is verplicht.");
  }

  const result = await saveOccupancyAssignmentsCallable({
    records: safeRecords,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  });

  return result?.data || { ok: false };
};



export const saveOccupancyAssignment = async ({
  assignmentId,
  data,
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  const safeAssignmentId = String(assignmentId || "").trim();
  if (!safeAssignmentId || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("assignmentId en data zijn verplicht.");
  }

  return saveOccupancyAssignments({
    records: [{ assignmentId: safeAssignmentId, data }],
    source,
    actorLabel,
  });
};



export const deleteOccupancyAssignments = async ({
  assignmentIds,
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  const safeIds = Array.isArray(assignmentIds)
    ? assignmentIds.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  if (safeIds.length === 0) {
    throw new Error("assignmentIds is verplicht.");
  }

  const result = await deleteOccupancyAssignmentsCallable({
    assignmentIds: safeIds,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  });

  return result?.data || { ok: false };
};



export const deleteOccupancyAssignment = async ({
  assignmentId,
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  const safeAssignmentId = String(assignmentId || "").trim();
  if (!safeAssignmentId) {
    throw new Error("assignmentId is verplicht.");
  }

  return deleteOccupancyAssignments({
    assignmentIds: [safeAssignmentId],
    source,
    actorLabel,
  });
};



export const savePersonnelRecord = async ({
  personId = "",
  data,
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("data is verplicht.");
  }

  const result = await savePersonnelRecordCallable({
    personId: String(personId || "").trim(),
    data,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  });

  return result?.data || { ok: false };
};



export const createProductionMessages = createCallableWrapper<CreateProductionMessagesInput>(
  "createProductionMessages",
  (payload) => {
    const { messages, source, actorLabel } = payload;
    const processed = {
        messages: Array.isArray(messages) ? messages : [],
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.messages.length) {
        throw new Error("Minimaal 1 bericht is verplicht.");
      }
    return processed;
  }
);

export const transitionPrintQueueJobStatus = createCallableWrapper<TransitionPrintQueueJobStatusInput>(
  "transitionPrintQueueJobStatus",
  (payload) => {
    const { jobId, status, error, source, actorLabel, printerName } = payload;
    const processed = {
        jobId: String(jobId || "").trim(),
        status: String(status || "").trim(),
        error: String(error || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
        printerName: String(printerName || "").trim(),
      };
    if (!processed.jobId || !processed.status) {
        throw new Error("jobId en status zijn verplicht.");
      }
    return processed;
  }
);

export const requeuePrintQueueJob = createCallableWrapper<RequeuePrintQueueJobInput>(
  "requeuePrintQueueJob",
  (payload) => {
    const { jobId, source, actorLabel } = payload;
    const processed = {
        jobId: String(jobId || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.jobId) {
        throw new Error("jobId is verplicht.");
      }
    return processed;
  }
);

export const deletePrintQueueJob = createCallableWrapper<DeletePrintQueueJobInput>(
  "deletePrintQueueJob",
  (payload) => {
    const { jobId, source, actorLabel } = payload;
    const processed = {
        jobId: String(jobId || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.jobId) {
        throw new Error("jobId is verplicht.");
      }
    return processed;
  }
);

export const startProductionLots = createCallableWrapper<StartProductionLotsInput>(
  "startProductionLots",
  (payload) => {
    const { orderDocId, orderDocPath, orderSourcePath, orderId, itemCode, item, lotStart, totalToProduce, stationId, stationLabel, actorLabel, labelZplData, labelTemplateId, seriesGroupId, isFlangeSeries, lotNumbers, isVirtualLot, virtualReason } = payload;
    const processed = {
        orderDocId: String(orderDocId || "").trim(),
        orderDocPath: String(orderDocPath || "").trim(),
        orderSourcePath: String(orderSourcePath || "").trim(),
        orderId: String(orderId || "").trim(),
        itemCode: String(itemCode || "").trim(),
        item: String(item || "").trim(),
        lotStart: String(lotStart || "").trim(),
        totalToProduce: Number(totalToProduce),
        stationId: String(stationId || "").trim(),
        stationLabel: String(stationLabel || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
        labelZplData: typeof labelZplData === "string" ? labelZplData : "",
        labelTemplateId: String(labelTemplateId || "").trim(),
        seriesGroupId: String(seriesGroupId || "").trim(),
        isFlangeSeries: Boolean(isFlangeSeries),
        lotNumbers: Array.isArray(lotNumbers) ? lotNumbers.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
        isVirtualLot: Boolean(isVirtualLot),
        virtualReason: String(virtualReason || "").trim(),
      };
    if (!processed.orderDocId || !processed.orderId || !processed.itemCode || !processed.lotStart || !processed.stationId) {
        throw new Error("orderDocId, orderId, itemCode, lotStart en stationId zijn verplicht.");
      }
    return processed;
  }
);

export const editTrackedProductLotNumber = createCallableWrapper<EditTrackedProductLotNumberInput>(
  "editTrackedProductLotNumber",
  (payload) => {
    const { productId, newLotNumber, reason, source, actorLabel } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        newLotNumber: String(newLotNumber || "").trim(),
        reason: String(reason || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.productId || !processed.newLotNumber || !processed.reason) {
        throw new Error("productId, newLotNumber en reason zijn verplicht.");
      }
    return processed;
  }
);

export const reassignTrackedProductOrder = createCallableWrapper<ReassignTrackedProductOrderInput>(
  "reassignTrackedProductOrder",
  (payload) => {
    const { productId, newOrderId, targetOrderDocId, targetOrderPath, reason, source, actorLabel } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        newOrderId: String(newOrderId || "").trim(),
        targetOrderDocId: String(targetOrderDocId || "").trim(),
        targetOrderPath: String(targetOrderPath || "").trim(),
        reason: String(reason || "").trim(),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (!processed.productId || !processed.newOrderId || !processed.reason) {
        throw new Error("productId, newOrderId en reason zijn verplicht.");
      }
    return processed;
  }
);

export const linkPlanningOrderProduct = createCallableWrapper<LinkPlanningOrderProductInput>(
  "linkPlanningOrderProduct",
  (payload) => {
    const { orderDocId, productId, productImage } = payload;
    const processed = {
        orderDocId: String(orderDocId || "").trim(),
        productId: String(productId || "").trim(),
        productImage: String(productImage || "").trim(),
      };
    if (!processed.orderDocId || !processed.productId) {
        throw new Error("orderDocId en productId zijn verplicht.");
      }
    return processed;
  }
);

export const createPlanningOrderManual = createCallableWrapper<CreatePlanningOrderManualInput>(
  "createPlanningOrderManual",
  (payload) => {
    const { orderId, item, machine, plan } = payload;
    const processed = {
        orderId: String(orderId || "").trim(),
        item: String(item || "").trim(),
        machine: String(machine || "").trim(),
        plan: Number(plan),
      };
    if (!processed.orderId || !processed.item || !processed.machine || !Number.isFinite(processed.plan) || processed.plan <= 0) {
        throw new Error("orderId, item, machine en geldige plan zijn verplicht.");
      }
    return processed;
  }
);

export const markMazakLabelsPrinted = createCallableWrapper<MarkMazakLabelsPrintedInput>(
  "markMazakLabelsPrinted",
  (payload) => {
    const { productIds, stationId, isReprint, source, actorLabel } = payload;
    const processed = {
        productIds: Array.isArray(productIds) ? productIds.map((id) => String(id || "").trim()).filter(Boolean) : [],
        stationId: String(stationId || "").trim(),
        isReprint: Boolean(isReprint),
        source: String(source || "").trim(),
        actorLabel: String(actorLabel || "").trim(),
      };
    if (processed.productIds.length === 0) {
        throw new Error("productIds is verplicht.");
      }
    return processed;
  }
);

export const appendQcNote = async ({
  productId,
  note,
  archivedYear = null,
  source = "",
  actorLabel = "",
}: Record<string, unknown>) => {
  const parsedYear = archivedYear === null || archivedYear === undefined || archivedYear === ""
    ? null
    : Number(archivedYear);
  const payload = {
    productId: String(productId || "").trim(),
    note: String(note || "").trim(),
    archivedYear: Number.isFinite(parsedYear) ? parsedYear : null,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.productId || !payload.note) {
    throw new Error("productId en note zijn verplicht.");
  }

  const result = await appendQcNoteCallable(payload);
  return result?.data || { ok: false };
};



export const reserveAutoLotNumberRange = async ({
  stationId,
  count = 1,
  reserve = true,
}: Record<string, unknown>) => {
  const parsedCount = Number(count);
  const payload = {
    stationId: String(stationId || "").trim(),
    count: parsedCount,
    reserve: reserve !== false,
  };

  if (!payload.stationId || !Number.isFinite(payload.count) || payload.count < 1 || payload.count > 200) {
    throw new Error("stationId en geldige count (1-200) zijn verplicht.");
  }

  const result = await reserveAutoLotNumberRangeCallable(payload);
  return result?.data || { ok: false };
};



export const addOrderDependency = createCallableWrapper<AddOrderDependencyInput>(
  "addOrderDependency",
  (payload) => {
    const { orderId, dependencyId } = payload;
    const processed = {
        orderId: String(orderId || "").trim(),
        dependencyId: String(dependencyId || "").trim(),
      };
    if (!processed.orderId || !processed.dependencyId) {
        throw new Error("orderId en dependencyId zijn verplicht.");
      }
    return processed;
  }
);

export const removeOrderDependency = createCallableWrapper<RemoveOrderDependencyInput>(
  "removeOrderDependency",
  (payload) => {
    const { orderId, dependencyId } = payload;
    const processed = {
        orderId: String(orderId || "").trim(),
        dependencyId: String(dependencyId || "").trim(),
      };
    if (!processed.orderId || !processed.dependencyId) {
        throw new Error("orderId en dependencyId zijn verplicht.");
      }
    return processed;
  }
);

export const updateOrderPlannedDate = async ({ orderId, plannedDate }: Record<string, unknown>) => {
  const safeOrderId = String(orderId || "").trim();
  if (!safeOrderId || !plannedDate) {
    throw new Error("orderId en plannedDate zijn verplicht.");
  }
  const safeDate = plannedDate instanceof Date ? plannedDate.toISOString() : String(plannedDate);
  const result = await updateOrderPlannedDateCallable({ orderId: safeOrderId, plannedDate: safeDate });
  return result?.data || { ok: false };
};



export const updateOrderKanbanStatus = createCallableWrapper<UpdateOrderKanbanStatusInput>(
  "updateOrderKanbanStatus",
  (payload) => {
    const { orderId, status } = payload;
    const processed = {
        orderId: String(orderId || "").trim(),
        status: String(status || "").trim(),
      };
    if (!processed.orderId || !processed.status) {
        throw new Error("orderId en status zijn verplicht.");
      }
    return processed;
  }
);

export const markReadyForNextStep = async ({ productId }: Record<string, unknown>) => {
  const safeProductId = String(productId || "").trim();
  if (!safeProductId) {
    throw new Error("productId is verplicht.");
  }
  const result = await markReadyForNextStepCallable({ productId: safeProductId });
  return result?.data || { ok: false };
};



export const startTrackedProductRepair = async ({ productId, repairReason = "" }: Record<string, unknown>) => {
  const safeProductId = String(productId || "").trim();
  if (!safeProductId) {
    throw new Error("productId is verplicht.");
  }
  const result = await startTrackedProductRepairCallable({
    productId: safeProductId,
    repairReason: String(repairReason || "").trim(),
  });
  return result?.data || { ok: false };
};



export const restoreArchivedTrackedProduct = async ({
  productId,
  targetRoute,
  note = "",
  sourceContext = "TEAMLEADER_FULL_LIST",
}: Record<string, unknown>) => {
  const safeProductId = String(productId || "").trim();
  const safeTargetRoute = String(targetRoute || "").trim().toUpperCase();
  const safeSourceContext = String(sourceContext || "").trim().toUpperCase();

  if (!safeProductId) {
    throw new Error("productId is verplicht.");
  }

  if (!["BH31", "NABEWERKING", "BM01"].includes(safeTargetRoute)) {
    throw new Error("targetRoute moet BH31, NABEWERKING of BM01 zijn.");
  }

  const result = await restoreArchivedTrackedProductCallable({
    productId: safeProductId,
    targetRoute: safeTargetRoute,
    note: String(note || "").trim(),
    sourceContext: safeSourceContext,
  });

  return result?.data || { ok: false };
};



export const reportShopFloorIssue = async ({
  type,
  machine = "",
  orderId = null,
  lotNumber = null,
  description = "",
  operatorName = "",
}: Record<string, unknown>) => {
  const safeType = String(type || "").trim();
  if (!["downtime", "defect"].includes(safeType)) {
    throw new Error('type moet "downtime" of "defect" zijn.');
  }
  const result = await reportShopFloorIssueCallable({
    type: safeType,
    machine: String(machine || "").trim(),
    orderId: orderId ? String(orderId).trim() : "",
    lotNumber: lotNumber ? String(lotNumber).trim() : "",
    description: String(description || "").trim(),
    operatorName: String(operatorName || "").trim(),
  });
  return result?.data || { ok: false };
};



export const resolveShopFloorIssue = async ({ type, issueId }: Record<string, unknown>) => {
  const safeType = String(type || "").trim();
  const safeIssueId = String(issueId || "").trim();
  if (!["downtime", "defect"].includes(safeType) || !safeIssueId) {
    throw new Error("type en issueId zijn verplicht.");
  }
  const result = await resolveShopFloorIssueCallable({ type: safeType, issueId: safeIssueId });
  return result?.data || { ok: false };
};



export const importPlanningOrders = async ({ orders, importMode = "new_only", hoursOnlyMode = false }: Record<string, unknown>) => {
  const safeMode = String(importMode || "new_only").trim().toLowerCase();
  if (!["new_only", "overwrite", "smart_update"].includes(safeMode)) {
    throw new Error("Ongeldige importMode.");
  }

  const safeOrders = Array.isArray(orders) ? orders.filter((entry) => entry && typeof entry === "object") : [];
  if (safeOrders.length === 0) {
    throw new Error("Minimaal 1 order is verplicht.");
  }

  const result = await importPlanningOrdersCallable({
    orders: safeOrders,
    importMode: safeMode,
    hoursOnlyMode: Boolean(hoursOnlyMode),
    runtimeDataSource: {
      planningPath: getPathString(PATHS.PLANNING),
      planningLegacyPath: getPathString(PATHS.PLANNING_LEGACY),
    },
  });

  return result?.data || { ok: false };
};



export const queuePrintJob = async (printerId: unknown, zplData: unknown, metadata: Record<string, unknown> = {}) => {
  const payload = {
    printerId: String(printerId || "").trim(),
    zplData: String(zplData || "").trim(),
    metadata: (typeof metadata === "object" && metadata) || {},
  };

  if (!payload.printerId) {
    throw new Error("printerId is verplicht.");
  }

  if (!payload.zplData) {
    throw new Error("zplData is verplicht.");
  }

  // Vuurt de backend cloud function af voor ISO compliance, validatie en scoping.
  // We retourneren de promise (of awaiten we hem in de call site), maar zorgen dat we de backend gebruiken.
  const result = await queuePrintJobCallable(payload);
  return result?.data || null; // Returns document ID
};



export const updateUserProfile = async (profileData: Record<string, unknown>) => {
  if (!profileData?.name || !profileData?.language) {
    throw new Error("Naam en taal zijn verplicht.");
  }

  const payload = {
    profileData: {
      name: String(profileData.name || "").trim(),
      email: String(profileData.email || "").trim(),
      emailNotifications: Boolean(profileData.emailNotifications),
      systemAlerts: Boolean(profileData.systemAlerts ?? true),
      language: String(profileData.language || "nl").trim(),
      darkMode: Boolean(profileData.darkMode),
      phoneNumber: String(profileData.phoneNumber || "").trim(),
      department: String(profileData.department || "").trim(),
      signature: String(profileData.signature || "").trim(),
    }
  };

  const result = await updateUserProfileCallable(payload);
  return result?.data || { ok: false };
};



export const clearPasswordChangeFlag = async () => {
  const result = await clearPasswordChangeFlagCallable({});
  return result?.data || { ok: false };
};



export const submitAccountRequest = async (requestData: Record<string, unknown>) => {
  if (!requestData?.name || !requestData?.email) {
    throw new Error("Naam en e-mailadres zijn verplicht.");
  }

  const payload = {
    requestData: {
      name: String(requestData.name || "").trim(),
      email: String(requestData.email || "").trim(),
      country: String(requestData.country || "").trim(),
      department: String(requestData.department || "").trim(),
    }
  };

  const result = await submitAccountRequestCallable(payload);
  return result?.data || { ok: false };
};



export const updateUserLanguage = async (language: unknown) => {
  if (!language) {
    throw new Error("Taalcode is verplicht.");
  }

  const payload = {
    language: String(language || "nl").trim().toLowerCase(),
  };

  const result = await updateUserLanguageCallable(payload);
  return result?.data || { ok: false };
};



export const executeAutomationRule = async (rule: unknown) => {
  if (!rule || typeof rule !== "object") {
    throw new Error("rule is verplicht.");
  }

  const result = await executeAutomationRuleCallable({ rule });
  return result?.data || { triggered: false, error: "Lege automation response" };
};




export const updateProductionStandard = async ({ standardId, standardMinutes, autoLearning = null }: Record<string, unknown>) => {
  const result = await updateProductionStandardCallable({
    standardId: String(standardId || "").trim(),
    standardMinutes: Number(standardMinutes),
    ...(autoLearning ? { autoLearning } : {}),
  });
  return result?.data || { ok: false };
};



export const saveProductRecord = createCallableWrapper<SaveProductRecordInput>(
  "saveProductRecord",
  (payload) => {
    const { productId, productData, clearVerification } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        productData: (typeof productData === "object" && productData) || {},
        clearVerification: Boolean(clearVerification),
      };
    
    return processed;
  }
);

export const deleteProductRecord = async (productId: unknown) => {
  const payload = { productId: String(productId || "").trim() };
  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  const result = await deleteProductRecordCallable(payload);
  return result?.data || { ok: false };
};



export const verifyProductRecord = createCallableWrapper<VerifyProductRecordInput>(
  "verifyProductRecord",
  (payload) => {
    const { productId, actorName } = payload;
    const processed = {
        productId: String(productId || "").trim(),
        actorName: String(actorName || "").trim(),
      };
    if (!processed.productId) {
        throw new Error("productId is verplicht.");
      }
    return processed;
  }
);

export const upsertConversionRecord = createCallableWrapper<UpsertConversionRecordInput>(
  "upsertConversionRecord",
  (payload) => {
    const { recordId, recordData } = payload;
    const processed = {
        recordId: String(recordId || "").trim(),
        recordData: (typeof recordData === "object" && recordData) || {},
      };
    
    return processed;
  }
);

export const deleteConversionRecord = async (recordId: unknown) => {
  const payload = { recordId: String(recordId || "").trim() };
  if (!payload.recordId) {
    throw new Error("recordId is verplicht.");
  }

  const result = await deleteConversionRecordCallable(payload);
  return result?.data || { ok: false };
};



export const deleteAllConversionRecords = async () => {
  const result = await deleteAllConversionRecordsCallable({});
  return result?.data || { ok: false, deleted: 0 };
};



export const upsertConversionBatch = createCallableWrapper<UpsertConversionBatchInput>(
  "upsertConversionBatch",
  (payload) => {
    const { items, mode } = payload;
    const processed = {
        items: Array.isArray(items) ? items : [],
        mode: String(mode || "merge").trim().toLowerCase(),
      };
    if (!processed.items.length) {
        throw new Error("items mag niet leeg zijn.");
      }
    return processed;
  }
);

export const processInforUpdate = async (csvData: unknown[] = []) => {
  if (!Array.isArray(csvData) || !csvData.length) {
    throw new Error("csvData is verplicht.");
  }

  const result = await processInforUpdateCallable({ csvData });
  return result?.data || {
    countCreated: 0,
    countUpdated: 0,
    countDeleted: 0,
    countMatched: 0,
    unmatchedOrders: [],
  };
};



export const saveAiContextConfig = async (systemPrompt: unknown) => {
  if (!systemPrompt) {
    throw new Error("systemPrompt is verplicht.");
  }
  const result = await saveAiContextConfigCallable({ systemPrompt: String(systemPrompt) });
  return result?.data || { ok: false };
};



export const createAiDocumentRecord = async (payload = {}) => {
  const result = await createAiDocumentRecordCallable({ payload });
  return result?.data || { ok: false };
};



export const updateAiDocumentRecord = async ({ docId = "", patch = {} }: Record<string, unknown>) => {
  const result = await updateAiDocumentRecordCallable({ docId: String(docId || ""), patch });
  return result?.data || { ok: false };
};



export const deleteAiDocumentRecord = async (docId: unknown) => {
  const result = await deleteAiDocumentRecordCallable({ docId: String(docId || "") });
  return result?.data || { ok: false };
};



export const verifyAiKnowledgeEntry = async ({ entryId = "", correctedAnswer = null }: Record<string, unknown>) => {
  const result = await verifyAiKnowledgeEntryCallable({
    entryId: String(entryId || ""),
    correctedAnswer,
  });
  return result?.data || { ok: false };
};



export const deleteAiKnowledgeEntry = async (entryId: unknown) => {
  const result = await deleteAiKnowledgeEntryCallable({ entryId: String(entryId || "") });
  return result?.data || { ok: false };
};



export const migrateAiKnowledgeFields = async () => {
  const result = await migrateAiKnowledgeFieldsCallable({});
  return result?.data || { ok: false, updated: 0 };
};

/**
 * Admin migration callable contract for doc-id/orderId mismatches.
 * Input:
 *  - mode: 'scan' | 'apply'
 *  - orderId?: string | null
 *  - mismatches?: Array<{
 *      collection: string,
 *      oldDocId: string,
 *      newDocId: string,
 *      orderId: string,
 *      machine?: string,
 *      lotNumber?: string,
 *      staleFieldsId?: string | null,
 *    }> | null
 * Output (scan):
 *  - { mode: 'scan', mismatches: Array, totalFound: number }
 * Output (apply):
 *  - { mode: 'apply', results: Array<{ status: 'FIXED'|'SKIPPED'|'ERROR', reason?: string }>, totalFixed: number }
 */


export const runMigrationTool = async ({ mode, orderId, mismatches }: Record<string, unknown>) => {
  const result = await runMigrationToolCallable({ mode, orderId: orderId || null, mismatches: mismatches || null });
  return result?.data;
};



export const previewAtpsOccupancyExport = async ({
  limit = 200,
  dryRun = true,
  executeLive = false,
  dateFrom = null,
  dateTo = null,
}: Record<string, unknown> = {}) => {
  const result = await previewAtpsOccupancyExportCallable({
    limit,
    dryRun,
    executeLive,
    dateFrom,
    dateTo,
  });
  return result?.data || {};
};



export const executeAtpsOccupancyExport = async ({
  limit = 200,
}: Record<string, unknown> = {}) => {
  const result = await executeAtpsOccupancyExportCallable({
    limit,
  });
  return result?.data || {};
};



export const getAtpsExportMonitor = async ({
  runsLimit = 20,
  previewLimit = 20,
}: Record<string, unknown> = {}) => {
  const result = await getAtpsExportMonitorCallable({
    runsLimit,
    previewLimit,
  });
  return result?.data || { runs: [], previewRuns: [], retryQueue: {} };
};



export const saveLnQrExportHistory = async ({
  exportKind = "qr",
  resetCounters = true,
  periodLabel = "",
  rangeMode = "export",
  clientTempId = "",
  rows = [],
}: Record<string, unknown> = {}) => {
  const result = await saveLnQrExportHistoryCallable({
    exportKind: String(exportKind || "qr").trim(),
    resetCounters: Boolean(resetCounters),
    periodLabel: String(periodLabel || "").trim(),
    rangeMode: String(rangeMode || "export").trim(),
    clientTempId: String(clientTempId || "").trim(),
    rows: Array.isArray(rows) ? rows : [],
  });
  return result?.data || { ok: false };
};


export const fetchOrderActivityLogs = createCallableWrapper<{ orderId: string }, { logs: any[] }>('getOrderActivityLogs');

