import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runLlmJob } from "../ai/llm-job";
import type { AnalysisOutput } from "../../shared/analysis-schema";
import {
  buildGenerationStrategyBrief,
  buildSanitizedGenerationModelInput
} from "../../shared/generation-context";
import { generationBatchOutputSchema, type GenerationOutput } from "../../shared/generation-schema";
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
      minItems: 3,
      maxItems: 5,
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
    voiceBlock?: string;
    priorDrafts?: string[];
    repairNotes?: string | null;
  }
) {
  mkdirSync(jobDir, { recursive: true });
  const inputPath = join(jobDir, "input.json");
  const promptPath = join(jobDir, "prompt.md");
  const schemaPath = join(jobDir, "schema.json");
  const outputPath = join(jobDir, "output.json");
  const direction = typeof input.direction === "string" ? input.direction.trim() : "";
  const repairNotes = typeof input.repairNotes === "string" ? input.repairNotes.trim() : "";
  const generationBrief = buildGenerationStrategyBrief({
    snapshot: input.snapshot,
    analysis: input.analysis,
    strategyMemory: input.strategyMemory ?? null,
    direction,
    priorDrafts: input.priorDrafts ?? []
  });
  const modelInput = buildSanitizedGenerationModelInput({
    snapshot: input.snapshot,
    analysis: input.analysis,
    generationBrief,
    mode: input.mode
  });
  const inputJson = JSON.stringify(modelInput, null, 2);

  writeFileSync(inputPath, inputJson);
  writeFileSync(
    promptPath,
    [
      "You are Casey McDougal's direct X/Twitter post strategist.",
      "Generate exactly 3 copy-ready X posts based on the sanitized strategy brief and analysis mechanisms.",
      "Learn TOPIC LANES and WRITING MOVES from topicMechanismWinners and toneMoves — never copy their content.",
      "antiPatterns and avoidCorpus are hard negatives: do not reproduce, lightly rephrase, or re-angle any published post or prior draft.",
      "Before finalizing each draft, compare it against avoidCorpus.publishedPosts and avoidCorpus.priorDrafts. If it shares the same core claim, hook, or example, discard it and invent a new idea in the same lane.",
      "Write like a human operator, not an AI coach: short rhythm, concrete enemy or claim, one proof point, one decision/question. No tidy three-part listicles, no motivational filler, no 'here's the thing' transitions.",
      "Each draft must be paste-ready with minimal editing: specific angle, strong hook, clear why_this tied to a working mechanism (not a weak post).",
      "source_signal must be one plain-English phrase naming the mechanism or lane. No internal field names, no key: value syntax, never quote a published post.",
      "Do not summarize the audit. Produce new posts Casey can copy into X.",
      "Avoid generic creator advice, broad motivational posts, and placeholder claims.",
      ...(input.voiceBlock
        ? [
            input.voiceBlock,
            "Every hook and draft must follow the voice profile above. The style excerpts show the sound only — reusing their content counts as duplication."
          ]
        : []),
      ...(direction ? [`Casey's current creative direction (follow it): ${direction}`] : []),
      ...(repairNotes ? ["", "Repair pass notes:", repairNotes] : []),
      "Return JSON only. Do not include markdown.",
      "",
      "Generation strategy brief:",
      JSON.stringify(generationBrief, null, 2),
      "",
      "Sanitized input JSON:",
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
    voiceBlock?: string;
    priorDrafts?: string[];
    repairNotes?: string | null;
    jobDir: string;
  }): Promise<GenerationOutput> {
    const files = writeGenerationJobFiles(input.jobDir, {
      snapshot: input.snapshot,
      analysis: input.analysis,
      mode: "today",
      strategyMemory: input.strategyMemory ?? null,
      direction: input.direction ?? null,
      voiceBlock: input.voiceBlock,
      priorDrafts: input.priorDrafts,
      repairNotes: input.repairNotes
    });
    return runLlmJob({ jobDir: input.jobDir, ...files }, (raw) => generationBatchOutputSchema.parse(raw));
  }
}
