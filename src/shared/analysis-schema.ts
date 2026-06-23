import { z } from "zod";

const requiredText = z.string().trim().min(1);

export const postAnalysisSchema = z.object({
  post_id: requiredText,
  performance_read: requiredText,
  likely_reason: requiredText,
  hook_diagnosis: requiredText,
  clarity_diagnosis: requiredText,
  audience_fit: requiredText,
  recommended_change: requiredText,
  rewrite: requiredText,
  variant_hooks: z.array(requiredText).min(1)
});

export const nextPostIdeaSchema = z.object({
  title: requiredText,
  reason: requiredText,
  hook: requiredText,
  draft: requiredText
});

export const analysisOutputSchema = z.object({
  executive_summary: requiredText,
  account_positioning_read: requiredText,
  top_patterns: z.array(requiredText).min(1),
  what_is_working: z.array(requiredText).min(1),
  what_is_holding_back: z.array(requiredText).min(1),
  recommended_content_pillars: z.array(requiredText).min(1),
  next_post_ideas: z.array(nextPostIdeaSchema).min(1),
  post_analyses: z.array(postAnalysisSchema).min(1)
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
