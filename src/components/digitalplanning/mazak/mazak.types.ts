import { Timestamp } from 'firebase/firestore';

export type TimestampLike = { toDate?: () => Date; seconds?: number };

export type ProductItem = {
  id?: string;
  orderId?: string;
  lotNumber?: string;
  item?: string;
  itemCode?: string;
  productId?: string;
  extraCode?: string;
  seriesGroupId?: string;
  mazakLabelPrinted?: boolean;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  machine?: string;
  lastStation?: string;
  inspection?: { status?: string };
  createdAt?: TimestampLike | string | number | Date | null;
  updatedAt?: TimestampLike | string | number | Date | null;
  [key: string]: unknown;
};

export type OccupancyEntry = {
  station?: string;
  machineId?: string;
  date?: TimestampLike | string | number | Date | null;
  shift?: string;
  operatorNumber?: string;
};

export type PlanningOrder = {
  id?: string;
  orderDocId?: string;
  orderDocPath?: string;
  orderId?: string;
  item?: string;
  itemCode?: string;
  machine?: string;
  plan?: number | string;
  productId?: string;
  extraCode?: string;
  lotNumber?: string;
  status?: string;
  week?: number | string;
  weekNumber?: number | string;
  year?: number | string;
  weekYear?: number | string;
  createdAt?: TimestampLike | string | number | Date | null;
  [key: string]: unknown;
};

export type LabelElement = {
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  isBold?: boolean;
  content?: string;
  maxLines?: number;
  align?: "left" | "center" | "right";
  vAlign?: "top" | "center" | "bottom";
  [key: string]: unknown;
};

export type LabelTemplate = {
  id: string;
  name?: string;
  width?: number;
  height?: number;
  tags?: string[];
  elements?: LabelElement[];
  [key: string]: unknown;
};

export type PrinterConfig = {
  id: string;
  name?: string;
  dpi?: number | string;
  isDefault?: boolean;
  linkedStations?: unknown[];
  queueStations?: unknown[];
  [key: string]: unknown;
};

export type AdminUser = { uid?: string; email?: string | null };

export type MazakViewProps = {
  stationId?: string;
  products?: ProductItem[];
};

export type SeriesHeaderRow = {
  id: string;
  isSeriesHeader: true;
  seriesGroupId: string;
  orderId: string;
  seriesCount: number;
  seriesUnits: ProductItem[];
};

export type DisplayRow = ProductItem | SeriesHeaderRow;

export type MazakTab = "planning" | "inbox" | "process" | "adjust" | "free";

export type SavedFreeLabelTemplate = {
  id: string;
  name: string;
  text: string;
  align: "left" | "center" | "right";
  fontSize: number;
  quantity: number;
  updatedAt?: number;
};

export type TranslateFn = (key: string, fallback?: string, options?: Record<string, unknown>) => string;

export type MazakTabNavigationProps = {
  activeTab: MazakTab;
  onSelectTab: (tab: MazakTab) => void;
  t: TranslateFn;
};

export type MazakListItemCardProps = {
  item: ProductItem;
  activeTab: MazakTab;
  isSelected: boolean;
  onSelect: (item: ProductItem) => void;
  t: TranslateFn;
};

export type MazakPlanningOrderCardProps = {
  order: PlanningOrder;
  isSelected: boolean;
  onSelect: (order: PlanningOrder) => void;
  orderMaterialBadge: string;
  orderProduced: number;
  orderTotal: number;
  orderDeliveryLabel: string;
  orderDeliveryColorClass: string;
  t: TranslateFn;
};

export type MazakAdjustListItemCardProps = {
  item: ProductItem;
  isSelected: boolean;
  onSelect: (item: ProductItem) => void;
  t: TranslateFn;
};

export type MazakSelectedProductHeroProps = {
  product: ProductItem;
  onClear: () => void;
  t: TranslateFn;
};

