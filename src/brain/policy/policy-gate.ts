import { z } from "zod";
import { runtimeConfigSchema, type RuntimeConfig } from "../config/runtime-config";

export const liveCapabilitySchema = z.enum(["live-x-read", "live-ai-judgment", "live-ai-generation", "x-write"]);
export type LiveCapability = z.infer<typeof liveCapabilitySchema>;

export interface CapabilityDecision {
  capability: LiveCapability;
  allowed: boolean;
  mode: RuntimeConfig["mode"];
  reason: string;
  approvalReference: string | null;
}

export class PolicyDeniedError extends Error {
  constructor(readonly decision: CapabilityDecision) {
    super(`${decision.capability} denied: ${decision.reason}`);
    this.name = "PolicyDeniedError";
  }
}

export interface PolicyGateOptions {
  readonly installedCapabilities?: readonly LiveCapability[];
}

const policyGateOptionsSchema = z.object({
  installedCapabilities: z.array(liveCapabilitySchema).optional()
}).strict();
const allCapabilities: readonly LiveCapability[] = ["live-x-read", "live-ai-judgment", "live-ai-generation", "x-write"];

function impossibleMode(mode: never): never {
  throw new Error(`Unsupported runtime mode: ${String(mode)}`);
}

export function createPolicyGate(config: RuntimeConfig, options: PolicyGateOptions = {}) {
  const parsedConfig = runtimeConfigSchema.parse(config);
  const parsedOptions = policyGateOptionsSchema.parse(options);
  const installedCapabilities = new Set(parsedOptions.installedCapabilities ?? []);

  function check(capability: LiveCapability): CapabilityDecision {
    const parsedCapability = liveCapabilitySchema.parse(capability);

    if (parsedConfig.mode === "synthetic") {
      return {
        capability: parsedCapability,
        allowed: false,
        mode: parsedConfig.mode,
        reason: "live capabilities are disabled in synthetic mode",
        approvalReference: null
      };
    }

    if (parsedConfig.mode === "production") {
      if (!installedCapabilities.has(parsedCapability)) {
        return {
          capability: parsedCapability,
          allowed: false,
          mode: parsedConfig.mode,
          reason: "capability adapter is not installed in this slice",
          approvalReference: parsedConfig.xApprovalReference
        };
      }

      return {
        capability: parsedCapability,
        allowed: true,
        mode: parsedConfig.mode,
        reason: "production configuration includes approval reference and spend limits",
        approvalReference: parsedConfig.xApprovalReference
      };
    }

    return impossibleMode(parsedConfig);
  }

  function assertAllowed(capability: LiveCapability): void {
    const decision = check(capability);
    if (!decision.allowed) throw new PolicyDeniedError(decision);
  }

  return {
    check,
    assertAllowed,
    list: () => allCapabilities.map(check)
  };
}
