import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runLlmJob } from "../ai/llm-job";
import { voiceProfileSchema, type VoiceProfile } from "../../shared/voice-profile";
import type { CapturedAccountSnapshot } from "../../shared/types";

const requiredTextSchema = { type: "string", minLength: 1 };
const requiredListSchema = { type: "array", minItems: 1, items: requiredTextSchema };

const voiceProfileJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "casing_and_punctuation",
    "sentence_rhythm",
    "vocabulary",
    "hook_moves",
    "banned_moves",
    "style_excerpts"
  ],
  properties: {
    summary: requiredTextSchema,
    casing_and_punctuation: requiredListSchema,
    sentence_rhythm: requiredListSchema,
    vocabulary: requiredListSchema,
    hook_moves: requiredListSchema,
    banned_moves: requiredListSchema,
    style_excerpts: { ...requiredListSchema, maxItems: 3 }
  }
};

export interface VoiceProfileRunner {
  deriveProfile(input: { snapshot: CapturedAccountSnapshot; jobDir: string }): Promise<VoiceProfile>;
}

export function writeVoiceProfileJobFiles(jobDir: string, snapshot: CapturedAccountSnapshot) {
  mkdirSync(jobDir, { recursive: true });
  const inputPath = join(jobDir, "input.json");
  const promptPath = join(jobDir, "prompt.md");
  const schemaPath = join(jobDir, "schema.json");
  const outputPath = join(jobDir, "output.json");
  const inputJson = JSON.stringify(
    {
      bio: snapshot.profile.bio,
      posts: snapshot.posts.map((post) => post.text)
    },
    null,
    2
  );

  writeFileSync(inputPath, inputJson);
  writeFileSync(
    promptPath,
    [
      "You are a forensic writing-style analyst. The input contains Casey McDougal's X/Twitter bio and every captured post, written by him.",
      "Describe HOW he writes, not WHAT he writes about. Another writer following your output should produce posts indistinguishable from his in sound.",
      "Ground every rule in the actual posts: casing habits, punctuation habits, sentence length and rhythm, recurring words and phrasings, how his openings work.",
      "banned_moves lists things that would immediately read as not-him (e.g. Title Case, hashtags, motivational filler, tidy corporate transitions) — derive these from what he demonstrably never does.",
      "style_excerpts: pick 2-3 short verbatim fragments (one sentence each) that best capture his sound.",
      "Be specific and testable ('drops the subject pronoun: \"shipped it today\"'), never generic ('authentic, engaging tone').",
      "Return JSON only. Do not include markdown.",
      "",
      "Input JSON:",
      inputJson
    ].join("\n")
  );
  writeFileSync(schemaPath, JSON.stringify(voiceProfileJsonSchema, null, 2));

  return { inputPath, promptPath, schemaPath, outputPath };
}

export class LlmVoiceProfileRunner implements VoiceProfileRunner {
  async deriveProfile(input: { snapshot: CapturedAccountSnapshot; jobDir: string }): Promise<VoiceProfile> {
    const files = writeVoiceProfileJobFiles(input.jobDir, input.snapshot);
    return runLlmJob({ jobDir: input.jobDir, ...files }, (raw) => voiceProfileSchema.parse(raw));
  }
}
