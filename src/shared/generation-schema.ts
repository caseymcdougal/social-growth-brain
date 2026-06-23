import { z } from "zod";

const requiredText = z.string().trim().min(1);

export const generatedPostSchema = z.object({
  title: requiredText,
  angle: requiredText,
  why_this: requiredText,
  hook: requiredText,
  draft: requiredText,
  source_signal: requiredText
});

export const generationOutputSchema = z.object({
  posts: z.array(generatedPostSchema).min(1)
});

export type GeneratedPost = z.infer<typeof generatedPostSchema>;
export type GenerationOutput = z.infer<typeof generationOutputSchema>;
