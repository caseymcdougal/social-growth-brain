import { describe, expect, it } from "vitest";
import { generationOutputSchema } from "../../src/shared/generation-schema";

describe("generationOutputSchema", () => {
  it("accepts copy-ready generated post drafts", () => {
    const output = generationOutputSchema.parse({
      posts: [
        {
          title: "Local tools beat rented dashboards",
          angle: "Show the practical advantage of owning the workflow.",
          why_this: "It builds on the audit finding that specific product opinions perform best.",
          hook: "The best dashboard is the one that tells you what to write next.",
          draft:
            "The best dashboard is the one that tells you what to write next. Metrics are useful, but the leverage is turning the pattern into a sharper post while the context is still fresh.",
          source_signal: "Top posts had concrete build context and a clear enemy."
        }
      ]
    });

    expect(output.posts[0].draft).toContain("what to write next");
  });

  it("rejects empty generated drafts", () => {
    expect(() =>
      generationOutputSchema.parse({
        posts: [
          {
            title: "Local tools",
            angle: " ",
            why_this: "Audit-backed.",
            hook: "Strong hook.",
            draft: "",
            source_signal: "Pattern"
          }
        ]
      })
    ).toThrow();
  });
});
