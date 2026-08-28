import type {
  ComplianceCheck,
  CreatorArchive,
  DecisionEvent,
  DraftVariant,
  Opportunity,
  OpportunityStatus,
  OutcomeSnapshot,
  SignalEvidence
} from "../domain";

export interface OpportunityQuery {
  statuses?: OpportunityStatus[];
  limit?: number;
}

export interface BrainEventStore {
  withExclusiveLock<T>(key: string, operation: (store: BrainEventStore) => Promise<T>): Promise<T>;
  appendOpportunityRevision(opportunity: Opportunity): Promise<void>;
  getOpportunity(id: string): Promise<Opportunity | null>;
  getOpportunityRevision(id: string, revision: number): Promise<Opportunity | null>;
  listOpportunityRevisions(id: string): Promise<Opportunity[]>;
  listOpportunities(query?: OpportunityQuery): Promise<Opportunity[]>;
  appendSignalEvidence(evidence: SignalEvidence): Promise<void>;
  listSignalEvidence(opportunityId: string, revision?: number): Promise<SignalEvidence[]>;
  appendDraftVariant(draft: DraftVariant): Promise<void>;
  listDraftVariants(opportunityId: string, revision?: number): Promise<DraftVariant[]>;
  appendDecisionEvent(event: DecisionEvent): Promise<void>;
  listDecisionEvents(opportunityId: string): Promise<DecisionEvent[]>;
  appendOutcomeSnapshot(snapshot: OutcomeSnapshot): Promise<void>;
  listOutcomeSnapshots(opportunityId: string): Promise<OutcomeSnapshot[]>;
  appendComplianceCheck(check: ComplianceCheck): Promise<void>;
  listComplianceChecks(retainedPostId?: string): Promise<ComplianceCheck[]>;
  appendCreatorArchive(archive: CreatorArchive): Promise<void>;
  getLatestCreatorArchive(): Promise<CreatorArchive | null>;
  healthCheck(): Promise<void>;
}