export type MazakSelectedPlanningOrderHeroProps = {
  order: PlanningOrder;
  materialBadge: string;
  deliveryLabel: string;
  quantity: number;
  produced: number;
  t: TranslateFn;
  onClear: () => void;
};

export type MazakPlanningActiveLotsPanelProps = {
  products: ProductItem[];
  onSelectProduct: (product: ProductItem) => void;
  t: TranslateFn;
};

export type MazakAdjustSelectionPanelProps = {
  product: ProductItem;
  onChangeOrder: () => void;
  onRequestNewOrder: () => void;
  t: TranslateFn;
};

export type MazakEmptySelectionPlaceholderProps = {
  activeTab: MazakTab;
  t: TranslateFn;
};

export type MazakFreeLabelHeroProps = {
  t: TranslateFn;
};

export type MazakFreeLabelPreviewPanelProps = {
  template: LabelTemplate;
  freeText: string;
  printerDpi: number;
  t: TranslateFn;
};

export type MazakFreeLabelActionsProps = {
  printing: boolean;
  savingFreeTemplate: boolean;
  freeLabelText: string;
  freeLabelTemplateName: string;
  freeLabelQuantity: number;
  onPrint: () => void;
  onSaveTemplate: () => void;
  t: TranslateFn;
};

export type MazakFreeLabelAlignmentSelectorProps = {
  align: "left" | "center" | "right";
  onSelectAlign: (align: "left" | "center" | "right") => void;
  t: TranslateFn;
};

export type MazakFreeLabelSizingFieldsProps = {
  freeLabelFontSize: number;
  freeLabelQuantity: number;
  onChangeFontSize: (value: unknown) => void;
  onChangeQuantity: (value: string) => void;
  t: TranslateFn;
};

export type MazakFreeLabelTextFieldsProps = {
  freeLabelTemplateName: string;
  freeLabelText: string;
  onChangeTemplateName: (value: string) => void;
  onChangeFreeText: (value: string) => void;
  t: TranslateFn;
};

export type MazakFreeLabelFormPanelProps = {
  freeLabelTemplateName: string;
  freeLabelText: string;
  freeLabelAlign: "left" | "center" | "right";
  freeLabelFontSize: number;
  freeLabelQuantity: number;
  printing: boolean;
  savingFreeTemplate: boolean;
  onChangeTemplateName: (value: string) => void;
  onChangeFreeText: (value: string) => void;
  onSelectAlign: (align: "left" | "center" | "right") => void;
  onChangeFontSize: (value: unknown) => void;
  onChangeQuantity: (value: string) => void;
  onPrint: () => void;
  onSaveTemplate: () => void;
  t: TranslateFn;
};

export type MazakAdjustModalHeaderProps = {
  title: string;
  lotLabel: string;
  onClose: () => void;
  disabled: boolean;
};

export type MazakAdjustOrderModalActionsProps = {
  submitting: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
};

export type MazakAdjustRequestModalActionsProps = {
  submitting: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
  t: TranslateFn;
};

export type MazakAdjustPreviewPanelProps = {
  hasTargetOrder: boolean;
  previewTemplates: LabelTemplate[];
  previewData: Record<string, unknown>;
  printerDpi: number;
};

export type MazakAdjustOrderModalLeftPanelProps = {
  adjustOrderSearch: string;
  selectedAdjustFlangeSize: string;
  selectedAdjustOrderFamily: string;
  adjustTargetOrders: PlanningOrder[];
  selectedAdjustTargetOrder: PlanningOrder | null;
  adjustReason: string;
  onChangeAdjustOrderSearch: (value: string) => void;
  onSelectAdjustTargetOrder: (order: PlanningOrder) => void;
  onChangeAdjustReason: (value: string) => void;
  t: TranslateFn;
};

export type MazakAdjustRequestModalBodyProps = {
  adjustReason: string;
  adjustRequestNote: string;
  onChangeAdjustReason: (value: string) => void;
  onChangeAdjustRequestNote: (value: string) => void;
  t: TranslateFn;
};