import { describe, it, expect } from "vitest";
import { buildVoicePromptBlock, voiceProfileSchema, type VoiceProfile } from "./voice-profile";

const profile: VoiceProfile = {
  summary: "Lowercase build-log voice.",
  casing_and_punctuation: ["mostly lowercase"],
  sentence_rhythm: ["short declaratives"],
  vocabulary: ["build mode"],
  hook_moves: ["opens with a concrete action"],
  banned_moves: ["no hashtags"],
  style_excerpts: ["shipped it today"]
};

describe("buildVoicePromptBlock", () => {
  it("returns empty string with no profile and no overrides", () => {
    expect(buildVoicePromptBlock({ profile: null, overrides: "" })).toBe("");
    expect(buildVoicePromptBlock({ profile: null, overrides: "   " })).toBe("");
  });

  it("includes derived rules and marks style excerpts as reference-only", () => {
    const block = buildVoicePromptBlock({ profile, overrides: "" });
    expect(block).toContain("mostly lowercase");
    expect(block).toContain("no hashtags");
    expect(block.toLowerCase()).toContain("never reuse the content");
  });

  it("appends overrides and flags they win over derived rules", () => {
    const block = buildVoicePromptBlock({ profile, overrides: "never use em dashes" });
    expect(block).toContain("never use em dashes");
    expect(block.toLowerCase()).toContain("win over");
  });

  it("works with overrides only (no derived profile yet)", () => {
    const block = buildVoicePromptBlock({ profile: null, overrides: "keep it lowercase" });
    expect(block).toContain("keep it lowercase");
  });

  it("schema rejects an empty style_excerpts list", () => {
    expect(() => voiceProfileSchema.parse({ ...profile, style_excerpts: [] })).toThrow();
  });
});
