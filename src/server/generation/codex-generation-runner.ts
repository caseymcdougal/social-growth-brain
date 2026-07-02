import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnalysisOutput } from "../../shared/analysis-schema";
import { buildGenerationStrategyBrief } from "../../shared/generation-context";
import { generationOutputSchema, type GenerationOutput } from "../../shared/generation-schema";
import type { StrategyMemory } from "../../shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";
import type { GenerationRunner } from "./generation-runner";

const requiredTextSchema = { type: "string", minLength: 1 };

const generationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "angle", "why_this", "hook", "draft", "source_signal"],
        properties: {
          title: requiredTextSchema,
          angle: requiredTextSchema,
          why_this: requiredTextSchema,
          hook: requiredTextSchema,
          draft: requiredTextSchema,
          source_signal: requiredTextSchema
        }
      }
    }
  }
};

export function buildCodexGenerationArgs(paths: { jobDir: string; schemaPath: string; outputPath: string }) {
  return [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--cd",
    paths.jobDir,
    "--output-schema",
    paths.schemaPath,
    "--output-last-message",
    paths.outputPath,
    "-"
  ];
}

export function writeGenerationJobFiles(
  jobDir: string,
  input: {
    snapshot: CapturedAccountSnapshot;
    analysis: AnalysisOutput;
    mode: "today";
    strategyMemory?: StrategyMemory | null;
    direction?: string | null;
  }
) {
  mkdirSync(jobDir, { recursive: true });
  const inputPath = join(jobDir, "input.json");
  const promptPath = join(jobDir, "prompt.md");
  const schemaPath = join(jobDir, "schema.json");
  const outputPath = join(jobDir, "output.json");
  const direction = typeof input.direction === "string" ? input.direction.trim() : "";
  const generationBrief = buildGenerationStrategyBrief({
    snapshot: input.snapshot,
    analysis: input.analysis,
    strategyMemory: input.strategyMemory ?? null,
    direction
  });
  const modelInput = {
    snapshot: input.snapshot,
    analysis: input.analysis,
    generationBrief,
    mode: input.mode
  };
  const inputJson = JSON.stringify(modelInput, null, 2);

  writeFileSync(inputPath, inputJson);
  writeFileSync(
    promptPath,
    [
      "You are Casey McDougal's direct X/Twitter post strategist.",
      "Generate today's ideas as copy-ready X posts based on the latest public-metric audit.",
      "Use the provided strategy audit, top patterns, weak spots, and captured posts as evidence.",
      "Use the Generation strategy brief as the operating frame before looking at raw posts.",
      "Do not average Casey's voice into generic AI commentary. Preserve the strongest lanes, voice rules, and current direction.",
      "Every draft must make a concrete claim, name a specific workflow/product tension, or create a useful enemy. No abstract motivation.",
      "Do not summarize the audit. Produce new posts Casey can copy into X.",
      "Avoid generic creator advice, broad motivational posts, and placeholder claims.",
      "Each draft should have a specific angle, a strong hook, and a clear reason tied to the audit.",
      ...(direction ? [`Casey's current creative direction (follow it): ${direction}`] : []),
      "Return JSON only. Do not include markdown.",
      "",
      "Generation strategy brief:",
      JSON.stringify(generationBrief, null, 2),
      "",
      "Input JSON:",
      inputJson
    ].join("\n")
  );
  writeFileSync(schemaPath, JSON.stringify(generationJsonSchema, null, 2));

  return { inputPath, promptPath, schemaPath, outputPath };
}

export class CodexGenerationRunner implements GenerationRunner {
  async generateToday(input: {
    snapshot: CapturedAccountSnapshot;
    analysis: AnalysisOutput;
    strategyMemory?: StrategyMemory | null;
    direction?: string | null;
    jobDir: string;
  }): Promise<GenerationOutput> {
    const files = writeGenerationJobFiles(input.jobDir, {
      snapshot: input.snapshot,
      analysis: input.analysis,
      mode: "today",
      strategyMemory: input.strategyMemory ?? null,
      direction: input.direction ?? null
    });
    const args = buildCodexGenerationArgs({
      jobDir: input.jobDir,
      schemaPath: files.schemaPath,
      outputPath: files.outputPath
    });
    const prompt = readFileSync(files.promptPath, "utf8");

    await new Promise<void>((resolve, reject) => {
      const child = spawn("codex", args, {
        env: process.env,
        stdio: ["pipe", "ignore", "pipe"]
      });
      let stderr = "";

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`codex exec failed with code ${code}: ${stderr.slice(0, 1000)}`));
      });
      child.stdin.end(prompt);
    });

    const output: unknown = JSON.parse(readFileSync(files.outputPath, "utf8"));
    return generationOutputSchema.parse(output);
  }
}
