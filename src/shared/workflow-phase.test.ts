import { describe, expect, it } from "vitest";
import analysisFixture from "../../tests/fixtures/analysis-valid.json";
import snapshotFixture from "../../tests/fixtures/manual-import-valid.json";
import type { CapturedAccountSnapshot } from "./types";
import { getWorkflowPhase } from "./workflow-phase";

const snapshot = snapshotFixture as CapturedAccountSnapshot;

describe("getWorkflowPhase", () => {
  it("returns empty when no snapshot is loaded", () => {
    expect(getWorkflowPhase(null, null, null)).toBe("empty");
  });

  it("returns scanned when posts are loaded but not audited", () => {
    expect(getWorkflowPhase(snapshot, null, null)).toBe("scanned");
  });

  it("returns audited when analysis exists without drafts", () => {
    expect(getWorkflowPhase(snapshot, analysisFixture, null)).toBe("audited");
  });

  it("returns drafted when generation exists", () => {
    expect(
      getWorkflowPhase(snapshot, analysisFixture, {
        posts: [
          {
            title: "Draft",
            angle: "Angle",
            why_this: "Why",
            hook: "Hook",
            draft: "Draft body",
            source_signal: "Signal"
          }
        ]
      })
    ).toBe("drafted");
  });
});