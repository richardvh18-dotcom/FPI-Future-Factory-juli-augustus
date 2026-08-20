import { describe, expect, it } from "vitest";
import {
  InforOrderSchema,
  MachineStatusSchema,
  PrintJobSchema,
  QualityMeasurementSchema,
} from "../src/schemas/productionSchemas";

describe("production schemas", () => {
  it("validates machine status and rejects invalid status values", () => {
    expect(
      MachineStatusSchema.parse({
        machineId: "BH18",
        stationId: "40BH18",
        status: "running",
        cycleCount: 12,
      }).machineId,
    ).toBe("BH18");

    expect(() => MachineStatusSchema.parse({ machineId: "BH18", status: "unknown" })).toThrow();
  });

  it("validates the Infor order contract", () => {
    expect(InforOrderSchema.parse({ orderId: "N20023990", quantity: 4 }).orderId).toBe("N20023990");
    expect(() => InforOrderSchema.parse({ quantity: 4 })).toThrow();
  });

  it("defaults print label count and rejects non-positive counts", () => {
    expect(PrintJobSchema.parse({ jobId: "job-1" }).labelCount).toBe(1);
    expect(() => PrintJobSchema.parse({ jobId: "job-1", labelCount: 0 })).toThrow();
  });

  it("validates quality measurements", () => {
    expect(
      QualityMeasurementSchema.parse({
        orderId: "N20023990",
        result: "OK",
        value: 12.4,
        unit: "mm",
      }).result,
    ).toBe("OK");

    expect(() => QualityMeasurementSchema.parse({ orderId: "N20023990", result: "MAYBE" })).toThrow();
  });
});
