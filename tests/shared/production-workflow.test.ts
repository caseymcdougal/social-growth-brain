import { describe, expect, it } from "vitest";
import {
  getProductionWorkflowSummary,
  getSlotWorkflowStatus,
  pruneProductionWorkflowState,
  setSlotWorkflowStatus,
  type ProductionWorkflowState
} from "../../src/shared/production-workflow";

describe("production workflow state", () => {
  it("tracks planned, used, and skipped states by queue slot", () => {
    let state: ProductionWorkflowState = {};

    state = setSlotWorkflowStatus(state, "generated-1", "planned");
    state = setSlotWorkflowStatus(state, "generated-2", "used");
    state = setSlotWorkflowStatus(state, "generated-3", "skipped");

    expect(getSlotWorkflowStatus(state, "generated-1")).toBe("planned");
    expect(getSlotWorkflowStatus(state, "generated-2")).toBe("used");
    expect(getSlotWorkflowStatus(state, "generated-3")).toBe("skipped");
    expect(getSlotWorkflowStatus(state, "generated-4")).toBe("open");
  });

  it("removes a slot from persisted workflow state when it is reopened", () => {
    const state = setSlotWorkflowStatus({ "generated-1": "planned" }, "generated-1", "open");

    expect(state).toEqual({});
  });

  it("summarizes queue state for the production workboard", () => {
    const summary = getProductionWorkflowSummary(
      ["selected-post-1", "generated-1", "generated-2", "generated-3"],
      {
        "selected-post-1": "planned",
        "generated-1": "used",
        "generated-2": "skipped"
      }
    );

    expect(summary).toEqual({
      open: 1,
      planned: 1,
      used: 1,
      skipped: 1,
      total: 4
    });
  });

  it("prunes stale slot ids when a new queue replaces the old one", () => {
    const state = pruneProductionWorkflowState(["generated-2"], {
      "generated-1": "planned",
      "generated-2": "used",
      "generated-3": "skipped"
    });

    expect(state).toEqual({ "generated-2": "used" });
  });
});
