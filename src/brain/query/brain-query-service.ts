import type { RuntimeConfig } from "../config/runtime-config";
import type { OpportunityStatus } from "../domain";
import { createPolicyGate } from "../policy/policy-gate";
import type { BrainEventStore } from "../storage/event-store";

export class BrainQueryService {
  private readonly policyGate;

  constructor(private readonly store: BrainEventStore, private readonly config: RuntimeConfig) {
    this.policyGate = createPolicyGate(config);
  }

  async listOpportunities(input: { statuses?: OpportunityStatus[]; limit?: number } = {}) {
    return { opportunities: await this.store.listOpportunities(input) };
  }

  async inspectOpportunity(id: string) {
    const opportunity = await this.store.getOpportunity(id);
    if (!opportunity) throw new Error(`Opportunity not found: ${id}`);
    return {
      opportunity,
      revisions: await this.store.listOpportunityRevisions(id),
      evidence: await this.store.listSignalEvidence(id),
      drafts: await this.store.listDraftVariants(id),
      decisions: await this.store.listDecisionEvents(id),
      outcomes: await this.store.listOutcomeSnapshots(id),
      compliance: opportunity.targetPostId ? await this.store.listComplianceChecks(opportunity.targetPostId) : []
    };
  }

  async explainPrediction(id: string, revision?: number) {
    const current = await this.store.getOpportunity(id);
    if (!current) throw new Error(`Opportunity not found: ${id}`);
    const selectedRevision = revision ?? current.revision;
    const opportunity = await this.store.getOpportunityRevision(id, selectedRevision);
    if (!opportunity) throw new Error(`Opportunity revision not found: ${id}@${selectedRevision}`);
    return {
      opportunity,
      evidence: await this.store.listSignalEvidence(id, selectedRevision),
      drafts: await this.store.listDraftVariants(id, selectedRevision)
    };
  }

  getProofStatus() {
    return {
      state: "not_started" as const,
      requiredConsecutiveDays: 7,
      requiredViews: 1000,
      maturityHours: 48,
      reason: "Slice 1 is synthetic-only; live proof begins after later slice gates pass"
    };
  }

  async getSystemHealth() {
    let storage: "healthy" | "unavailable" = "healthy";
    let latestComplianceCheckedAt: string | null = null;
    try {
      await this.store.healthCheck();
      const compliance = await this.store.listComplianceChecks();
      latestComplianceCheckedAt = compliance.at(-1)?.checkedAt ?? null;
    } catch {
      storage = "unavailable";
    }
    return {
      mode: this.config.mode,
      storage,
      liveAdaptersInstalled: false,
      approvalConfigured: this.config.mode === "production",
      latestComplianceCheckedAt,
      capabilities: this.policyGate.list().map(({ capability, allowed, reason }) => ({ capability, allowed, reason }))
    };
  }
}
