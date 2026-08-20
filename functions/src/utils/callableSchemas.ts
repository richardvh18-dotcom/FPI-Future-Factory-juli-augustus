import { z } from "zod";

export const qcMeasurementCallableSchema = z
  .object({
    lotNumber: z.string().min(1),
    ri: z.number().finite().optional(),
    refractiveIndex: z.number().finite().optional(),
    brix: z.number().finite().optional(),
    tg: z.number().finite().optional(),
  })
  .passthrough()
  .refine(
    (data) => data.ri !== undefined || data.refractiveIndex !== undefined || data.brix !== undefined || data.tg !== undefined,
    "Minimaal RI, refractiveIndex, brix of Tg is verplicht.",
  );

export const qcInspectionCallableSchema = z
  .object({
    lotNumber: z.string().min(1),
    result: z.string().min(1),
  })
  .passthrough();

export const qcMeasurementUpdateCallableSchema = z
  .object({ measurementId: z.string().min(1) })
  .passthrough();

export const qcMigrationCallableSchema = z
  .object({
    limit: z.number().int().positive().max(10000).optional(),
    dryRun: z.boolean().optional(),
    migrateMeasurements: z.boolean().optional(),
    migrateInspectionsToGeneric: z.boolean().optional(),
  })
  .passthrough();

export const copilotCallableSchema = z
  .object({
    query: z.string().min(1),
    history: z.array(z.unknown()).optional().default([]),
  })
  .passthrough();

export const embeddingsCallableSchema = z
  .object({
    docId: z.string().min(1),
    fullText: z.string().min(1),
    fileName: z.string().min(1).optional(),
  })
  .passthrough();

export const smartSchedulerCallableSchema = z
  .object({ orders: z.array(z.record(z.string(), z.unknown())) })
  .passthrough();

export const activityLogsCallableSchema = z
  .object({ orderId: z.string().min(1) })
  .passthrough();

export const firebaseUsageCallableSchema = z
  .object({ periodDays: z.number().int().positive().max(90).optional() })
  .passthrough();

export const manualSyncDrawingsCallableSchema = z.record(z.string(), z.unknown());

export const planningOrderLookupCallableSchema = z
  .object({
    orderDocId: z.string().min(1),
    source: z.string().max(80).optional(),
    actorLabel: z.string().max(120).optional(),
  })
  .passthrough();

export const reconcileOrderCallableSchema = z
  .object({
    orderId: z.string().min(1),
    machine: z.string().min(1),
  })
  .passthrough();
