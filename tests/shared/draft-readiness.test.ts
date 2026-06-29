import { describe, expect, it } from "vitest";
import { buildDraftReadiness, formatDraftReadinessForClipboard } from "../../src/shared/draft-readiness";

describe("draft readiness", () => {
  it("scores a concrete draft as ready with no blocking fixes", () => {
    const readiness = buildDraftReadiness({
      hook: "A social dashboard should end with a next move.",
      draft:
        "A social dashboard should end with a next move. I tested this on 17 public posts: specific tool takes beat generic motivation by 3x, so the next version should recommend an action, not just explain a chart.",
      sourceSignal: "17 public posts, visible engagement, top pattern comparison"
    });

    expect(readiness.score).toBeGreaterThanOrEqual(80);
    expect(readiness.verdict).toBe("Ready");
    expect(readiness.blockingFixes).toEqual([]);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Concrete evidence", passed: true }),
        expect.objectContaining({ label: "Action path", passed: true })
      ])
    );
  });

  it("flags vague drafts that lack proof and a reader action", () => {
    const readiness = buildDraftReadiness({
      hook: "This is honestly really motivating.",
      draft: "This is honestly really motivating. AI tools are changing everything and creators need to pay attention.",
      sourceSignal: "Visible signal"
    });

    expect(readiness.score).toBeLessThan(70);
    expect(readiness.verdict).toBe("Needs work");
    expect(readiness.blockingFixes).toContain("Add concrete proof: a number, named example, or specific observation.");
    expect(readiness.blockingFixes).toContain("Give the reader a clear next action, question, or decision frame.");
  });

  it("formats a compact copyable readiness note", () => {
    const readiness = buildDraftReadiness({
      hook: "I do not want another analytics chart.",
      draft:
        "I do not want another analytics chart. I want a tool that argues with the next post until the hook has a clear enemy, a concrete example, and one reason to reply.",
      sourceSignal: "Posts with a clear enemy have stronger hooks."
    });

    const copied = formatDraftReadinessForClipboard(readiness);

    expect(copied).toContain("Draft readiness");
    expect(copied).toContain(`Score: ${readiness.score}`);
    expect(copied).toContain("Hook strength:");
  });
});
