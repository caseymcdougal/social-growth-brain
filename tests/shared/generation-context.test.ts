import { describe, expect, it } from "vitest";
import {
  buildGenerationStrategyBrief,
  buildSanitizedGenerationModelInput
} from "../../src/shared/generation-context";
import type { AnalysisOutput } from "../../src/shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../../src/shared/types";
import analysisFixture from "../fixtures/analysis-valid.json";
import snapshotFixture from "../fixtures/manual-import-valid.json";

describe("buildGenerationStrategyBrief", () => {
  it("condenses profile, performance, memory, and direction into drafting context", () => {
    const snapshot = snapshotFixture as CapturedAccountSnapshot;
    const analysis = {
      ...(analysisFixture as AnalysisOutput),
      post_analyses: [
        {
          post_id: "winner",
          performance_read: "Won because it named a concrete local-tool workflow.",
          likely_reason: "Readers could self-identify with the operator pain.",
          hook_diagnosis: "Leads with a sharp product tension.",
          clarity_diagnosis: "Specific and scannable.",
          audience_fit: "Builders shipping with AI",
          recommended_change: "Keep the proof-first structure on a new claim.",
          rewrite: "Should never appear in generation context.",
          variant_hooks: ["Should never appear either"]
        },
        {
          post_id: "quiet",
          performance_read: "Buried useful idea under vague framing.",
          likely_reason: "No concrete stakes.",
          hook_diagnosis: "Soft open.",
          clarity_diagnosis: "Vague.",
          audience_fit: "Unclear",
          recommended_change: "Lead with the operational cost.",
          rewrite: "Quiet rewrite",
          variant_hooks: ["Quiet hook"]
        }
      ]
    } satisfies AnalysisOutput;

    const brief = buildGenerationStrategyBrief({
      snapshot: {
        ...snapshot,
        posts: [
          {
            ...snapshot.posts[0],
            xPostId: "quiet",
            text: "A quiet generic post about everything being amazing.",
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
      analysis,
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
      direction: "Focus on the workbench feeling.",
      priorDrafts: ["Old hook\nOld draft about dashboards."]
    });

    expect(brief.profile.positioning).toContain("local-first");
    expect(brief.profile.audienceSegments).toContain("builders shipping with AI");
    expect(brief.profile.followerRead).toContain("1200 followers");
    expect(brief.performanceSignals.topicMechanismWinners[0].postId).toBe("winner");
    expect(brief.performanceSignals.topicMechanismWinners[0].visibleSignal).toContain("views=1000");
    expect(brief.performanceSignals.topicMechanismWinners[0].whyItMatters).toMatch(/concrete local-tool workflow/i);
    expect(brief.performanceSignals.topicMechanismWinners[0].whyItMatters).not.toMatch(/specific local tools should turn/i);
    expect(brief.performanceSignals.antiPatterns.some((item) => item.postId === "quiet")).toBe(true);
    expect(brief.performanceSignals.toneMoves.length).toBeGreaterThan(0);
    expect(brief.avoidCorpus.publishedPosts).toContain("Specific local tools should turn diagnosis into the next post.");
    expect(brief.avoidCorpus.priorDrafts[0]).toContain("Old draft");
    expect(brief.strategy.strongestLanes).toContain("local AI dashboards");
    expect(brief.strategy.avoidLanes).toContain("generic AI takes");
    expect(brief.strategy.voiceRules).toContain("lead with the product opinion");
    expect(brief.strategy.currentDirection).toBe("Focus on the workbench feeling.");
    expect(brief.strategy.activeExperiments[0]).toContain("Named workflow enemies");
  });

  it("sanitized model input strips rewrites, next_post_ideas, and raw post bodies", () => {
    const snapshot = snapshotFixture as CapturedAccountSnapshot;
    const analysis = analysisFixture as AnalysisOutput;
    const generationBrief = buildGenerationStrategyBrief({ snapshot, analysis });
    const modelInput = buildSanitizedGenerationModelInput({
      snapshot,
      analysis,
      generationBrief,
      mode: "today"
    });
    const serialized = JSON.stringify(modelInput);

    expect(serialized).not.toContain("next_post_ideas");
    expect(serialized).not.toContain('"rewrite"');
    expect(serialized).not.toContain("variant_hooks");
    expect(modelInput.analysisMechanisms.post_diagnoses[0]).toMatchObject({
      post_id: analysis.post_analyses[0].post_id,
      performance_read: analysis.post_analyses[0].performance_read
    });
    expect(modelInput.postMetrics[0].fingerprint.length).toBeLessThanOrEqual(64);
    expect(serialized).not.toContain(analysis.next_post_ideas[0].draft);
  });
});
