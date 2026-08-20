import { z } from "zod";

const timestampSchema = z.union([z.string().datetime(), z.number().finite(), z.date()]);

export const machineStatusSchema = z
  .object({
    machineId: z.string().min(1),
    stationId: z.string().min(1).optional(),
    status: z.enum(["online", "offline", "idle", "running", "paused", "error", "maintenance"]),
    timestamp: timestampSchema.optional(),
    alarmCode: z.string().min(1).optional(),
    alarmMessage: z.string().min(1).optional(),
    cycleCount: z.number().int().nonnegative().optional(),
    temperature: z.number().finite().optional(),
  })
  .passthrough();

export const inforOrderSchema = z
  .object({
    orderId: z.string().min(1),
    itemCode: z.string().min(1).optional(),
    quantity: z.number().finite().nonnegative().optional(),
    status: z.string().min(1).optional(),
    deliveryDate: timestampSchema.optional(),
  })
  .passthrough();

export const printJobSchema = z
  .object({
    jobId: z.string().min(1),
    printerId: z.string().min(1).optional(),
    stationId: z.string().min(1).optional(),
    labelCount: z.number().int().positive().default(1),
    status: z.enum(["queued", "pending", "printing", "completed", "failed", "cancelled"]).optional(),
    payload: z.string().min(1).optional(),
  })
  .passthrough();

export const qualityMeasurementSchema = z
  .object({
    measurementId: z.string().min(1).optional(),
    orderId: z.string().min(1),
    productId: z.string().min(1).optional(),
    result: z.enum(["OK", "NOK", "PASS", "FAIL", "Goedgekeurd", "Afgekeurd"]),
    value: z.number().finite().optional(),
    unit: z.string().min(1).optional(),
    measuredAt: timestampSchema.optional(),
    measuredBy: z.string().min(1).optional(),
  })
  .passthrough();

export const MachineStatusSchema = machineStatusSchema;
export const InforOrderSchema = inforOrderSchema;
export const PrintJobSchema = printJobSchema;
export const QualityMeasurementSchema = qualityMeasurementSchema;

export type MachineStatus = z.infer<typeof MachineStatusSchema>;
export type InforOrder = z.infer<typeof InforOrderSchema>;
export type PrintJob = z.infer<typeof PrintJobSchema>;
export type QualityMeasurement = z.infer<typeof QualityMeasurementSchema>;
