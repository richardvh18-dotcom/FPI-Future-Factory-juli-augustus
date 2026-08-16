export type PlanningViewMode = 'tiles' | 'list';

export const normalizePlanningViewMode = (value?: string | null): PlanningViewMode => {
  return value === 'list' ? 'list' : 'tiles';
};

export const shouldShowPlanningDetailPanel = (
  mode: PlanningViewMode,
  selectedOrderId?: string | null
) => mode !== 'list' && Boolean(selectedOrderId);

export const getPlanningListViewRowSummary = (
  order: Record<string, unknown>,
  weekLabel: string,
  toDoQty?: number
) => {
  const displayName = String(
    order?.itemDescription || order?.item || order?.itemCode || 'Onbekend product'
  ).trim();
  const manufacturedItem = String(order?.manufacturedItem || order?.manufacturedId || order?.itemCode || '').trim();
  const itemCode = String(order?.itemCode || order?.articleCode || '').trim();
  const quantity = Number(order?.plan || order?.quantity || order?.toDoQty || 1) || 1;
  const extraCode = String(order?.extraCode || '').trim();
  const project = String(order?.projectDesc || '').trim();
  const remainingQty = typeof toDoQty === 'number' && Number.isFinite(toDoQty) ? Math.max(0, toDoQty) : Math.max(0, quantity - (Number(order?.produced) || 0));

  const compactParts = [displayName || 'Onbekend product', `${quantity} st`];
  if (project) compactParts.push(project);
  if (extraCode) compactParts.push(extraCode);

  return {
    orderId: String(order?.orderId || '').trim(),
    displayName: displayName || 'Onbekend product',
    manufacturedItem,
    itemCode,
    quantity,
    extraCode,
    project,
    weekLabel,
    remainingQty,
    compactLine: compactParts.join(' • '),
  };
};
