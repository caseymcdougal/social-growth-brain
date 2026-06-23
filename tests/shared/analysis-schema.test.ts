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
});
