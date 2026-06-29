import { describe, expect, it } from "vitest";
import type { AnalysisSummary } from "../../src/shared/analysis-schema";
import type { GenerationOutput } from "../../src/shared/generation-schema";
import type { SelectedPostLabBrief } from "../../src/shared/post-lab";
import { buildPostProductionPlan, formatPostProductionPlanForClipboard } from "../../src/shared/post-production-plan";

const selectedPostBrief: SelectedPostLabBrief = {
  postId: "post-1",
  postUrl: "https://x.com/caseymcdougal/status/1",
  rankLabel: "#1 · score 128",
  primaryAction: "Rewrite selected post",
  sourceText: "Most social dashboards tell you what happened. I want one that tells me what to do next.",
  performanceRead: "Won because the job-to-be-done was obvious.",
  recommendation: "Make the enemy sharper in sentence one.",
  rewrite: "Most creator dashboards are autopsies. I want one that works like a strategist.",
  variantHooks: ["Your analytics should tell you what to post next."]
};

const generation: GenerationOutput = {
  posts: [
    {
      title: "Turn analytics into a strategist",
      angle: "Position the dashboard as an operating system, not a report.",
      why_this: "It continues the strongest contrast in the audit.",
      hook: "A social dashboard should end with a next move.",
      draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
      source_signal: "Specific product takes outperform broad claims."
    },
    {
      title: "Dashboard as coach",
      angle: "Show the product philosophy through a creator workflow.",
      why_this: "It turns the build into a clear product thesis.",
      hook: "I do not want another analytics chart.",
      draft: "I do not want another analytics chart. I want a tool that argues with the next post until it gets sharper.",
      source_signal: "Posts with a clear enemy have stronger hooks."
    }
  ]
};

const analysis: AnalysisSummary = {
  executive_summary: "Specific and opinionated posts are strongest.",
  account_positioning_read: "Builder/operator sharing practical AI product experiments.",
  top_patterns: ["Specific product takes outperform broad motivation."],
  what_is_working: ["Direct product opinions"],
  what_is_holding_back: ["Too many abstract claims"],
  recommended_content_pillars: ["AI tools I am building"],
  next_post_ideas: [
    {
      title: "Why most analytics tools fail creators",
      reason: "Matches the dashboard build and has a contrarian angle.",
      hook: "Most social analytics tools stop when they become useful.",
      draft: "Most social analytics tools stop when they become useful. They explain the past instead of shaping the next post."
    }
  ]
};

describe("post production plan", () => {
  it("puts a selected-post remix before generated drafts", () => {
    const plan = buildPostProductionPlan({ analysis, generation, selectedPostBrief });

    expect(plan.summary).toContain("Selected remix first");
    expect(plan.primarySlotId).toBe("selected-post-1");
    expect(plan.slots).toHaveLength(3);
    expect(plan.slots[0]).toMatchObject({
      id: "selected-post-1",
      source: "selected-post",
      title: "Remix selected post",
      status: "Ready to copy",
      draft: selectedPostBrief.rewrite,
      readiness: expect.objectContaining({
        verdict: expect.any(String),
        score: expect.any(Number)
      })
    });
    expect(plan.slots[1]).toMatchObject({
      id: "generated-1",
      source: "generated-draft",
      title: "Turn analytics into a strategist"
    });
  });

  it("falls back to audit ideas before a generation run exists", () => {
    const plan = buildPostProductionPlan({ analysis, generation: null, selectedPostBrief: null });

    expect(plan.summary).toContain("Audit idea queue");
    expect(plan.primarySlotId).toBe("audit-idea-1");
    expect(plan.slots).toEqual([
      expect.objectContaining({
        source: "audit-idea",
        title: "Why most analytics tools fail creators",
        status: "Ready to copy",
        actionLabel: "Copy idea draft"
      })
    ]);
  });

  it("formats a production queue for copying into a working note", () => {
    const plan = buildPostProductionPlan({ analysis, generation, selectedPostBrief });
    const copied = formatPostProductionPlanForClipboard(plan);

    expect(copied).toContain("Production queue");
    expect(copied).toContain("1. Remix selected post [Ready to copy]");
    expect(copied).toContain("Hook: Your analytics should tell you what to post next.");
    expect(copied).toContain("Draft: Most creator dashboards are autopsies.");
    expect(copied).toContain("Readiness:");
    expect(copied).toContain("Source: #1 · score 128");
    expect(copied).toContain("2. Turn analytics into a strategist [Ready to copy]");
  });

  it("keeps a many-draft generation run focused to the next five slots", () => {
    const manyDrafts: GenerationOutput = {
      posts: Array.from({ length: 7 }, (_, index) => ({
        title: `Draft ${index + 1}`,
        angle: "A focused angle.",
        why_this: "It fits the current strategy.",
        hook: `Hook ${index + 1}`,
        draft: `Draft body ${index + 1}`,
        source_signal: "Visible signal"
      }))
    };

    const plan = buildPostProductionPlan({ analysis, generation: manyDrafts, selectedPostBrief });

    expect(plan.summary).toContain("4 of 7 generated drafts");
    expect(plan.slots).toHaveLength(5);
    expect(plan.slots[0].source).toBe("selected-post");
    expect(plan.slots[4]).toMatchObject({ id: "generated-4", title: "Draft 4" });
  });
});
