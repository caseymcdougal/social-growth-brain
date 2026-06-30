import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeGenerationJobFiles } from "./codex-generation-runner";

const snapshot = { profile: { handle: "x" }, posts: [] } as unknown;
const analysis = { strategy_report: {}, post_analyses: [] } as unknown;

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
