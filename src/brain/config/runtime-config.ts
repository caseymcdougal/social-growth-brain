import { z } from "zod";

export type RuntimeEnv = Record<string, string | undefined>;

export const DEFAULT_SYNTHETIC_DATABASE_URL = "postgresql://social_brain:social_brain@127.0.0.1:54329/social_brain_test";

const requiredText = z.string().trim().min(1);
const positiveMoney = z.coerce.number().finite().positive();

const syntheticConfigSchema = z.object({
  mode: z.literal("synthetic"),
  databaseUrl: requiredText
});

const productionConfigSchema = z.object({
  mode: z.literal("production"),
  databaseUrl: requiredText,
  xApprovalReference: requiredText,
  dailySpendLimitUsd: positiveMoney,
  monthlySpendLimitUsd: positiveMoney
}).superRefine((config, context) => {
  if (config.dailySpendLimitUsd > config.monthlySpendLimitUsd) {
    context.addIssue({
      code: "custom",
      path: ["dailySpendLimitUsd"],
      message: "Daily spend limit must not exceed monthly spend limit"
    });
  }
});

export type RuntimeConfig = z.infer<typeof syntheticConfigSchema> | z.infer<typeof productionConfigSchema>;

export function loadRuntimeConfig(env: RuntimeEnv = process.env): RuntimeConfig {
  const mode = z.enum(["synthetic", "production"]).parse(env.SOCIAL_BRAIN_MODE ?? "synthetic");

  if (mode === "synthetic") {
    return syntheticConfigSchema.parse({
      mode,
      databaseUrl: env.SOCIAL_BRAIN_DATABASE_URL ?? DEFAULT_SYNTHETIC_DATABASE_URL
    });
  }

  return productionConfigSchema.parse({
    mode,
    databaseUrl: env.SOCIAL_BRAIN_DATABASE_URL,
    xApprovalReference: env.SOCIAL_BRAIN_X_APPROVAL_REFERENCE,
    dailySpendLimitUsd: env.SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD,
    monthlySpendLimitUsd: env.SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD
  });
}
