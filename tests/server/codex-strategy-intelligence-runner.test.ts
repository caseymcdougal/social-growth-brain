import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCodexStrategyArgs,
  writeStrategyMemoryJobFiles,
  writeTopicExplorerJobFiles
} from "../../src/server/strategy/codex-strategy-intelligence-runner";
import analysisFixture from "../fixtures/analysis-valid.json";
import snapshotFixture from "../fixtures/manual-import-valid.json";

const currentMemory = {
  positioning: "Casey writes as a blunt local-first AI tooling operator.",
  audience_segments: ["builders"],
  strongest_lanes: ["local AI tools"],
  weak_lanes: ["generic AI commentary"],
  voice_rules: ["make the claim early"],
  proof_points: ["Specific product opinions performed better."],
  active_experiments: [
    {
      hypothesis: "Named workflow enemies produce more replies.",
      status: "active",
      evidence: "Recent audit found clearer enemy framing in stronger posts."
    }
  ]
};

describe("Codex strategy intelligence runner", () => {
  it("builds non-interactive Codex args for structured output", () => {
    const args = buildCodexStrategyArgs({
      jobDir: "/tmp/strategy-job",
      schemaPath: "/tmp/strategy-job/schema.json",
      outputPath: "/tmp/strategy-job/output.json"
    });

    expect(args).toContain("exec");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--output-schema");
    expect(args).toContain("/tmp/strategy-job/schema.json");
    expect(args).toContain("--output-last-message");
    expect(args).toContain("/tmp/strategy-job/output.json");
  });

  it("writes a strategy memory proposal job", () => {
    const jobDir = mkdtempSync(join(tmpdir(), "strategy-memory-"));
    const files = writeStrategyMemoryJobFiles(jobDir, {
      snapshot: snapshotFixture,
      analysis: analysisFixture,
      currentMemory
    });

    const prompt = readFileSync(files.promptPath, "utf8");
    expect(readFileSync(files.inputPath, "utf8")).toContain("\"currentMemory\"");
    expect(prompt).toContain("propose updates to Casey's strategy memory");
    expect(prompt).toContain("Do not silently mutate memory");
    expect(readFileSync(files.schemaPath, "utf8")).toContain("active_experiments");
  });

  it("writes an adjacent topic exploration job", () => {
    const jobDir = mkdtempSync(join(tmpdir(), "topic-explorer-"));
    const files = writeTopicExplorerJobFiles(jobDir, {
      snapshot: snapshotFixture,
      analysis: analysisFixture,
      currentMemory
    });

    const prompt = readFileSync(files.promptPath, "utf8");
    expect(prompt).toContain("Explore nearby topics");
    expect(prompt).toContain("do not drift into generic AI news");
    expect(readFileSync(files.schemaPath, "utf8")).toContain("follow_up_prompt");
  });
});
