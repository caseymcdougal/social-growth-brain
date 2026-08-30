import { describe, expect, it } from "vitest";
import { buildComplianceCheck, nextComplianceCheckAt } from "../../../src/brain/compliance/policy";

describe("Batch Compliance policy", () => {
  it("schedules retained IDs no more than 12 hours apart", () => {
    expect(nextComplianceCheckAt("2026-08-27T12:00:00.000Z")).toBe("2026-08-28T00:00:00.000Z");
  });

  it.each([
    ["2026-08-27T12:00:00.000+05:30", "2026-08-27T18:30:00.000Z"],
    ["2026-03-08T01:30:00.000-06:00", "2026-03-08T19:30:00.000Z"]
  ])("uses the explicit offset and schedules exactly 12 hours later", (checkedAt, expected) => {
    expect(nextComplianceCheckAt(checkedAt)).toBe(expected);
  });

  it.each(["2026-08-27T12:00:00.000", "not-a-timestamp"])("rejects a non-offset or invalid checked time", (checkedAt) => {
    expect(() => nextComplianceCheckAt(checkedAt)).toThrow();
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
