import { describe, expect, it } from "vitest";
import analysisFixture from "../fixtures/analysis-valid.json";
import { buildExperimentLedger, formatExperimentLedgerForClipboard } from "../../src/shared/experiment-ledger";
import { buildScanHistoryBrief } from "../../src/shared/scan-history";
import type { AnalysisSummary } from "../../src/shared/analysis-schema";
import type { StrategyMemory } from "../../src/shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot, PostSnapshotInput } from "../../src/shared/types";

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

function strategyMemory(): StrategyMemory {
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

describe("experiment ledger", () => {
  it("marks an accepted experiment as winning when scan signal improves", () => {
    const previous = snapshot({
      capturedAt: "2026-06-20T18:00:00.000Z",
      followersCount: 1200,
      posts: [
        post({
          xPostId: "older-winner",
          text: "A useful dashboard tells you what to do next.",
          viewsCount: 1000,
          likesCount: 10,
          repostsCount: 2,
          repliesCount: 1
        }),
        post({ xPostId: "quiet", text: "Quiet post.", viewsCount: 500, likesCount: 2 })
      ]
    });
    const current = snapshot({
      capturedAt: "2026-06-26T18:00:00.000Z",
      followersCount: 1250,
      posts: [
        post({
          xPostId: "new-winner",
          text: "The best social audit tools should turn a scan into a next move.",
          viewsCount: 3000,
          likesCount: 20,
          repostsCount: 4,
          repliesCount: 8,
          bookmarksCount: 3
        }),
        post({
          xPostId: "older-winner",
          text: "A useful dashboard tells you what to do next.",
          viewsCount: 1200,
          likesCount: 12,
          repostsCount: 2,
          repliesCount: 2,
          bookmarksCount: 1
        })
      ]
    });

    const ledger = buildExperimentLedger({
      analysis: analysisFixture as AnalysisSummary,
      memory: strategyMemory(),
      scanHistory: buildScanHistoryBrief([current, previous])
    });

    expect(ledger.summary).toBe("1 experiment looks validated by the latest scan.");
    expect(ledger.items[0]).toMatchObject({
      hypothesis: "Named workflow enemies increase replies.",
      sourceLabel: "Active experiment",
      status: "winning",
      statusLabel: "Winning",
      trendLabel: "+68 median signal",
      evidence: "The audit flagged clear enemy framing as a strong pattern."
    });
  });

  it("flags experiments for review when scan signal drops", () => {
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

    const ledger = buildExperimentLedger({
      analysis: analysisFixture as AnalysisSummary,
      memory: strategyMemory(),
      scanHistory: buildScanHistoryBrief([current, previous])
    });

    expect(ledger.summary).toBe("1 experiment needs review after the latest scan.");
    expect(ledger.items[0]).toMatchObject({
      status: "needs-review",
      statusLabel: "Needs review"
    });
    expect(ledger.items[0]?.nextAction).toContain("weaker scan");
  });

  it("asks for another scan before validating experiments", () => {
    const current = snapshot({
      capturedAt: "2026-06-26T18:00:00.000Z",
      followersCount: 1250,
      posts: [post({ xPostId: "only", text: "The first tracked scan.", viewsCount: 1000, likesCount: 8 })]
    });

    const ledger = buildExperimentLedger({
      analysis: analysisFixture as AnalysisSummary,
      memory: strategyMemory(),
      scanHistory: buildScanHistoryBrief([current])
    });

    expect(ledger.summary).toBe("Experiment ledger needs another scan before validation.");
    expect(ledger.items[0]).toMatchObject({
      status: "needs-scan",
      statusLabel: "Needs scan",
      trendLabel: "Waiting for second scan"
    });
  });

  it("falls back to top audit patterns before memory is accepted", () => {
    const ledger = buildExperimentLedger({
      analysis: analysisFixture as AnalysisSummary,
      memory: null,
      scanHistory: buildScanHistoryBrief([])
    });

    expect(ledger.summary).toBe("Pattern watch created from the latest audit until strategy memory is applied.");
    expect(ledger.items[0]).toMatchObject({
      sourceLabel: "Pattern watch",
      hypothesis: "Repeat: Specific product takes outperform broad motivation.",
      evidence: "From top audit patterns."
    });
  });

  it("formats a portable experiment brief for working notes", () => {
    const current = snapshot({
      capturedAt: "2026-06-26T18:00:00.000Z",
      followersCount: 1250,
      posts: [post({ xPostId: "only", text: "The first tracked scan.", viewsCount: 1000, likesCount: 8 })]
    });
    const ledger = buildExperimentLedger({
      analysis: analysisFixture as AnalysisSummary,
      memory: strategyMemory(),
      scanHistory: buildScanHistoryBrief([current])
    });

    const copied = formatExperimentLedgerForClipboard(ledger);

    expect(copied).toContain("Experiment ledger: Experiment ledger needs another scan before validation.");
    expect(copied).toContain("- [Needs scan] Named workflow enemies increase replies.");
    expect(copied).toContain("Trend: Waiting for second scan");
    expect(copied).toContain("Evidence: The audit flagged clear enemy framing as a strong pattern.");
    expect(copied).toContain("Next: Run another public scan after the next posting cycle to unlock deltas.");
  });
});
