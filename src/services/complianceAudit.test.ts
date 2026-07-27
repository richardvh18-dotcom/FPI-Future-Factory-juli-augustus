import { describe, expect, it } from "vitest";
import { buildComplianceDetails } from "./complianceAudit";

describe("buildComplianceDetails", () => {
  it("adds an event type and timestamp to structured details", () => {
    const details = buildComplianceDetails("EXPORT", {
      exportKind: "csv",
      recordCount: 12,
    });

    expect(details.eventType).toBe("EXPORT");
    expect(details.exportKind).toBe("csv");
    expect(details.recordCount).toBe(12);
    expect(typeof details.timestamp).toBe("string");
  });

  it("preserves provided metadata and supports arrays", () => {
    const details = buildComplianceDetails("QUALITY_REJECT", {
      reasons: ["crack", "dimensional"],
      note: "manual review",
    });

    expect(details.reasons).toEqual(["crack", "dimensional"]);
    expect(details.note).toBe("manual review");
  });
});
