export const extractLotSequence = (lot: string | null | undefined, baseLot: string | null | undefined): number => {
  const safeLot = String(lot ?? "").trim();
  const safeBaseLot = String(baseLot ?? "").trim();

  if (!safeLot || !safeBaseLot || !safeLot.startsWith(safeBaseLot)) {
    return 0;
  }

  const sequencePart = safeLot.substring(safeBaseLot.length).replace(/[^0-9]/g, "");
  if (!sequencePart) {
    return 0;
  }

  const parsed = Number.parseInt(sequencePart, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};
