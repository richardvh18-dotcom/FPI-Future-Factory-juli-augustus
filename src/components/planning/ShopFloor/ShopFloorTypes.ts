export type AnyRecord = Record<string, unknown>;

export interface FactoryStation {
  id?: string;
  name?: string;
  departmentName?: string;
}

export interface MachineStat {
  machine?: string;
  id?: string;
  department?: string;
  operatorName: string;
  activeOrder?: AnyRecord;
  ordersCount: number;
  downtimeCount: number;
  defectCount: number;
  activeProductsCount: number;
  hasIssues: boolean;
  isActive: boolean;
  status: string;
  hoursPerWeek?: number;
}

export interface OrderWithProducts {
  id?: string;
  orderId?: string;
  orderNumber?: string;
  item?: string;
  itemCode?: string;
  plan?: number | string;
  status?: string;
  machine?: string;
  products: AnyRecord[];
  activeProductsCount?: number;
  defectCount?: number;
  estimatedHours?: number | string;
  plannedDate?: { seconds: number; nanoseconds?: number };
  notes?: string;
  [key: string]: unknown;
}

export interface OccupancyRecord {
  id?: string;
  machine?: string;
  machineId?: string;
  station?: string;
  operatorName?: string;
  date?: string | { toDate: () => Date };
  [key: string]: unknown;
}

export interface ScanResult {
  type: 'product' | 'order' | 'personnel' | 'unknown';
  code: string;
  data: AnyRecord;
  onClick?: () => void;
}

export interface DefectReport {
  id: string;
  machine?: string;
  defectType?: string;
  severity?: string;
  description?: string;
  orderId?: string;
  operatorName?: string;
  status?: string;
  [key: string]: unknown;
}

export interface DowntimeReport {
  id: string;
  machine?: string;
  reason?: string;
  estimatedMinutes?: number | string;
  operatorName?: string;
  status?: string;
  [key: string]: unknown;
}
