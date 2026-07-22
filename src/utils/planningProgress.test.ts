import { describe, expect, it } from "vitest";
import { getOrderFinishedUnits, getTrackedRecordOrderId, getEffectivePlanQty, getOrderIdentity } from "./planningProgress";

describe("planningProgress", () => {
  it("prefers tracked finished count when higher than order produced", () => {
    const order = { orderId: "N1", produced: 3 };
    const result = getOrderFinishedUnits(order, { trackedFinishedCount: 5 });
    expect(result).toBe(5);
  });

  it("uses best available finished field from order", () => {
    const order = { orderId: "N2", finishedCount: 4, produced: 1 };
    const result = getOrderFinishedUnits(order);
    expect(result).toBe(4);
  });

  it("extracts order id from record id when orderId field is missing", () => {
    const record = { id: "N20024782_EL4MEMS0FR0A10BCCBB0_402619418400086" };
    const result = getTrackedRecordOrderId(record);
    expect(result).toBe("N20024782_EL4MEMS0FR0A10BCCBB0");
  });

  describe("getEffectivePlanQty", () => {
    it("uses quantity if plan is not set", () => {
      expect(getEffectivePlanQty({ quantity: 10 })).toBe(10);
    });
    it("uses plan if plan < quantity", () => {
      expect(getEffectivePlanQty({ quantity: 10, plan: 6 })).toBe(6);
    });
    it("uses quantity if plan > quantity", () => {
      expect(getEffectivePlanQty({ quantity: 10, plan: 15 })).toBe(10);
    });
  });

  describe("getOrderIdentity", () => {
    it("returns orderId if available", () => {
      expect(getOrderIdentity({ orderId: "ORD1", id: "ID1" })).toBe("ORD1");
    });
    it("returns id if orderId is missing", () => {
      expect(getOrderIdentity({ id: "ID1" })).toBe("ID1");
    });
  });
});
