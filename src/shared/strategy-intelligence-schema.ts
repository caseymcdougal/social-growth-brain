import { z } from "zod";

const requiredText = z.string().trim().min(1);

export const strategyExperimentSchema = z.object({
  hypothesis: requiredText,
  status: z.enum(["active", "watching", "retired"]),
  evidence: requiredText
}).strict();

export const strategyMemorySchema = z.object({
  positioning: requiredText,
  audience_segments: z.array(requiredText).min(1),
  strongest_lanes: z.array(requiredText).min(1),
  weak_lanes: z.array(requiredText).min(1),
  voice_rules: z.array(requiredText).min(1),
  proof_points: z.array(requiredText).min(1),
  active_experiments: z.array(strategyExperimentSchema).min(1)
}).strict();

export const memoryUpdateSchema = z.object({
  area: requiredText,
  proposed: requiredText,
  reason: requiredText,
  evidence: requiredText
});

export const strategyMemoryProposalOutputSchema = z.object({
  memory: strategyMemorySchema,
  updates: z.array(memoryUpdateSchema).min(1)
});

export const topicCardSchema = z.object({
  title: requiredText,
  lane: requiredText,
  why_near: requiredText,
  evidence: z.array(requiredText).min(1),
  risk: z.enum(["low", "medium", "high"]),
  hooks: z.array(requiredText).min(2),
  draft: requiredText,
  follow_up_prompt: requiredText
});

export const topicExplorationOutputSchema = z.object({
  topics: z.array(topicCardSchema).min(1)
});

export type StrategyMemory = z.infer<typeof strategyMemorySchema>;
export type StrategyMemoryProposalOutput = z.infer<typeof strategyMemoryProposalOutputSchema>;
export type TopicExplorationOutput = z.infer<typeof topicExplorationOutputSchema>;
