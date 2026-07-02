import { describe, expect, it } from "vitest";
import analysisFixture from "../fixtures/analysis-valid.json";
import { buildCreatorScorecard, formatCreatorScorecardForClipboard } from "../../src/shared/creator-scorecard";
import { buildScanHistoryBrief } from "../../src/shared/scan-history";
import type { AnalysisSummary } from "../../src/shared/analysis-schema";
import type { GenerationOutput } from "../../src/shared/generation-schema";
import type { MetricCompletenessSummary } from "../../src/shared/performance";
import type { StrategyMemory } from "../../src/shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot, PostSnapshotInput } from "../../src/shared/types";

function metricSummary(input: Partial<MetricCompletenessSummary> = {}): MetricCompletenessSummary {
  return {
    capturedFields: input.capturedFields ?? 20,
    totalFields: input.totalFields ?? 20,
    missingFields: input.missingFields ?? 0,
    completenessRatio: input.completenessRatio ?? 1,
    postsWithAnyMetrics: input.postsWithAnyMetrics ?? 4,
    postsWithFullMetrics: input.postsWithFullMetrics ?? 4
  };
}

function post(input: Partial<PostSnapshotInput> & Pick<PostSnapshotInput, "xPostId" | "text">): PostSnapshotInput {
  return {
    xPostId: input.xPostId,
    url: input.url ?? `https://x.com/caseymcdougal/status/${input.xPostId}`,
    text: input.text,
    postedAt: input.postedAt ?? "2026-06-20T15:00:00.000Z",
    capturedAt: input.capturedAt ?? "2026-06-20T18:00:00.000Z",
    source: "manual",
    viewsCount: input.viewsCount ?? 0,
    likesCount: input.likesCount ?? 0,
    repostsCount: input.repostsCount ?? 0,
    repliesCount: input.repliesCount ?? 0,
    bookmarksCount: input.bookmarksCount ?? 0
  };
}

function snapshot({
  capturedAt,
  followersCount,
  posts
}: {
  capturedAt: string;
  followersCount: number;
  posts: PostSnapshotInput[];
}): CapturedAccountSnapshot {
  return {
    profile: {
      handle: "caseymcdougal",
      displayName: "Casey McDougal",
      bio: "Building AI tools and internet products.",
      profileUrl: "https://x.com/caseymcdougal",
      followersCount,
      followingCount: 450,
      capturedAt,
      source: "manual"
    },
    posts: posts.map((item) => ({ ...item, capturedAt }))
  };
}

function generation(): GenerationOutput {
  return {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
}

function memory(): StrategyMemory {
  return {
    positioning: "Casey writes as a product-minded AI tooling operator.",
    audience_segments: ["builders shipping with AI"],
    strongest_lanes: ["creator workflow tools"],
    weak_lanes: ["generic AI commentary"],
    voice_rules: ["make the product opinion first"],
    proof_points: ["Specific product opinions outperform generic takes."],
    active_experiments: [
      {
        hypothesis: "Named workflow enemies increase replies.",
        status: "active",
        evidence: "The audit flagged clear enemy framing as a strong pattern."
      }
    ]
  };
}

describe("creator scorecard", () => {
  it("summarizes a compounding creator system from strong evidence, momentum, strategy, and production", () => {
    const previous = snapshot({
      capturedAt: "2026-06-20T18:00:00.000Z",
      followersCount: 1200,
      posts: [post({ xPostId: "older", text: "A useful dashboard tells you what to do next.", viewsCount: 1000, likesCount: 10 })]
    });
    const current = snapshot({
      capturedAt: "2026-06-26T18:00:00.000Z",
      followersCount: 1250,
      posts: [post({ xPostId: "new", text: "The best audit tools turn scans into moves.", viewsCount: 3000, likesCount: 24, repliesCount: 8 })]
    });

    const scorecard = buildCreatorScorecard({
      snapshot: current,
      analysis: analysisFixture as AnalysisSummary,
      generation: generation(),
      metricSummary: metricSummary(),
      scanHistory: buildScanHistoryBrief([current, previous]),
      memory: memory()
    });

    expect(scorecard.overallScore).toBe(88);
    expect(scorecard.statusLabel).toBe("Growing strong");
    expect(scorecard.summary).toBe("You're on a good roll — keep doing what's working.");
    expect(scorecard.primaryConstraint.label).toBe("Ready to post");
    expect(scorecard.dimensions.map((dimension) => dimension.label)).toEqual([
      "Post data",
      "Growth trend",
      "Your strategy",
      "Ready to post"
    ]);
  });

  it("points setup accounts at the first missing constraint", () => {
    const scorecard = buildCreatorScorecard({
      snapshot: null,
      analysis: null,
      generation: null,
      metricSummary: metricSummary({ capturedFields: 0, totalFields: 0, completenessRatio: 0, postsWithAnyMetrics: 0, postsWithFullMetrics: 0 }),
      scanHistory: buildScanHistoryBrief([]),
      memory: null
    });

    expect(scorecard.overallScore).toBe(19);
    expect(scorecard.statusLabel).toBe("Just getting started");
    expect(scorecard.primaryConstraint.label).toBe("Post data");
    expect(scorecard.primaryConstraint.nextAction).toBe("Scan or paste your X profile so we can see how your posts are doing.");
  });

  it("makes negative scan movement the main constraint even when drafts exist", () => {
    const previous = snapshot({
      capturedAt: "2026-06-20T18:00:00.000Z",
      followersCount: 1200,
      posts: [post({ xPostId: "strong", text: "Strong baseline.", viewsCount: 5000, likesCount: 30, repliesCount: 10 })]
    });
    const current = snapshot({
      capturedAt: "2026-06-26T18:00:00.000Z",
      followersCount: 1198,
      posts: [post({ xPostId: "weak", text: "Weaker follow-up.", viewsCount: 300, likesCount: 2 })]
    });

    const scorecard = buildCreatorScorecard({
      snapshot: current,
      analysis: analysisFixture as AnalysisSummary,
      generation: generation(),
      metricSummary: metricSummary(),
      scanHistory: buildScanHistoryBrief([current, previous]),
      memory: memory()
    });

    expect(scorecard.statusLabel).toBe("On track");
    expect(scorecard.primaryConstraint.label).toBe("Growth trend");
    expect(scorecard.primaryConstraint.statusLabel).toBe("Down");
    expect(scorecard.primaryConstraint.nextAction).toContain("weaker scan");
  });

  it("formats a copyable scorecard brief", () => {
    const scorecard = buildCreatorScorecard({
      snapshot: null,
      analysis: null,
      generation: null,
      metricSummary: metricSummary({ capturedFields: 0, totalFields: 0, completenessRatio: 0, postsWithAnyMetrics: 0, postsWithFullMetrics: 0 }),
      scanHistory: buildScanHistoryBrief([]),
      memory: null
    });

    const copied = formatCreatorScorecardForClipboard(scorecard);

    expect(copied).toContain("Creator scorecard: 19/100 - Just getting started");
    expect(copied).toContain("What to fix first: Post data");
    expect(copied).toContain("- Post data [No posts yet] 10/100");
    expect(copied).toContain("Next: Scan or paste your X profile so we can see how your posts are doing.");
  });
});
