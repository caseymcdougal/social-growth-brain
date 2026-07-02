import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodexGenerationArgs, writeGenerationJobFiles } from "../../src/server/generation/codex-generation-runner";
import type { AnalysisOutput } from "../../src/shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../../src/shared/types";
import analysisFixture from "../fixtures/analysis-valid.json";
import snapshotFixture from "../fixtures/manual-import-valid.json";

const snapshot = snapshotFixture as CapturedAccountSnapshot;
const analysis = analysisFixture as AnalysisOutput;

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
      snapshot,
      analysis,
      mode: "today",
      strategyMemory: {
        positioning: "Casey writes as a local-first AI tooling operator.",
        audience_segments: ["builders shipping with AI"],
        strongest_lanes: ["local AI dashboards"],
        weak_lanes: ["generic AI takes"],
        voice_rules: ["lead with the product opinion"],
        proof_points: ["Specific product opinions outperformed generic posts."],
        active_experiments: [
          {
            hypothesis: "Named workflow enemies increase replies.",
            status: "active",
            evidence: "The audit flagged clear enemy framing."
          }
        ]
      },
      direction: "Focus on local workbench polish."
    });

    const prompt = readFileSync(files.promptPath, "utf8");
    const input = readFileSync(files.inputPath, "utf8");
    expect(input).toContain("\"analysis\"");
    expect(input).toContain("\"generationBrief\"");
    expect(prompt).toContain("Generate today's ideas");
    expect(prompt).toContain("copy-ready X posts");
    expect(prompt).toContain("Generation strategy brief");
    expect(prompt).toContain("Do not average Casey's voice into generic AI commentary");
    expect(prompt).toContain("local-first AI tooling operator");
    expect(readFileSync(files.schemaPath, "utf8")).toContain("source_signal");
  });
});
