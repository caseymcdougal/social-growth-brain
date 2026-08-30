import { describe, expect, it } from "vitest";
import { buildComplianceCheck, nextComplianceCheckAt } from "../../../src/brain/compliance/policy";

describe("Batch Compliance policy", () => {
  it("schedules retained IDs no more than 12 hours apart", () => {
    expect(nextComplianceCheckAt("2026-08-27T12:00:00.000Z")).toBe("2026-08-28T00:00:00.000Z");
  });

  it.each([
    ["active", "retain"],
    ["edited", "rehydrate"],
    ["deleted", "purge"],
    ["protected", "purge"],
    ["withheld", "purge"],
    ["suspended", "purge"]
  ] as const)("maps %s to %s", (status, requiredAction) => {
    expect(
      buildComplianceCheck({
        retainedPostId: "900000000000000001",
        checkedAt: "2026-08-27T12:00:00.000Z",
        status,
        source: "synthetic",
        id: "50000000-0000-4000-8000-000000000001"
      }).requiredAction
    ).toBe(requiredAction);
  });
});
