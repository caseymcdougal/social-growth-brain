import { describe, expect, it } from "vitest";
import {
  draftSimilarityScore,
  evaluateDraftNovelty,
  formatRepairNotes,
  gateGeneratedPosts,
  selectDraftsAfterGate
} from "../../src/shared/draft-novelty";
import type { GeneratedPost } from "../../src/shared/generation-schema";

function readyPost(overrides: Partial<GeneratedPost> = {}): GeneratedPost {
  return {
    title: "Ready draft",
    angle: "Concrete operator tension.",
    why_this: "Repeats a winning mechanism with a new claim.",
    hook: "Most creator dashboards stop before they earn the next post.",
    draft:
      "Most creator dashboards stop before they earn the next post. Try naming one failed handoff from yesterday and rewrite that angle before you ship another chart.",
    source_signal: "specific workflow receipts",
    ...overrides
  };
}

describe("draft novelty", () => {
  it("scores verbatim and near-verbatim drafts as high similarity", () => {
    const published = "Specific local tools should turn diagnosis into the next post.";
    expect(draftSimilarityScore(published, published)).toBe(1);
    expect(
      draftSimilarityScore(
        "Specific local tools should turn diagnosis into the next post today.",
        published
      )
    ).toBeGreaterThan(0.48);
  });

  it("treats genuinely new drafts as novel", () => {
    const result = evaluateDraftNovelty(
      "Ship the handoff checklist before you buy another AI wrapper. Ask which step still requires a human judgment call.",
      ["Specific local tools should turn diagnosis into the next post."]
    );
    expect(result.verdict).toBe("novel");
    expect(result.label).toBe("Novel");
  });

  it("rejects close duplicates and unreadiness, keeping novel ready drafts", () => {
    const published = readyPost().draft;
    const gate = gateGeneratedPosts({
      posts: [
        readyPost({ title: "Clone", draft: published, hook: readyPost().hook }),
        readyPost({
          title: "Fresh",
          hook: "Before you add another agent, audit the handoff that already fails.",
          draft:
            "Before you add another agent, audit the handoff that already fails. Count the steps that need a human judgment call, then cut one tool until that number drops."
        }),
        readyPost({
          title: "Vague",
          hook: "Everything is interesting",
          draft: "Honestly motivating stuff about the future."
        })
      ],
      publishedTexts: [published],
      priorDrafts: []
    });

    expect(gate.accepted.map((post) => post.title)).toEqual(["Fresh"]);
    expect(gate.rejected.map((item) => item.post.title).sort()).toEqual(["Clone", "Vague"]);
    expect(formatRepairNotes(gate.rejected)).toContain("Previous drafts failed");
  });

  it("fills the queue with least-duplicate rejects when too few accept", () => {
    const gate = gateGeneratedPosts({
      posts: [
        readyPost({
          title: "Only ready",
          hook: "Name the failed handoff before you open another model tab.",
          draft:
            "Name the failed handoff before you open another model tab. If you cannot point to the broken step, the new tool is just optimism with an API key."
        })
      ],
      publishedTexts: [],
      priorDrafts: []
    });
    const selected = selectDraftsAfterGate(
      {
        accepted: gate.accepted,
        rejected: [
          {
            post: readyPost({
              title: "Needs work filler",
              hook: "Short",
              draft: "Too short."
            }),
            reasons: ["Add one concrete detail so the post is not just a hook."]
          }
        ]
      },
      3
    );

    expect(selected.posts.length).toBe(2);
    expect(selected.posts[0].title).toBe("Only ready");
  });
});
