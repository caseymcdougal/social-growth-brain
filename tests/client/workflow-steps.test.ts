import { describe, expect, it } from "vitest";
import { getCurrentStep, getStepState } from "../../src/client/utils/workflow-steps";
import type { AnalysisSummary } from "../../src/shared/analysis-schema";
import type { GenerationOutput } from "../../src/shared/generation-schema";
import type { CapturedAccountSnapshot } from "../../src/shared/types";

const snapshot = { posts: [], profile: { handle: "casey", capturedAt: "2026-01-01" } } as unknown as CapturedAccountSnapshot;
const analysis = { executive_summary: "test" } as AnalysisSummary;
const generation = { posts: [{ title: "A", hook: "h", draft: "d", angle: "a", why_this: "w" }] } as GenerationOutput;

describe("workflow steps", () => {
  it("maps empty state to scan", () => {
    expect(getCurrentStep(null, null, null)).toBe("scan");
  });

  it("maps scanned state to rank", () => {
    expect(getCurrentStep(snapshot, null, null)).toBe("rank");
  });

  it("maps audited state to write", () => {
    expect(getCurrentStep(snapshot, analysis, null)).toBe("write");
  });

  it("marks earlier steps complete when generation exists", () => {
    expect(getStepState("scan", "write", generation)).toBe("complete");
    expect(getStepState("rank", "write", generation)).toBe("complete");
    expect(getStepState("write", "write", generation)).toBe("complete");
  });

  it("marks rank as current when only snapshot exists", () => {
    expect(getCurrentStep(snapshot, null, null)).toBe("rank");
    expect(getStepState("rank", "rank", null)).toBe("current");
    expect(getStepState("scan", "rank", null)).toBe("complete");
  });
});