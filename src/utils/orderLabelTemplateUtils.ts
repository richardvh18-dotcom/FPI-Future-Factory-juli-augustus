import { applyLabelLogic, processLabelData } from './labelHelpers';

type AnyRecord = Record<string, unknown>;

export const getOrderLabelOrder = (item: AnyRecord = {}): string =>
  String(
    item.orderId ||
      item.orderNumber ||
      item.Order ||
      item.Productieorder ||
      item.order ||
      item.originalOrderId ||
      item.id ||
      'ONBEKEND'
  );

export const getOrderLabelItemCode = (item: AnyRecord = {}): string =>
  String(
    item.itemCode ||
      item.productCode ||
      item.articleCode ||
      item.productId ||
      item.Item ||
      item.Artikel ||
      item.item ||
      ''
  );

export const getOrderLabelDescription = (item: AnyRecord = {}): string =>
  String(
    item.itemDescription ||
      item.description ||
      item.Description ||
      item.Omschrijving ||
      item.item ||
      ''
  );

export const buildOrderLabelTemplateProduct = (item: AnyRecord = {}): AnyRecord => {
  const itemCode = getOrderLabelItemCode(item);
  const description = getOrderLabelDescription(item);

  return {
    ...item,
    itemCode,
    productId: item.productId || itemCode,
    description,
    item: item.item || description,
    extraCode: item.extraCode || item.Code || '',
  };
};

export const normalizeOrderLabelProductData = (item: AnyRecord = {}): AnyRecord => {
  const order = getOrderLabelOrder(item);
  const itemCode = getOrderLabelItemCode(item);
  const description = getOrderLabelDescription(item);

  return {
    ...item,
    orderId: order,
    orderNumber: order,
    itemCode,
    productId: itemCode,
    item: description,
    description,
    itemDescription: description,
    lotNumber: item.lotNumber || order,
  };
};

export const buildOrderLabelPreviewData = (
  item: AnyRecord = {},
  labelRules: Record<string, unknown>[] | null | undefined = []
): AnyRecord => {
  const normalized = normalizeOrderLabelProductData(item);
  const base = processLabelData(normalized);
  return applyLabelLogic(base, labelRules || []);
};
