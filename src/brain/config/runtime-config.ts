import { z } from "zod";

export type RuntimeEnv = Record<string, string | undefined>;

export const DEFAULT_SYNTHETIC_DATABASE_URL = "postgresql://social_brain:social_brain@127.0.0.1:54329/social_brain_test";

const requiredText = z.string().trim().min(1);
const plainUsdSyntax = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

type ParsedUsd = { cents: number; dollars: number };

function parseUsd(value: string | number): ParsedUsd {
  const text = typeof value === "number" ? String(value) : value;
  if (!plainUsdSyntax.test(text)) throw new Error("USD must be a plain base-10 value with at most two decimal places");

  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("USD cents must be positive and no greater than Number.MAX_SAFE_INTEGER");
  }

  const safeCents = Number(cents);
  const dollars = safeCents / 100;
  const publicText = String(dollars);
  const [publicWhole, publicFraction = ""] = publicText.split(".");
  const publicCents = plainUsdSyntax.test(publicText)
    ? BigInt(publicWhole) * 100n + BigInt(publicFraction.padEnd(2, "0"))
    : -1n;
  if (publicCents !== cents) {
    throw new Error("USD value cannot be represented as a stable dollar number");
  }

  return { cents: safeCents, dollars };
}

const usdSchema = z.union([z.string(), z.number()]).transform((value, context): ParsedUsd => {
  try {
    return parseUsd(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Invalid USD value"
    });
    return z.NEVER;
  }
});

function databaseUrlSchema(mode: "synthetic" | "production") {
  return z.string().trim().superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: "custom", message: "Database URL must be parseable" });
      return;
    }

    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      context.addIssue({ code: "custom", message: "Database URL must use postgres or postgresql" });
    }
    if (!url.hostname) {
      context.addIssue({ code: "custom", message: "Database URL must include a hostname" });
    }

    if (!/^\/[^/]+$/.test(url.pathname)) {
      context.addIssue({ code: "custom", message: "Database URL must contain exactly one path database segment" });
      return;
    }

    let databaseName: string;
    try {
      databaseName = decodeURI(url.pathname.slice(1));
    } catch {
      context.addIssue({ code: "custom", message: "Database URL database name must decode successfully" });
      return;
    }

    if (mode === "synthetic" && !databaseName.endsWith("_test")) {
      context.addIssue({ code: "custom", message: "Synthetic database name must end in _test" });
    }
    if (mode === "production") {
      if (databaseName.endsWith("_test")) {
        context.addIssue({ code: "custom", message: "Production database name must not end in _test" });
      }
      const sslModes = url.searchParams.getAll("sslmode");
      if (sslModes.length !== 1 || sslModes[0] !== "verify-full") {
        context.addIssue({ code: "custom", message: "Production database URL requires exactly one sslmode=verify-full" });
      }
    }
  });
}

export const syntheticConfigSchema = z.object({
  mode: z.literal("synthetic"),
  databaseUrl: databaseUrlSchema("synthetic")
}).strict();

export const productionConfigSchema = z.object({
  mode: z.literal("production"),
  databaseUrl: databaseUrlSchema("production"),
  xApprovalReference: requiredText,
  dailySpendLimitUsd: usdSchema,
  monthlySpendLimitUsd: usdSchema
}).strict().superRefine((config, context) => {
  if (config.dailySpendLimitUsd.cents > config.monthlySpendLimitUsd.cents) {
    context.addIssue({
      code: "custom",
      path: ["dailySpendLimitUsd"],
      message: "Daily spend limit must not exceed monthly spend limit"
    });
  }
}).transform((config) => ({
  ...config,
  dailySpendLimitUsd: config.dailySpendLimitUsd.dollars,
  monthlySpendLimitUsd: config.monthlySpendLimitUsd.dollars
}));

export const runtimeConfigSchema = z.union([syntheticConfigSchema, productionConfigSchema]);

export type RuntimeConfig = z.output<typeof runtimeConfigSchema>;

export function loadRuntimeConfig(env: RuntimeEnv = process.env): RuntimeConfig {
  const mode = z.enum(["synthetic", "production"]).parse(env.SOCIAL_BRAIN_MODE ?? "synthetic");

  if (mode === "synthetic") {
    return runtimeConfigSchema.parse({
      mode,
      databaseUrl: env.SOCIAL_BRAIN_DATABASE_URL ?? DEFAULT_SYNTHETIC_DATABASE_URL
    });
  }

  return runtimeConfigSchema.parse({
    mode,
    databaseUrl: env.SOCIAL_BRAIN_DATABASE_URL,
    xApprovalReference: env.SOCIAL_BRAIN_X_APPROVAL_REFERENCE,
    dailySpendLimitUsd: env.SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD,
    monthlySpendLimitUsd: env.SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD
  });
}
