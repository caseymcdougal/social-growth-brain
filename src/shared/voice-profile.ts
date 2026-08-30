import { z } from "zod";

const requiredText = z.string().trim().min(1);

export const voiceProfileSchema = z.object({
  summary: requiredText,
  casing_and_punctuation: z.array(requiredText).min(1),
  sentence_rhythm: z.array(requiredText).min(1),
  vocabulary: z.array(requiredText).min(1),
  hook_moves: z.array(requiredText).min(1),
  banned_moves: z.array(requiredText).min(1),
  style_excerpts: z.array(requiredText).min(1).max(3)
}).strict();

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export interface VoiceProfileState {
  profile: VoiceProfile | null;
  derivedAt: string | null;
  overrides: string;
}

function section(title: string, items: string[]) {
  if (items.length === 0) return [];
  return [`${title}:`, ...items.map((item) => `- ${item}`)];
}

/** Prompt block shared by generation and audit rewrites. Empty string when no voice data exists. */
export function buildVoicePromptBlock(state: {
  profile: VoiceProfile | null;
  overrides: string;
}): string {
  const overrides = state.overrides.trim();
  if (!state.profile && !overrides) return "";

  const lines: string[] = [
    "Casey's voice profile (derived from his published posts — follow it exactly in every draft, rewrite, and hook):"
  ];
  if (state.profile) {
    lines.push(
      `Voice summary: ${state.profile.summary}`,
      ...section("Casing and punctuation", state.profile.casing_and_punctuation),
      ...section("Sentence rhythm", state.profile.sentence_rhythm),
      ...section("Vocabulary and phrases", state.profile.vocabulary),
      ...section("Hook moves he actually uses", state.profile.hook_moves),
      ...section("Never do (reads as not-Casey)", state.profile.banned_moves),
      ...section("Style reference excerpts (match the sound, never reuse the content)", state.profile.style_excerpts)
    );
  }
  if (overrides) {
    lines.push("Casey's own voice notes (these win over any derived rule above):", overrides);
  }
  return lines.join("\n");
}
