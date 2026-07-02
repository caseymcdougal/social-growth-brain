import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeGenerationJobFiles } from "./codex-generation-runner";
import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";

const snapshot: CapturedAccountSnapshot = {
  profile: {
    handle: "x",
    displayName: "X",
    bio: "",
    profileUrl: "https://x.com/x",
    followersCount: null,
    followingCount: null,
    capturedAt: "2026-06-30T17:00:00.000Z",
    source: "manual"
  },
  posts: []
};
const analysis: AnalysisOutput = {
  executive_summary: "Minimal summary",
  account_positioning_read: "Minimal positioning",
  top_patterns: ["Specific posts work"],
  what_is_working: ["Concrete claims"],
  what_is_holding_back: ["Generic language"],
  recommended_content_pillars: ["AI tools"],
  next_post_ideas: [
    {
      title: "Next post",
      reason: "Matches the account",
      hook: "The hook",
      draft: "The draft"
    }
  ],
  post_analyses: [
    {
      post_id: "1",
      performance_read: "No posts provided",
      likely_reason: "Fixture only",
      hook_diagnosis: "Fixture only",
      clarity_diagnosis: "Fixture only",
      audience_fit: "Fixture only",
      recommended_change: "Fixture only",
      rewrite: "Fixture only",
      variant_hooks: ["Fixture hook"]
    }
  ]
};

describe("generation prompt direction", () => {
  it("adds direction block to prompt and input when set", () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    writeGenerationJobFiles(dir, { snapshot, analysis, mode: "today", direction: "Move away from crypto" });
    const prompt = readFileSync(join(dir, "prompt.md"), "utf8");
    const input = readFileSync(join(dir, "input.json"), "utf8");
    expect(prompt).toContain("Move away from crypto");
    expect(prompt.toLowerCase()).toContain("creative direction");
    expect(input).toContain("Move away from crypto");
  });

  it("omits direction block when null", () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    writeGenerationJobFiles(dir, { snapshot, analysis, mode: "today", direction: null });
    const prompt = readFileSync(join(dir, "prompt.md"), "utf8");
    expect(prompt.toLowerCase()).not.toContain("creative direction");
  });

  it("omits direction block when whitespace only", () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    writeGenerationJobFiles(dir, { snapshot, analysis, mode: "today", direction: "   " });
    const prompt = readFileSync(join(dir, "prompt.md"), "utf8");
    expect(prompt.toLowerCase()).not.toContain("creative direction");
  });
});
