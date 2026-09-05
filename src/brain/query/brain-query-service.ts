import type { RuntimeConfig } from "../config/runtime-config";
import {
  acceptedCreatorBaselineSchema,
  creatorArchiveSchema,
  creatorBaselineProposalSchema,
  type AcceptedCreatorBaseline,
  type CreatorBaselineProposal,
  type OpportunityStatus
} from "../domain";
import { createPolicyGate } from "../policy/policy-gate";
import type { BrainEventStore } from "../storage/event-store";

export interface CreatorBaselineSnapshot {
  currentArchiveFingerprint: string | null;
  proposal: CreatorBaselineProposal | null;
  accepted: AcceptedCreatorBaseline | null;
}

const EMPTY_BASELINE_SNAPSHOT: CreatorBaselineSnapshot = {
  currentArchiveFingerprint: null,
  proposal: null,
  accepted: null
};

export class BrainQueryService {
  private readonly policyGate;
  private readonly baselineSnapshot: CreatorBaselineSnapshot;

  constructor(
    private readonly store: BrainEventStore,
    private readonly config: RuntimeConfig,
    baselineSnapshot: CreatorBaselineSnapshot = EMPTY_BASELINE_SNAPSHOT
  ) {
    this.policyGate = createPolicyGate(config);
    if (
      baselineSnapshot.currentArchiveFingerprint !== null &&
      !/^[a-f0-9]{64}$/.test(baselineSnapshot.currentArchiveFingerprint)
    ) {
      throw new Error("Current archive fingerprint must be null or a lowercase SHA-256 value");
    }
    this.baselineSnapshot = {
      currentArchiveFingerprint: baselineSnapshot.currentArchiveFingerprint,
      proposal: baselineSnapshot.proposal === null
        ? null
        : creatorBaselineProposalSchema.parse(baselineSnapshot.proposal),
      accepted: baselineSnapshot.accepted === null
        ? null
        : acceptedCreatorBaselineSchema.parse(baselineSnapshot.accepted)
    };
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

  getCreatorBaseline() {
    const { currentArchiveFingerprint, proposal, accepted } = this.baselineSnapshot;
    return {
      proposalAvailable: proposal !== null,
      acceptedAvailable: accepted !== null,
      proposalMatchesCurrentArchive: proposal !== null &&
        currentArchiveFingerprint !== null &&
        proposal.sourceArchiveFingerprint === currentArchiveFingerprint,
      acceptedMatchesCurrentArchive: accepted !== null &&
        currentArchiveFingerprint !== null &&
        accepted.acceptedSourceArchiveFingerprint === currentArchiveFingerprint,
      proposal: proposal === null ? null : structuredClone(proposal),
      accepted: accepted === null ? null : structuredClone(accepted)
    };
  }

  async getCreatorArchive() {
    const archive = await this.store.getLatestCreatorArchive();
    return archive === null ? null : creatorArchiveSchema.parse(archive);
  }

  async getSystemHealth() {
    let storage: "healthy" | "unavailable" = "healthy";
    let latestComplianceCheckedAt: string | null = null;
    let creatorArchive: { available: boolean; source: "legacy-sqlite" | "x-api-owned-posts" | null; importedAt: string | null } = {
      available: false,
      source: null,
      importedAt: null
    };
    try {
      await this.store.healthCheck();
      const compliance = await this.store.listComplianceChecks();
      latestComplianceCheckedAt = compliance.at(-1)?.checkedAt ?? null;
      const archive = await this.getCreatorArchive();
      if (archive) {
        creatorArchive = {
          available: true,
          source: archive.source,
          importedAt: archive.importedAt
        };
      }
    } catch {
      storage = "unavailable";
    }
    return {
      mode: this.config.mode,
      storage,
      liveAdaptersInstalled: false,
      approvalConfigured: this.config.mode === "production",
      latestComplianceCheckedAt,
      creatorArchive,
      capabilities: this.policyGate.list().map(({ capability, allowed, reason }) => ({ capability, allowed, reason }))
    };
  }
}
