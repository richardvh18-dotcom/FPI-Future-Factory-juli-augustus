import React from 'react';

export type AnyRecord = Record<string, unknown>;

export type LabelTemplate = {
  id: string;
  name?: string;
  width?: number;
  height?: number;
  tags?: string[];
  elements?: unknown[];
  [key: string]: unknown;
};

export type PrinterConfig = {
  id: string;
  name?: string;
  vendorId?: number | string;
  productId?: number | string;
  productName?: string;
  dpi?: number | string;
  darkness?: number | string;
  zplTextFont?: string;
  bitmapPrintEnabled?: boolean;
  queueStations?: unknown[];
  linkedStations?: unknown[];
  [key: string]: unknown;
};

export type DepartmentGroup = {
  key: string;
  label: string;
  stations: string[];
};

export type TempLabelItemProps = {
  item: AnyRecord;
  labelTemplates: LabelTemplate[];
  labelRules: AnyRecord[];
  printerDpi?: number;
  handleTempLegacyPrint: (orderData: AnyRecord, template: any, processedData: any) => Promise<void>;
  departmentGroups?: DepartmentGroup[];
  printers?: PrinterConfig[];
  stationId?: string;
};

export type TempLabelModalProps = {
  onClose: () => void;
  labelTemplates?: LabelTemplate[];
  labelRules?: AnyRecord[];
  printerDpi?: number;
  usbDevice: USBDevice | null;
  setUsbDevice: React.Dispatch<React.SetStateAction<USBDevice | null>>;
  activeQueuePrinter: PrinterConfig | null;
  requestLabelsQueuePrinter: (reason: string) => Promise<PrinterConfig | null>;
  selectedStation: string | null;
  departmentGroups?: DepartmentGroup[];
  printers?: PrinterConfig[];
};

export type LotPrintModalProps = {
  onClose: () => void;
  departmentGroups: DepartmentGroup[];
  onPrintBatch: (batchData: string, lotCount: number) => Promise<void>;
  printer: PrinterConfig | null;
};

export type PrintJob = AnyRecord & {
  id: string;
  status?: string;
  printerId?: string;
  printData?: string;
  zpl?: string;
  labelZPL?: string;
  createdAt?: { toDate?: () => Date } | Date;
  error?: string;
  metadata?: AnyRecord;
  description?: string;
};
