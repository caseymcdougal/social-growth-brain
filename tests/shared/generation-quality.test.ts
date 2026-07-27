import { describe, expect, it, vi } from "vitest";
import { runQualityGatedGeneration } from "../../src/shared/generation-quality";
import type { GenerationOutput } from "../../src/shared/generation-schema";
import type { CapturedAccountSnapshot } from "../../src/shared/types";

const snapshot: CapturedAccountSnapshot = {
  profile: {
    handle: "caseymcdougal",
    displayName: "Casey",
    bio: "Local tools",
    profileUrl: "https://x.com/caseymcdougal",
    followersCount: 1000,
    followingCount: 100,
    capturedAt: "2026-07-16T12:00:00.000Z",
    source: "manual"
  },
  posts: [
    {
      xPostId: "1",
      url: "https://x.com/caseymcdougal/status/1",
      text: "Published: dashboards that only report metrics are unfinished products for creators.",
      postedAt: "2026-07-01T12:00:00.000Z",
      capturedAt: "2026-07-16T12:00:00.000Z",
      source: "manual",
      viewsCount: 500,
      likesCount: 10,
      repostsCount: 1,
      repliesCount: 2,
      bookmarksCount: 1
    }
  ]
};

function batch(posts: GenerationOutput["posts"]): GenerationOutput {
  return { posts };
}

describe("runQualityGatedGeneration", () => {
  it("repairs once when the first pass is mostly duplicates", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(
        batch([
          {
            title: "Clone A",
            angle: "Same claim",
            why_this: "Bad",
            hook: "Published: dashboards that only report metrics are unfinished products for creators.",
            draft: "Published: dashboards that only report metrics are unfinished products for creators.",
            source_signal: "wrong"
          },
          {
            title: "Clone B",
            angle: "Same claim",
            why_this: "Bad",
            hook: "Published: dashboards that only report metrics are unfinished products for creators.",
            draft: "Published: dashboards that only report metrics are unfinished products for creators. Again.",
            source_signal: "wrong"
          },
          {
            title: "Clone C",
            angle: "Same claim",
            why_this: "Bad",
            hook: "Published: dashboards that only report metrics are unfinished products for creators.",
            draft: "Published: dashboards that only report metrics are unfinished products for creators. Still.",
            source_signal: "wrong"
          }
        ])
      )
      .mockResolvedValueOnce(
        batch([
          {
            title: "Fresh A",
            angle: "New operator tension",
            why_this: "Uses the mechanism without the old claim.",
            hook: "Before you add another analytics pane, name the handoff that already fails.",
            draft:
              "Before you add another analytics pane, name the handoff that already fails. If you cannot point to the broken step, the chart is just prettier regret. Ask which judgment call still needs a human.",
            source_signal: "proof-first workflow"
          },
          {
            title: "Fresh B",
            angle: "New enemy",
            why_this: "Different claim in the same lane.",
            hook: "A content tool that cannot argue with tomorrow's draft is still a report.",
            draft:
              "A content tool that cannot argue with tomorrow's draft is still a report. Ship one rewrite suggestion tied to a weak post before you celebrate another metric tile. What would you cut first?",
            source_signal: "clear next action"
          },
          {
            title: "Fresh C",
            angle: "Concrete checklist",
            why_this: "Operational and new.",
            hook: "Stop collecting screenshots until you can name the failed decision in the thread.",
            draft:
              "Stop collecting screenshots until you can name the failed decision in the thread. Write the decision, then the post. If the decision is fuzzy, the post will be too. Which decision is still vague?",
            source_signal: "specificity over vibes"
          }
        ])
      );

    const result = await runQualityGatedGeneration({
      snapshot,
      priorDrafts: [],
      generate
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toContain("Previous drafts failed");
    expect(result.repaired).toBe(true);
    expect(result.generation.posts.length).toBeGreaterThanOrEqual(2);
    expect(result.generation.posts.every((post) => !post.draft.includes("Published: dashboards"))).toBe(true);
  });

  it("skips repair when the first pass already has three accepted drafts", async () => {
    const generate = vi.fn().mockResolvedValue(
      batch([
        {
          title: "A",
          angle: "A",
          why_this: "A",
          hook: "Name the failed handoff before you open another model tab today.",
          draft:
            "Name the failed handoff before you open another model tab today. If you cannot point to the broken step, the new tool is just optimism with an API key. Which step still needs you?",
          source_signal: "handoff audit"
        },
        {
          title: "B",
          angle: "B",
          why_this: "B",
          hook: "A strategy room that only ranks posts is still half a product.",
          draft:
            "A strategy room that only ranks posts is still half a product. The useful part starts when it turns the pattern into a draft while context is fresh. What draft would you write from yesterday's winner mechanism?",
          source_signal: "pattern to draft"
        },
        {
          title: "C",
          angle: "C",
          why_this: "C",
          hook: "Stop asking analytics what happened and ask what claim to test next.",
          draft:
            "Stop asking analytics what happened and ask what claim to test next. Pick one weak post, rewrite the first sentence with a sharper enemy, then ship. Which post gets the rewrite?",
          source_signal: "rewrite loop"
        }
      ])
    );

    const result = await runQualityGatedGeneration({
      snapshot,
      priorDrafts: [],
      generate
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.repaired).toBe(false);
    expect(result.generation.posts).toHaveLength(3);
  });
});
