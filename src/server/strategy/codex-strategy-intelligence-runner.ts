import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnalysisOutput } from "../../shared/analysis-schema";
import {
  strategyMemoryProposalOutputSchema,
  type StrategyMemory,
  type StrategyMemoryProposalOutput,
  topicExplorationOutputSchema,
  type TopicExplorationOutput
} from "../../shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";
import type { StrategyIntelligenceRunner } from "./strategy-intelligence-runner";

const requiredTextSchema = { type: "string", minLength: 1 };

const strategyExperimentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["hypothesis", "status", "evidence"],
  properties: {
    hypothesis: requiredTextSchema,
    status: { type: "string", enum: ["active", "watching", "retired"] },
    evidence: requiredTextSchema
  }
};

const strategyMemoryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "positioning",
    "audience_segments",
    "strongest_lanes",
    "weak_lanes",
    "voice_rules",
    "proof_points",
    "active_experiments"
  ],
  properties: {
    positioning: requiredTextSchema,
    audience_segments: { type: "array", minItems: 1, items: requiredTextSchema },
    strongest_lanes: { type: "array", minItems: 1, items: requiredTextSchema },
    weak_lanes: { type: "array", minItems: 1, items: requiredTextSchema },
    voice_rules: { type: "array", minItems: 1, items: requiredTextSchema },
    proof_points: { type: "array", minItems: 1, items: requiredTextSchema },
    active_experiments: { type: "array", minItems: 1, items: strategyExperimentJsonSchema }
  }
};

const strategyMemoryProposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["memory", "updates"],
  properties: {
    memory: strategyMemoryJsonSchema,
    updates: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "proposed", "reason", "evidence"],
        properties: {
          area: requiredTextSchema,
          proposed: requiredTextSchema,
          reason: requiredTextSchema,
          evidence: requiredTextSchema
        }
      }
    }
  }
};

const topicExplorationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["topics"],
  properties: {
    topics: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "lane", "why_near", "evidence", "risk", "hooks", "draft", "follow_up_prompt"],
        properties: {
          title: requiredTextSchema,
          lane: requiredTextSchema,
          why_near: requiredTextSchema,
          evidence: { type: "array", minItems: 1, items: requiredTextSchema },
          risk: { type: "string", enum: ["low", "medium", "high"] },
          hooks: { type: "array", minItems: 2, items: requiredTextSchema },
          draft: requiredTextSchema,
          follow_up_prompt: requiredTextSchema
        }
      }
    }
  }
};

export function buildCodexStrategyArgs(paths: { jobDir: string; schemaPath: string; outputPath: string }) {
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

function writeJobFiles(jobDir: string, input: unknown, promptLines: string[], schema: unknown) {
  mkdirSync(jobDir, { recursive: true });
  const inputPath = join(jobDir, "input.json");
  const promptPath = join(jobDir, "prompt.md");
  const schemaPath = join(jobDir, "schema.json");
  const outputPath = join(jobDir, "output.json");
  const inputJson = JSON.stringify(input, null, 2);

  writeFileSync(inputPath, inputJson);
  writeFileSync(promptPath, [...promptLines, "", "Input JSON:", inputJson].join("\n"));
  writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

  return { inputPath, promptPath, schemaPath, outputPath };
}

function directionLines(direction?: string | null): string[] {
  const trimmed = typeof direction === "string" ? direction.trim() : "";
  return trimmed ? [`Casey's current creative direction (follow it): ${trimmed}`] : [];
}

export function writeStrategyMemoryJobFiles(
  jobDir: string,
  input: { snapshot: unknown; analysis: unknown; currentMemory: unknown; direction?: string | null }
) {
  return writeJobFiles(
    jobDir,
    input,
    [
      "You are Casey McDougal's local X strategy memory curator.",
      "Use the latest captured posts and strategy audit to propose updates to Casey's strategy memory.",
      "Do not silently mutate memory. Return a proposed full memory and a concise list of evidence-backed updates.",
      "Preserve useful existing memory when it remains supported by the latest evidence.",
      "Prefer specific lanes, voice rules, audience assumptions, and experiments over generic creator advice.",
      ...directionLines(input.direction),
      "Return JSON only. Do not include markdown."
    ],
    strategyMemoryProposalJsonSchema
  );
}

export function writeTopicExplorerJobFiles(
  jobDir: string,
  input: { snapshot: unknown; analysis: unknown; currentMemory: unknown; direction?: string | null }
) {
  return writeJobFiles(
    jobDir,
    input,
    [
      "You are Casey McDougal's adjacent-topic strategist.",
      "Explore nearby topics Casey can post about next using his latest X audit, captured posts, and accepted strategy memory.",
      "Stay close to demonstrated lanes, but surface non-obvious adjacent angles.",
      "Explain why each topic is near Casey's lane and cite evidence from the audit, memory, or recent posts.",
      "Make every topic actionable with hooks and one copy-ready X draft.",
      "do not drift into generic AI news, vague productivity advice, or broad motivational content.",
      ...directionLines(input.direction),
      "Return JSON only. Do not include markdown."
    ],
    topicExplorationJsonSchema
  );
}

async function runCodexJob(files: { promptPath: string; schemaPath: string; outputPath: string }, jobDir: string) {
  const args = buildCodexStrategyArgs({ jobDir, schemaPath: files.schemaPath, outputPath: files.outputPath });
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
}

export class CodexStrategyIntelligenceRunner implements StrategyIntelligenceRunner {
  async generateMemoryProposal(input: {
    snapshot: CapturedAccountSnapshot;
    analysis: AnalysisOutput;
    currentMemory: StrategyMemory | null;
    direction?: string | null;
    jobDir: string;
  }): Promise<StrategyMemoryProposalOutput> {
    const files = writeStrategyMemoryJobFiles(input.jobDir, {
      snapshot: input.snapshot,
      analysis: input.analysis,
      currentMemory: input.currentMemory,
      direction: input.direction ?? null
    });
    await runCodexJob(files, input.jobDir);
    return strategyMemoryProposalOutputSchema.parse(JSON.parse(readFileSync(files.outputPath, "utf8")));
  }

  async exploreTopics(input: {
    snapshot: CapturedAccountSnapshot;
    analysis: AnalysisOutput;
    currentMemory: StrategyMemory | null;
    direction?: string | null;
    jobDir: string;
  }): Promise<TopicExplorationOutput> {
    const files = writeTopicExplorerJobFiles(input.jobDir, {
      snapshot: input.snapshot,
      analysis: input.analysis,
      currentMemory: input.currentMemory,
      direction: input.direction ?? null
    });
    await runCodexJob(files, input.jobDir);
    return topicExplorationOutputSchema.parse(JSON.parse(readFileSync(files.outputPath, "utf8")));
  }
}
