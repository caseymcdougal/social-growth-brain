import { describe, expect, it } from "vitest";
import type { PostProductionPlan } from "../../src/shared/post-production-plan";
import { buildProductionOutcomeLoop, formatProductionOutcomeMetrics } from "../../src/shared/production-outcomes";
import type { ProductionWorkflowState } from "../../src/shared/production-workflow";
import type { PostSnapshotInput } from "../../src/shared/types";

const productionPlan: PostProductionPlan = {
  summary: "1 generated draft ready for review.",
  primarySlotId: "generated-1",
  slots: [
    {
      id: "generated-1",
      position: 1,
      source: "generated-draft",
      title: "Turn analytics into a strategist",
      status: "Ready to copy",
      timing: "Next post",
      hook: "A social dashboard should end with a next move.",
      draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
      rationale: "It continues the strongest contrast in the audit.",
      sourceSignal: "Specific product takes outperform broad claims.",
      actionLabel: "Copy draft",
      readiness: {
        score: 75,
        verdict: "Ready",
        checks: [],
        blockingFixes: []
      }
    }
  ]
};

const capturedPost: PostSnapshotInput = {
  xPostId: "posted-1",
  url: "https://x.com/caseymcdougal/status/posted-1",
  text: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
  postedAt: "2026-06-26T14:00:00.000Z",
  capturedAt: "2026-06-26T15:00:00.000Z",
  source: "manual",
  viewsCount: 1400,
  likesCount: 22,
  repostsCount: 5,
  repliesCount: 3,
  bookmarksCount: 1
};

describe("production outcomes", () => {
  it("matches used production slots against captured posts and exposes public metrics", () => {
    const workflowState: ProductionWorkflowState = { "generated-1": "used" };

    const outcomeLoop = buildProductionOutcomeLoop({
      productionPlan,
      workflowState,
      capturedPosts: [capturedPost]
    });

    expect(outcomeLoop.summary).toBe("1 used slot matched in the latest scan.");
    expect(outcomeLoop.matchedCount).toBe(1);
    expect(outcomeLoop.awaitingScanCount).toBe(0);
    expect(outcomeLoop.entries).toEqual([
      expect.objectContaining({
        slotId: "generated-1",
        slotTitle: "Turn analytics into a strategist",
        status: "matched",
        label: "Matched captured post",
        postUrl: "https://x.com/caseymcdougal/status/posted-1",
        metricsLabel: "1,400 views · 22 likes · 3 replies · 5 reposts · 1 bookmark"
      })
    ]);
  });

  it("keeps used slots in an awaiting-scan state when no captured post matches", () => {
    const workflowState: ProductionWorkflowState = { "generated-1": "used" };

    const outcomeLoop = buildProductionOutcomeLoop({
      productionPlan,
      workflowState,
      capturedPosts: [{ ...capturedPost, text: "A totally different post about a different idea." }]
    });

    expect(outcomeLoop.summary).toBe("1 used slot awaiting a matching scan.");
    expect(outcomeLoop.matchedCount).toBe(0);
    expect(outcomeLoop.awaitingScanCount).toBe(1);
    expect(outcomeLoop.nextAction).toBe("Run Scan public metrics after the post is live, then this loop will attach visible outcomes.");
    expect(outcomeLoop.entries[0]).toMatchObject({
      status: "awaiting-scan",
      label: "Awaiting next scan"
    });
  });

  it("prompts for a used slot before outcome tracking starts", () => {
    const outcomeLoop = buildProductionOutcomeLoop({
      productionPlan,
      workflowState: {},
      capturedPosts: [capturedPost]
    });

    expect(outcomeLoop.summary).toBe("No used slots yet.");
    expect(outcomeLoop.nextAction).toBe("Plan a slot, mark it used after posting, then scan public metrics to measure the result.");
    expect(outcomeLoop.entries).toEqual([]);
  });

  it("formats only available public metrics", () => {
    expect(formatProductionOutcomeMetrics({ ...capturedPost, bookmarksCount: null, repostsCount: null })).toBe(
      "1,400 views · 22 likes · 3 replies"
    );
  });
});
