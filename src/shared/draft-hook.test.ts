import { describe, it, expect } from "vitest";
import { draftLeadsWithHook } from "./draft-hook";

describe("draftLeadsWithHook", () => {
  it("detects when the draft opens with the hook verbatim", () => {
    expect(
      draftLeadsWithHook("Table 14 needed a split check. That thought sat for two years.", "Table 14 needed a split check")
    ).toBe(true);
  });

  it("ignores casing, quotes, and trailing punctuation", () => {
    expect(draftLeadsWithHook("“Shipped it today,” and here's how.", "shipped it today")).toBe(true);
  });

  it("returns false when the draft opens differently", () => {
    expect(draftLeadsWithHook("Two years later I opened a terminal.", "Table 14 needed a split check")).toBe(false);
  });

  it("returns false for an empty or missing hook", () => {
    expect(draftLeadsWithHook("Any draft text.", "")).toBe(false);
    expect(draftLeadsWithHook("Any draft text.", null)).toBe(false);
  });
});
