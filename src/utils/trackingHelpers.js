import { toDateSafe } from "./dateUtils";

export const normalizeOrderStatus = (status) =>
  String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export const getTrackedStatus = (product) => String(product?.status || "").trim().toLowerCase();

export const getTrackedStep = (product) => String(product?.currentStep || "").trim().toLowerCase();

export const isArchivedRejectedProduct = (product) => getTrackedStatus(product) === "archived_rejected";

export const isFinishedProduct = (product) => {
  const status = getTrackedStatus(product);
  const step = getTrackedStep(product);
  return ["finished", "completed", "gereed"].includes(status) || step === "finished";
};

export const isRejectedProduct = (product) => {
  if (isArchivedRejectedProduct(product)) return false;
  const status = getTrackedStatus(product);
  const step = getTrackedStep(product);
  return ["rejected", "afkeur"].includes(status) || step === "rejected";
};

export const isInactiveTrackedProduct = (product) => {
  return isArchivedRejectedProduct(product) || isFinishedProduct(product) || isRejectedProduct(product);
};

export const subtractWorkingDays = (fromDate, days) => {
  const d = new Date(fromDate);
  let counted = 0;
  while (counted < days) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) counted++;
  }
  return d;
};

export const getTrackedCompletionDate = (item) => {
  return (
    toDateSafe(item?.timestamps?.finished) ||
    toDateSafe(item?.timestamps?.completed) ||
    toDateSafe(item?.archivedAt) ||
    toDateSafe(item?.updatedAt) ||
    toDateSafe(item?.timestamps?.lossen_start) ||
    toDateSafe(item?.timestamps?.wikkelen_end) ||
    toDateSafe(item?.timestamps?.station_end) ||
    toDateSafe(item?.createdAt)
  );
};