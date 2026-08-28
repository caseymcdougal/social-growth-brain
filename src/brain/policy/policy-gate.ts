import type { RuntimeConfig } from "../config/runtime-config";

export type LiveCapability = "live-x-read" | "live-ai-judgment" | "live-ai-generation" | "x-write";

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

const allCapabilities = ["live-x-read", "live-ai-judgment", "live-ai-generation", "x-write"] as const;

export function createPolicyGate(config: RuntimeConfig, options: PolicyGateOptions = {}) {
  const installedCapabilities = new Set(options.installedCapabilities);

  function check(capability: LiveCapability): CapabilityDecision {
    if (config.mode === "synthetic") {
      return {
        capability,
        allowed: false,
        mode: config.mode,
        reason: "live capabilities are disabled in synthetic mode",
        approvalReference: null
      };
    }

    if (!installedCapabilities.has(capability)) {
      return {
        capability,
        allowed: false,
        mode: config.mode,
        reason: "capability adapter is not installed in this slice",
        approvalReference: config.xApprovalReference
      };
    }

    return {
      capability,
      allowed: true,
      mode: config.mode,
      reason: "production configuration includes approval reference and spend limits",
      approvalReference: config.xApprovalReference
    };
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
