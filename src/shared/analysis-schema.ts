import { z } from "zod";

export const postAnalysisSchema = z.object({
  post_id: z.string().min(1),
  performance_read: z.string().min(1),
  likely_reason: z.string().min(1),
  hook_diagnosis: z.string().min(1),
  clarity_diagnosis: z.string().min(1),
  audience_fit: z.string().min(1),
  recommended_change: z.string().min(1),
  rewrite: z.string().min(1),
  variant_hooks: z.array(z.string().min(1)).min(1)
});

export const nextPostIdeaSchema = z.object({
  title: z.string().min(1),
  reason: z.string().min(1),
  hook: z.string().min(1),
  draft: z.string().min(1)
});

export const analysisOutputSchema = z.object({
  executive_summary: z.string().min(1),
  account_positioning_read: z.string().min(1),
  top_patterns: z.array(z.string().min(1)).min(1),
  what_is_working: z.array(z.string().min(1)).min(1),
  what_is_holding_back: z.array(z.string().min(1)).min(1),
  recommended_content_pillars: z.array(z.string().min(1)).min(1),
  next_post_ideas: z.array(nextPostIdeaSchema).min(1),
  post_analyses: z.array(postAnalysisSchema).min(1)
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
