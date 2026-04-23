const getNumeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getOrderIdentity = (order) => String(order?.orderId || order?.id || "").trim();

export const getTrackedRecordOrderId = (record) => {
  const directOrderId = String(record?.orderId || "").trim();
  if (directOrderId) return directOrderId;

  const rawId = String(record?.id || "").trim();
  if (!rawId) return "";

  return rawId.replace(/_\d{6,}$/, "");
};

export const getTrackedRecordLotId = (record) => {
  const directLot = String(record?.lotNumber || record?.activeLot || "").trim();
  if (directLot) return directLot;

  const rawId = String(record?.id || "").trim();
  if (!rawId) return "";

  const lotFromId = rawId.match(/_(\d{6,})$/);
  return lotFromId ? lotFromId[1] : "";
};

export const isTrackedRecordFinished = (record) => {
  const statusUpper = String(record?.status || "").trim().toUpperCase();
  const stepUpper = String(record?.currentStep || "").trim().toUpperCase();
  const stationUpper = String(record?.currentStation || "").trim().toUpperCase();

  return (
    ["COMPLETED", "FINISHED", "GEREED"].includes(statusUpper) ||
    stepUpper === "FINISHED" ||
    stationUpper === "GEREED" ||
    !!record?.archivedAt
  );
};

export const countFinishedTrackedLots = (
  records = [],
  { orderId = "", getOrderIdFromRecord = getTrackedRecordOrderId } = {}
) => {
  const normalizedOrderId = String(orderId || "").trim();

  return Array.from(
    new Set(
      (Array.isArray(records) ? records : [])
        .filter((record) => {
          if (normalizedOrderId && getOrderIdFromRecord(record) !== normalizedOrderId) return false;
          return isTrackedRecordFinished(record);
        })
        .map(getTrackedRecordLotId)
        .filter(Boolean)
    )
  ).length;
};

export const getOrderFinishedUnits = (order, options = {}) => {
  const orderFinishedQty = Math.max(
    getNumeric(order?.produced),
    getNumeric(order?.finishedCount),
    getNumeric(order?.finishValue),
    getNumeric(order?.wrapped),
    getNumeric(order?.completed)
  );

  const trackedFinishedQty = (() => {
    if (typeof options.trackedFinishedCount === "number") {
      return getNumeric(options.trackedFinishedCount);
    }

    if (options.trackedFinishedCountByOrder instanceof Map) {
      return getNumeric(options.trackedFinishedCountByOrder.get(getOrderIdentity(order)));
    }

    if (Array.isArray(options.trackedRecords)) {
      return countFinishedTrackedLots(options.trackedRecords, {
        orderId: getOrderIdentity(order),
        getOrderIdFromRecord: options.getOrderIdFromRecord,
      });
    }

    return 0;
  })();

  return Math.max(orderFinishedQty, trackedFinishedQty);
};