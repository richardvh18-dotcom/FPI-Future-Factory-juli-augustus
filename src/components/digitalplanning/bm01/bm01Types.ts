export type TimestampLike = {
    toMillis?: () => number;
    seconds?: number;
};

export type OrderRecord = {
    id?: string;
    orderId?: string;
    status?: string;
    item?: string;
    itemDescription?: string;
    lnDeliveredQty?: string | number | null;
    deliveredQty?: string | number | null;
    quantityDelivered?: string | number | null;
    inspectionApprovedQty?: string | number | null;
    produced?: string | number | null;
    [key: string]: any;
};

export type HistoryEntry = {
    details?: string;
    station?: string;
    action?: string;
    timestamp?: TimestampLike | string | number | Date | null;
    time?: TimestampLike | string | number | Date | null;
    [key: string]: any;
};

export type ProductRecord = {
    id?: string;
    sourcePath?: string;
    __docPath?: string;
    lotNumber?: string;
    activeLot?: string;
    currentStation?: string;
    currentStep?: string;
    status?: string;
    orderId?: string;
    machine?: string;
    originMachine?: string;
    item?: string;
    itemDescription?: string;
    itemCode?: string;
    updatedAt?: TimestampLike | string | number | Date | null;
    createdAt?: TimestampLike | string | number | Date | null;
    lastStation?: string;
    timestamps?: Record<string, TimestampLike | string | number | Date | null | undefined>;
    history?: HistoryEntry[];
    inspection?: { status?: string };
    qcNotes?: Array<{ text: string; timestamp: string; user: string }>;
    isVirtualLot?: boolean;
    [key: string]: any;
};

export type SidebarEntry = {
    id?: string;
    orderId?: string;
    status?: string;
    item?: string;
    itemDescription?: string;
    machine?: string;
    originMachine?: string;
    isArchivedOrder?: boolean;
    archived?: boolean;
    archivedCandidates?: ProductRecord[];
    lotNumbers?: string[];
    lotNumbersText?: string;
    lotNumber?: string;
    timestamps?: Record<string, TimestampLike | string | number | Date | null | undefined>;
    updatedAt?: TimestampLike | string | number | Date | null;
    qcNotes?: Array<{ text: string; timestamp: string; user: string }>;
    [key: string]: any;
};

export type FinishPayload = {
    note?: string;
    reasons?: string[];
    [key: string]: any;
};

export type DeliveryMismatch = {
    orderId: string;
    item: string;
    deliveredQty: number;
    inspectionApprovedQty: number;
    delta: number;
};
