import { describe, expect, it } from "vitest";
import type { AnalysisOutput } from "../../src/shared/analysis-schema";
import { buildSelectedPostLabBrief, formatSelectedPostLabBriefForClipboard } from "../../src/shared/post-lab";
import type { RankedPost } from "../../src/shared/performance";

const rankedPost: RankedPost = {
  rank: 3,
  score: 42.4,
  post: {
    xPostId: "post-1",
    url: "https://x.com/caseymcdougal/status/1",
    text: "Most dashboards tell you what happened. I want one that tells me what to do next.",
    postedAt: "2026-06-23T12:00:00.000Z",
    capturedAt: "2026-06-23T13:00:00.000Z",
    source: "manual",
    viewsCount: 1400,
    likesCount: 22,
    repostsCount: 5,
    repliesCount: 3,
    bookmarksCount: 1
  }
};

const postAnalysis: AnalysisOutput["post_analyses"][number] = {
  post_id: "post-1",
  performance_read: "Won because the strategic job was clear.",
  likely_reason: "The post contrasts passive analytics with action.",
  hook_diagnosis: "Strong but could be more concrete.",
  clarity_diagnosis: "Clear",
  audience_fit: "Founders building content systems",
  recommended_change: "Name the exact failure mode in the first sentence.",
  rewrite: "Most creator dashboards are autopsies. I want one that works like a strategist.",
  variant_hooks: ["Your analytics should tell you what to post next.", "A dashboard that only explains the past is half a product."]
};

describe("selected post lab brief", () => {
  it("turns a ranked post analysis into an actionable lab brief", () => {
    const brief = buildSelectedPostLabBrief({ rankedPost, postAnalysis });

    expect(brief.postId).toBe("post-1");
    expect(brief.rankLabel).toBe("#3 · score 42");
    expect(brief.primaryAction).toBe("Rewrite selected post");
    expect(brief.rewrite).toBe(postAnalysis.rewrite);
    expect(brief.variantHooks).toEqual(postAnalysis.variant_hooks);
  });

  it("keeps a selected post useful while full analysis is still loading", () => {
    const brief = buildSelectedPostLabBrief({ rankedPost, postAnalysis: null });

    expect(brief.primaryAction).toBe("Use as source post");
    expect(brief.rewrite).toBeNull();
    expect(brief.variantHooks).toEqual([]);
    expect(brief.recommendation).toContain("Run or load the full audit");
  });

  it("formats the selected post brief for copying into a drafting prompt", () => {
    const brief = buildSelectedPostLabBrief({ rankedPost, postAnalysis });

    expect(formatSelectedPostLabBriefForClipboard(brief)).toContain("Selected post: #3 · score 42");
    expect(formatSelectedPostLabBriefForClipboard(brief)).toContain(postAnalysis.recommended_change);
    expect(formatSelectedPostLabBriefForClipboard(brief)).toContain(postAnalysis.rewrite);
  });
});
