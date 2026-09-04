import type {
  ComplianceCheck,
  CreatorArchive,
  DecisionEvent,
  DraftVariant,
  Opportunity,
  OutcomeSnapshot,
  SignalEvidence
} from "../domain";
import type { BrainEventStore, OpportunityQuery } from "./event-store";

function ascending<T>(items: T[], read: (item: T) => string): T[] {
  return [...items].sort((left, right) => read(left).localeCompare(read(right)));
}

export class InMemoryBrainEventStore implements BrainEventStore {
  private readonly opportunities = new Map<string, Opportunity>();
  private readonly revisions = new Map<string, Opportunity[]>();
  private readonly evidence = new Map<string, SignalEvidence[]>();
  private readonly drafts = new Map<string, DraftVariant[]>();
  private readonly decisions = new Map<string, DecisionEvent[]>();
  private readonly outcomes = new Map<string, OutcomeSnapshot[]>();
  private readonly compliance: ComplianceCheck[] = [];
  private readonly archives = new Map<string, CreatorArchive>();

  async withExclusiveLock<T>(_key: string, operation: (store: BrainEventStore) => Promise<T>): Promise<T> {
    return operation(this);
  }

  async appendOpportunityRevision(opportunity: Opportunity): Promise<void> {
    const revisions = this.revisions.get(opportunity.id) ?? [];
    if (!revisions.some((item) => item.revision === opportunity.revision)) revisions.push(opportunity);
    this.revisions.set(opportunity.id, ascending(revisions, (item) => String(item.revision).padStart(12, "0")));
    const current = this.opportunities.get(opportunity.id);
    if (!current || current.revision < opportunity.revision) this.opportunities.set(opportunity.id, opportunity);
  }

  async getOpportunity(id: string): Promise<Opportunity | null> { return this.opportunities.get(id) ?? null; }
  async getOpportunityRevision(id: string, revision: number): Promise<Opportunity | null> { return this.revisions.get(id)?.find((item) => item.revision === revision) ?? null; }
  async listOpportunityRevisions(id: string): Promise<Opportunity[]> { return [...(this.revisions.get(id) ?? [])]; }

  async listOpportunities(query: OpportunityQuery = {}): Promise<Opportunity[]> {
    const eligible = [...this.opportunities.values()].filter((item) => !query.statuses?.length || query.statuses.includes(item.status));
    return ascending(eligible, (item) => `${item.publishBy}\u0000${item.id}`).slice(0, query.limit ?? 20);
  }

  async appendSignalEvidence(value: SignalEvidence): Promise<void> { this.append(this.evidence, value.opportunityId, value); }
  async listSignalEvidence(id: string, revision?: number): Promise<SignalEvidence[]> {
    return ascending((this.evidence.get(id) ?? []).filter((item) => revision === undefined || item.predictionRevision === revision), (item) => `${String(item.predictionRevision).padStart(12, "0")}\u0000${item.capturedAt}\u0000${item.id}`);
  }

  async appendDraftVariant(value: DraftVariant): Promise<void> { this.append(this.drafts, value.opportunityId, value); }
  async listDraftVariants(id: string, revision?: number): Promise<DraftVariant[]> {
    return ascending((this.drafts.get(id) ?? []).filter((item) => revision === undefined || item.predictionRevision === revision), (item) => `${String(item.predictionRevision).padStart(12, "0")}\u0000${item.createdAt}\u0000${item.id}`);
  }

  async appendDecisionEvent(value: DecisionEvent): Promise<void> { this.append(this.decisions, value.opportunityId, value); }
  async listDecisionEvents(id: string): Promise<DecisionEvent[]> { return ascending(this.decisions.get(id) ?? [], (item) => `${item.occurredAt}\u0000${item.id}`); }

  async appendOutcomeSnapshot(value: OutcomeSnapshot): Promise<void> { this.append(this.outcomes, value.opportunityId, value); }
  async listOutcomeSnapshots(id: string): Promise<OutcomeSnapshot[]> { return ascending(this.outcomes.get(id) ?? [], (item) => `${item.observedAt}\u0000${item.id}`); }

  async appendComplianceCheck(value: ComplianceCheck): Promise<void> { this.compliance.push(value); }
  async listComplianceChecks(retainedPostId?: string): Promise<ComplianceCheck[]> {
    return ascending(this.compliance.filter((item) => retainedPostId === undefined || item.retainedPostId === retainedPostId), (item) => `${item.checkedAt}\u0000${item.id}`);
  }

  async appendCreatorArchive(value: CreatorArchive): Promise<void> { this.archives.set(value.sourceFingerprint, value); }
  async getCreatorArchiveByFingerprint(sourceFingerprint: string): Promise<CreatorArchive | null> { return this.archives.get(sourceFingerprint) ?? null; }
  async getLatestCreatorArchive(): Promise<CreatorArchive | null> { return [...this.archives.values()].sort((left, right) => right.importedAt.localeCompare(left.importedAt)).at(0) ?? null; }
  async healthCheck(): Promise<void> {}

  private append<T>(records: Map<string, T[]>, key: string, value: T): void {
    records.set(key, [...(records.get(key) ?? []), value]);
  }
}
