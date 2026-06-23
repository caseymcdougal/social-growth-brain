import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodexExecArgs, writeCodexJobFiles } from "../../src/server/ai/codex-cli-runner";

describe("Codex CLI runner", () => {
  it("builds a hidden non-interactive codex exec command", () => {
    const args = buildCodexExecArgs({
      jobDir: "/tmp/social-audit-job",
      schemaPath: "/tmp/social-audit-job/schema.json",
      outputPath: "/tmp/social-audit-job/output.json"
    });

    expect(args).toContain("exec");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--output-schema");
    expect(args).toContain("/tmp/social-audit-job/schema.json");
    expect(args).toContain("--output-last-message");
    expect(args).toContain("/tmp/social-audit-job/output.json");
  });

  it("writes compact input and prompt files to the job dir", () => {
    const jobDir = mkdtempSync(join(tmpdir(), "social-audit-codex-"));
    const files = writeCodexJobFiles(jobDir, {
      profile: { handle: "casey" },
      posts: [{ xPostId: "1", text: "hello" }]
    });

    expect(readFileSync(files.inputPath, "utf8")).toContain("\"posts\"");
    const prompt = readFileSync(files.promptPath, "utf8");
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("public visible metrics");
    expect(prompt).toContain("rank the strongest and weakest posts");
    expect(readFileSync(files.schemaPath, "utf8")).toContain("executive_summary");
  });
});
