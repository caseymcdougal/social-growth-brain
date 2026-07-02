import { describe, expect, it } from "vitest";
import { buildGenerationStrategyBrief } from "../../src/shared/generation-context";
import type { AnalysisOutput } from "../../src/shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../../src/shared/types";
import analysisFixture from "../fixtures/analysis-valid.json";
import snapshotFixture from "../fixtures/manual-import-valid.json";

describe("buildGenerationStrategyBrief", () => {
  it("condenses profile, performance, memory, and direction into drafting context", () => {
    const snapshot = snapshotFixture as CapturedAccountSnapshot;
    const brief = buildGenerationStrategyBrief({
      snapshot: {
        ...snapshot,
        posts: [
          {
            ...snapshot.posts[0],
            xPostId: "quiet",
            text: "A quiet generic post.",
            viewsCount: 100,
            likesCount: 0,
            repostsCount: 0,
            repliesCount: 0,
            bookmarksCount: 0
          },
          {
            ...snapshot.posts[0],
            xPostId: "winner",
            text: "Specific local tools should turn diagnosis into the next post.",
            viewsCount: 1000,
            likesCount: 20,
            repostsCount: 4,
            repliesCount: 5,
            bookmarksCount: 2
          }
        ]
      },
      analysis: analysisFixture as AnalysisOutput,
      strategyMemory: {
        positioning: "Casey writes as a local-first AI tooling operator.",
        audience_segments: ["builders shipping with AI"],
        strongest_lanes: ["local AI dashboards"],
        weak_lanes: ["generic AI takes"],
        voice_rules: ["lead with the product opinion"],
        proof_points: ["Specific product opinions outperformed generic posts."],
        active_experiments: [
          {
            hypothesis: "Named workflow enemies increase replies.",
            status: "active",
            evidence: "The audit flagged clear enemy framing."
          }
        ]
      },
      direction: "Focus on the workbench feeling."
    });

    expect(brief.profile.positioning).toContain("local-first");
    expect(brief.profile.audienceSegments).toContain("builders shipping with AI");
    expect(brief.profile.followerRead).toContain("1200 followers");
    expect(brief.performanceSignals.topPosts[0].postId).toBe("winner");
    expect(brief.performanceSignals.topPosts[0].visibleSignal).toContain("views=1000");
    expect(brief.performanceSignals.topPosts[0].whyItMatters).toMatch(/specific local tools/i);
    expect(brief.strategy.strongestLanes).toContain("local AI dashboards");
    expect(brief.strategy.avoidLanes).toContain("generic AI takes");
    expect(brief.strategy.voiceRules).toContain("lead with the product opinion");
    expect(brief.strategy.currentDirection).toBe("Focus on the workbench feeling.");
    expect(brief.strategy.activeExperiments[0]).toContain("Named workflow enemies");
  });
});
