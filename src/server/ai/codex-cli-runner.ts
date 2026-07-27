import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analysisOutputSchema, type AnalysisOutput } from "../../shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";
import type { AiRunner, AnalysisContext } from "./ai-runner";
import { runLlmJob } from "./llm-job";

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

function buildContextBlock(context: AnalysisContext | undefined) {
  if (!context) return [];
  const sections: string[] = [];

  if (context.scanHistory && context.scanHistory.status === "ready") {
    sections.push(
      "Scan history (this account over time — use it to separate trends from one-offs):",
      JSON.stringify(
        {
          summary: context.scanHistory.summary,
          deltas: context.scanHistory.deltas,
          topPostShift: context.scanHistory.topPostShift.label,
          scans: context.scanHistory.entries
        },
        null,
        2
      )
    );
  }

  if (context.previousAnalysis) {
    sections.push(
      "Previous audit (the advice given last time — check it against the new data):",
      JSON.stringify(
        {
          executive_summary: context.previousAnalysis.executive_summary,
          what_is_working: context.previousAnalysis.what_is_working,
          what_is_holding_back: context.previousAnalysis.what_is_holding_back,
          recommended_content_pillars: context.previousAnalysis.recommended_content_pillars,
          advised_next_posts: context.previousAnalysis.next_post_ideas.map((idea) => idea.title)
        },
        null,
        2
      )
    );
  }

  if (context.strategyMemory) {
    sections.push(
      "Accepted strategy memory (long-term strategy the account has committed to):",
      JSON.stringify(context.strategyMemory, null, 2)
    );
  }

  if (sections.length === 0) return [];
  return [
    "",
    "Continuity context follows. Use it three ways:",
    "1. Judge each metric move against the scan history: is it a trend or a one-off? Say which in performance_read.",
    "2. Audit the previous audit: state in executive_summary whether last time's advice was followed and whether it worked. If a recommendation did not pay off, revise it instead of repeating it.",
    "3. Stay consistent with accepted strategy memory unless the new data contradicts it — and if it does, name the contradiction explicitly in what_is_holding_back.",
    "",
    ...sections
  ];
}

export function writeCodexJobFiles(jobDir: string, snapshot: unknown, voiceBlock = "", context?: AnalysisContext) {
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
      "Diagnose why posts likely performed the way they did using only the public visible metrics and text.",
      "Use public visible metrics as supporting evidence, not as a substitute for strategic judgment.",
      "This is a small account: judge every post against the account's own baseline and against its sibling posts, never against viral benchmarks. Relative differences between posts carry the signal.",
      "Field semantics: top_patterns and what_is_working contain ONLY repeatable positive mechanisms worth doing again. If nothing clearly worked, name the closest-to-working mechanism in the set — never state a failure ('posts got 0 likes') in those fields. Failures and risks belong only in what_is_holding_back.",
      "In the post_analyses, rank the strongest and weakest posts through the performance_read language even though the JSON field is named per-post.",
      "For weak posts, be specific about whether the issue is hook, clarity, audience fit, specificity, or weak stakes.",
      "For strong posts, explain the concrete mechanism that likely made readers care.",
      "Make next_post_ideas copy-ready: each draft should be usable in X with minimal editing and should follow from the diagnosis.",
      ...(voiceBlock ? [voiceBlock, "Every rewrite, variant hook, and next_post_ideas draft must follow the voice profile above."] : []),
      ...buildContextBlock(context),
      "",
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
  async analyze(
    snapshot: CapturedAccountSnapshot,
    jobDir: string,
    voiceBlock = "",
    context?: AnalysisContext
  ): Promise<AnalysisOutput> {
    const files = writeCodexJobFiles(jobDir, snapshot, voiceBlock, context);
    return runLlmJob({ jobDir, ...files }, (raw) => analysisOutputSchema.parse(raw));
  }
}
