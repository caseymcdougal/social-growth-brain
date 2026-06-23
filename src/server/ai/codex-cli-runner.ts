import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analysisOutputSchema, type AnalysisOutput } from "../../shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";
import type { AiRunner } from "./ai-runner";

const requiredTextSchema = { type: "string", minLength: 1 };

const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executive_summary",
    "account_positioning_read",
    "top_patterns",
    "what_is_working",
    "what_is_holding_back",
    "recommended_content_pillars",
    "next_post_ideas",
    "post_analyses"
  ],
  properties: {
    executive_summary: requiredTextSchema,
    account_positioning_read: requiredTextSchema,
    top_patterns: { type: "array", minItems: 1, items: requiredTextSchema },
    what_is_working: { type: "array", minItems: 1, items: requiredTextSchema },
    what_is_holding_back: { type: "array", minItems: 1, items: requiredTextSchema },
    recommended_content_pillars: { type: "array", minItems: 1, items: requiredTextSchema },
    next_post_ideas: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason", "hook", "draft"],
        properties: {
          title: requiredTextSchema,
          reason: requiredTextSchema,
          hook: requiredTextSchema,
          draft: requiredTextSchema
        }
      }
    },
    post_analyses: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "post_id",
          "performance_read",
          "likely_reason",
          "hook_diagnosis",
          "clarity_diagnosis",
          "audience_fit",
          "recommended_change",
          "rewrite",
          "variant_hooks"
        ],
        properties: {
          post_id: requiredTextSchema,
          performance_read: requiredTextSchema,
          likely_reason: requiredTextSchema,
          hook_diagnosis: requiredTextSchema,
          clarity_diagnosis: requiredTextSchema,
          audience_fit: requiredTextSchema,
          recommended_change: requiredTextSchema,
          rewrite: requiredTextSchema,
          variant_hooks: { type: "array", minItems: 1, items: requiredTextSchema }
        }
      }
    }
  }
};

export function buildCodexExecArgs(paths: { jobDir: string; schemaPath: string; outputPath: string }) {
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

export function writeCodexJobFiles(jobDir: string, snapshot: unknown) {
  mkdirSync(jobDir, { recursive: true });
  const inputPath = join(jobDir, "input.json");
  const promptPath = join(jobDir, "prompt.md");
  const schemaPath = join(jobDir, "schema.json");
  const outputPath = join(jobDir, "output.json");
  const inputJson = JSON.stringify(snapshot, null, 2);

  writeFileSync(inputPath, inputJson);
  writeFileSync(
    promptPath,
    [
      "You are a direct social content strategist for Casey McDougal.",
      "Analyze the provided X/Twitter profile snapshot and recent original posts.",
      "Diagnose why posts likely performed the way they did using only the visible metrics and text.",
      "Use the visible metrics as supporting evidence, not as a substitute for strategic judgment.",
      "Return JSON only. Do not include markdown.",
      "",
      "Input JSON:",
      inputJson
    ].join("\n")
  );
  writeFileSync(schemaPath, JSON.stringify(analysisJsonSchema, null, 2));

  return { inputPath, promptPath, schemaPath, outputPath };
}

export class CodexCliRunner implements AiRunner {
  async analyze(snapshot: CapturedAccountSnapshot, jobDir: string): Promise<AnalysisOutput> {
    const files = writeCodexJobFiles(jobDir, snapshot);
    const args = buildCodexExecArgs({ jobDir, schemaPath: files.schemaPath, outputPath: files.outputPath });
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
    return analysisOutputSchema.parse(output);
  }
}
