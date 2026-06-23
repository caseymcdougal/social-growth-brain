import { describe, expect, it } from "vitest";
import {
  strategyMemoryProposalOutputSchema,
  strategyMemorySchema,
  topicExplorationOutputSchema
} from "../../src/shared/strategy-intelligence-schema";

describe("strategy intelligence schemas", () => {
  it("accepts an accepted strategy memory profile", () => {
    const memory = strategyMemorySchema.parse({
      positioning: "Casey writes as a blunt builder evaluating AI tooling and local workflows.",
      audience_segments: ["builders shipping with AI tools", "founders evaluating agent workflows"],
      strongest_lanes: ["local AI tooling", "developer workflow critique"],
      weak_lanes: ["generic productivity commentary"],
      voice_rules: ["lead with the concrete product opinion", "name the enemy clearly"],
      proof_points: ["Top posts used direct critique and specific builder context."],
      active_experiments: [
        {
          hypothesis: "Direct product critiques outperform broad AI commentary.",
          status: "active",
          evidence: "Recent high-signal posts had clearer stakes and a stronger enemy."
        }
      ]
    });

    expect(memory.strongest_lanes[0]).toBe("local AI tooling");
  });

  it("accepts proposed memory updates with evidence", () => {
    const proposal = strategyMemoryProposalOutputSchema.parse({
      memory: {
        positioning: "Casey writes as a local-first AI tooling operator.",
        audience_segments: ["AI builders", "solo operators"],
        strongest_lanes: ["local dashboards", "agent workflow critique"],
        weak_lanes: ["generic AI news reactions"],
        voice_rules: ["make the claim before the explanation"],
        proof_points: ["Audit found specific product opinions performed better."],
        active_experiments: [
          {
            hypothesis: "Posts with a named workflow enemy create more replies.",
            status: "active",
            evidence: "The audit flagged stronger engagement on critique-led posts."
          }
        ]
      },
      updates: [
        {
          area: "strongest_lanes",
          proposed: "Add agent workflow critique as a core lane.",
          reason: "It appears in both winning posts and the positioning read.",
          evidence: "Top patterns mention direct product opinions and workflow pain."
        }
      ]
    });

    expect(proposal.updates[0].area).toBe("strongest_lanes");
  });

  it("accepts adjacent topic exploration output", () => {
    const exploration = topicExplorationOutputSchema.parse({
      topics: [
        {
          title: "Local-first AI dashboards",
          lane: "local AI tooling",
          why_near: "It extends Casey's recent posts about owning the workflow instead of renting opaque tools.",
          evidence: ["Audit shows direct builder-product opinions as a strong pattern."],
          risk: "low",
          hooks: ["The best AI dashboard is the one that argues with you.", "Metrics are the least interesting part of a content tool."],
          draft:
            "The best AI dashboard is the one that argues with you. Metrics tell you what happened. The leverage is a system that knows your taste well enough to suggest the next sharp move.",
          follow_up_prompt: "Explore how local memory changes creator tooling."
        }
      ]
    });

    expect(exploration.topics[0].risk).toBe("low");
  });

  it("rejects whitespace-only strategy fields", () => {
    expect(() =>
      strategyMemorySchema.parse({
        positioning: " ",
        audience_segments: ["builders"],
        strongest_lanes: ["AI tooling"],
        weak_lanes: ["generic commentary"],
        voice_rules: ["be direct"],
        proof_points: ["evidence"],
        active_experiments: [
          {
            hypothesis: "test",
            status: "active",
            evidence: "signal"
          }
        ]
      })
    ).toThrow();
  });
});
