import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodexGenerationArgs, writeGenerationJobFiles } from "../../src/server/generation/codex-generation-runner";
import analysisFixture from "../fixtures/analysis-valid.json";
import snapshotFixture from "../fixtures/manual-import-valid.json";

describe("Codex generation runner", () => {
  it("builds a hidden non-interactive codex exec command", () => {
    const args = buildCodexGenerationArgs({
      jobDir: "/tmp/social-audit-generation",
      schemaPath: "/tmp/social-audit-generation/schema.json",
      outputPath: "/tmp/social-audit-generation/output.json"
    });

    expect(args).toContain("exec");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--output-schema");
    expect(args).toContain("/tmp/social-audit-generation/schema.json");
    expect(args).toContain("--output-last-message");
    expect(args).toContain("/tmp/social-audit-generation/output.json");
  });

  it("writes generation input, prompt, and schema files", () => {
    const jobDir = mkdtempSync(join(tmpdir(), "social-audit-generation-"));
    const files = writeGenerationJobFiles(jobDir, {
      snapshot: snapshotFixture,
      analysis: analysisFixture,
      mode: "today"
    });

    const prompt = readFileSync(files.promptPath, "utf8");
    expect(readFileSync(files.inputPath, "utf8")).toContain("\"analysis\"");
    expect(prompt).toContain("Generate today's ideas");
    expect(prompt).toContain("copy-ready X posts");
    expect(readFileSync(files.schemaPath, "utf8")).toContain("source_signal");
  });
});
