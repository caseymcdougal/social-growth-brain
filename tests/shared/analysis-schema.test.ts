import { describe, expect, it } from "vitest";
import valid from "../fixtures/analysis-valid.json";
import invalid from "../fixtures/analysis-invalid.json";
import { analysisOutputSchema } from "../../src/shared/analysis-schema";

describe("analysisOutputSchema", () => {
  it("accepts the expected structured AI output", () => {
    expect(() => analysisOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects missing post analysis fields", () => {
    expect(() => analysisOutputSchema.parse(invalid)).toThrow();
  });

  it("rejects whitespace-only top-level text", () => {
    expect(() =>
      analysisOutputSchema.parse({
        ...valid,
        executive_summary: "   \n\t   "
      })
    ).toThrow();
  });

  it("rejects whitespace-only array text", () => {
    expect(() =>
      analysisOutputSchema.parse({
        ...valid,
        top_patterns: ["   "]
      })
    ).toThrow();
  });

  it("rejects whitespace-only nested post analysis text", () => {
    expect(() =>
      analysisOutputSchema.parse({
        ...valid,
        post_analyses: [
          {
            ...valid.post_analyses[0],
            rewrite: "   "
          }
        ]
      })
    ).toThrow();
  });
});
