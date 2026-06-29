import { describe, expect, it } from "vitest";
import type { AnalysisOutput } from "../../src/shared/analysis-schema";
import type { GenerationOutput } from "../../src/shared/generation-schema";
import { buildOpportunityBrief, formatOpportunityBriefForClipboard } from "../../src/shared/opportunities";
import { rankPostsByVisibleSignal, summarizeMetricCompleteness } from "../../src/shared/performance";
import type { CapturedAccountSnapshot, PostSnapshotInput } from "../../src/shared/types";

function post(overrides: Partial<PostSnapshotInput>): PostSnapshotInput {
  return {
    xPostId: "post-default",
    url: "https://x.com/caseymcdougal/status/default",
    text: "Default post",
    postedAt: null,
    capturedAt: "2026-06-23T12:00:00.000Z",
    source: "manual",
    viewsCount: null,
    likesCount: null,
    repostsCount: null,
    repliesCount: null,
    bookmarksCount: null,
    ...overrides
  };
}

function snapshot(posts: PostSnapshotInput[]): CapturedAccountSnapshot {
  return {
    profile: {
      handle: "caseymcdougal",
      displayName: "Casey",
      bio: "Local strategy cockpit",
      profileUrl: "https://x.com/caseymcdougal",
      followersCount: 1234,
      followingCount: 200,
      capturedAt: "2026-06-23T12:00:00.000Z",
      source: "manual"
    },
    posts
  };
}

const analysis: AnalysisOutput = {
  executive_summary: "Make the strongest technical insight easier to repeat.",
  account_positioning_read: "Local AI systems operator.",
  top_patterns: ["specific workflow receipts", "clear operator stakes"],
  what_is_working: ["hands-on proof beats abstract takes"],
  what_is_holding_back: ["some posts hide the practical payoff"],
  recommended_content_pillars: ["local AI workflows"],
  next_post_ideas: [
    {
      title: "Show the workflow receipt",
      reason: "It compounds the strongest pattern.",
      hook: "The fastest way to improve a local AI workflow is to audit the handoff.",
      draft: "A post draft"
    }
  ],
  post_analyses: [
    {
      post_id: "winner",
      performance_read: "Won because it led with a concrete workflow.",
      likely_reason: "It was immediately useful.",
      hook_diagnosis: "Clear and specific.",
      clarity_diagnosis: "Strong",
      audience_fit: "Builders running local tools",
      recommended_change: "Repeat the proof-first structure.",
      rewrite: "Winner rewrite",
      variant_hooks: ["Show the receipt"]
    },
    {
      post_id: "repair",
      performance_read: "Underperformed despite a useful idea.",
      likely_reason: "The hook delayed the concrete payoff.",
      hook_diagnosis: "Too indirect.",
      clarity_diagnosis: "Medium",
      audience_fit: "Relevant but buried",
      recommended_change: "Lead with the operational consequence.",
      rewrite: "Repair rewrite",
      variant_hooks: ["Start with the cost"]
    }
  ]
};

const generation: GenerationOutput = {
  posts: [
    {
      title: "Workflow audit",
      angle: "Make the debugging loop concrete.",
      why_this: "It repeats the strongest observed signal.",
      hook: "Before you add another tool, audit the handoff.",
      draft: "Before you add another tool, audit the handoff.",
      source_signal: "specific workflow receipts"
    }
  ]
};

describe("opportunity brief", () => {
  it("starts with scan guidance when no snapshot exists", () => {
    const brief = buildOpportunityBrief({
      snapshot: null,
      analysis: null,
      generation: null,
      rankedPosts: [],
      metricSummary: summarizeMetricCompleteness([])
    });

    expect(brief.command.action).toBe("scan");
    expect(brief.command.title).toBe("Scan the public profile");
    expect(brief.priorityCards.map((card) => card.kind)).toEqual(["evidence"]);
  });

  it("asks for an audit after posts are captured", () => {
    const posts = [
      post({ xPostId: "winner", text: "Strong proof", viewsCount: 1000, likesCount: 20, repostsCount: 4 }),
      post({ xPostId: "repair", text: "Useful but buried", viewsCount: 150, likesCount: 1 })
    ];
    const brief = buildOpportunityBrief({
      snapshot: snapshot(posts),
      analysis: null,
      generation: null,
      rankedPosts: rankPostsByVisibleSignal(posts),
      metricSummary: summarizeMetricCompleteness(posts)
    });

    expect(brief.command.action).toBe("audit");
    expect(brief.command.detail).toContain("2 captured posts");
    expect(brief.priorityCards.find((card) => card.kind === "repeat")?.title).toBe("Repeat the public winner");
  });

  it("surfaces repeat and repair opportunities once analysis exists", () => {
    const posts = [
      post({ xPostId: "winner", text: "Strong proof", viewsCount: 1000, likesCount: 20, repostsCount: 4 }),
      post({ xPostId: "repair", text: "Useful but buried", viewsCount: 150, likesCount: 1 })
    ];
    const brief = buildOpportunityBrief({
      snapshot: snapshot(posts),
      analysis,
      generation: null,
      rankedPosts: rankPostsByVisibleSignal(posts),
      metricSummary: summarizeMetricCompleteness(posts)
    });

    expect(brief.command.action).toBe("generate");
    expect(brief.priorityCards.map((card) => card.kind)).toEqual(["repeat", "repair", "evidence"]);
    expect(brief.priorityCards.find((card) => card.kind === "repair")?.detail).toContain(
      "Lead with the operational consequence"
    );
  });

  it("switches to draft review when generated posts are available", () => {
    const posts = [post({ xPostId: "winner", text: "Strong proof", viewsCount: 1000, likesCount: 20 })];
    const brief = buildOpportunityBrief({
      snapshot: snapshot(posts),
      analysis,
      generation,
      rankedPosts: rankPostsByVisibleSignal(posts),
      metricSummary: summarizeMetricCompleteness(posts)
    });

    expect(brief.command.action).toBe("review-drafts");
    expect(brief.command.title).toBe("Review the draft queue");
    expect(brief.command.detail).toContain("1 draft");
  });

  it("does not label a single analyzed post as both repeat and repair", () => {
    const posts = [post({ xPostId: "winner", text: "Strong proof", viewsCount: 1000, likesCount: 20 })];
    const brief = buildOpportunityBrief({
      snapshot: snapshot(posts),
      analysis,
      generation: null,
      rankedPosts: rankPostsByVisibleSignal(posts),
      metricSummary: summarizeMetricCompleteness(posts)
    });

    expect(brief.priorityCards.map((card) => card.kind)).toEqual(["repeat", "evidence"]);
  });

  it("formats opportunity priorities for copying into a planning note", () => {
    const posts = [
      post({ xPostId: "winner", text: "Strong proof", viewsCount: 1000, likesCount: 20, repostsCount: 4 }),
      post({ xPostId: "repair", text: "Useful but buried", viewsCount: 150, likesCount: 1 })
    ];
    const brief = buildOpportunityBrief({
      snapshot: snapshot(posts),
      analysis,
      generation: null,
      rankedPosts: rankPostsByVisibleSignal(posts),
      metricSummary: summarizeMetricCompleteness(posts)
    });

    expect(formatOpportunityBriefForClipboard(brief)).toContain("Next command: Generate the next draft set");
    expect(formatOpportunityBriefForClipboard(brief)).toContain("Repeat the public winner");
    expect(formatOpportunityBriefForClipboard(brief)).toContain("Rewrite the buried useful post");
  });
});
