import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  complianceCheckSchema, creatorArchiveSchema, decisionEventSchema, draftVariantSchema,
  opportunitySchema, opportunityStatusSchema, outcomeSnapshotSchema, signalEvidenceSchema,
  type ComplianceCheck, type CreatorArchive, type DecisionEvent, type DraftVariant,
  type Opportunity, type OutcomeSnapshot, type SignalEvidence
} from "../domain";
import type { BrainEventStore, OpportunityQuery } from "./event-store";

type PayloadRow = { payload: unknown };
const opportunityQuerySchema = z.object({
  statuses: z.array(opportunityStatusSchema).optional(),
  limit: z.number().int().min(1).max(100).optional()
}).strict();

export class PostgresBrainEventStore implements BrainEventStore {
  constructor(private readonly pool: Pool | PoolClient, private readonly transactionScoped = false) {}

  async withExclusiveLock<T>(key: string, operation: (store: BrainEventStore) => Promise<T>): Promise<T> {
    if (this.transactionScoped) return operation(this);
    const client = await (this.pool as Pool).connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
      const result = await operation(new PostgresBrainEventStore(client, true));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async appendOpportunityRevision(opportunityInput: Opportunity): Promise<void> {
    const opportunity = opportunitySchema.parse(opportunityInput);
    if (this.transactionScoped) return this.appendOpportunityRevisionInTransaction(opportunity);
    const client = await (this.pool as Pool).connect();
    try {
      await client.query("BEGIN");
      await new PostgresBrainEventStore(client, true).appendOpportunityRevisionInTransaction(opportunity);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  private async appendOpportunityRevisionInTransaction(opportunity: Opportunity): Promise<void> {
    await this.pool.query(`INSERT INTO brain_opportunity_revisions
      (opportunity_id, revision, revised_at, payload) VALUES ($1, $2, $3, $4)`, [opportunity.id, opportunity.revision, opportunity.revisedAt, opportunity]);
    await this.pool.query(`INSERT INTO brain_opportunities
      (id, creator_id, revision, status, publish_by, payload, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET revision = EXCLUDED.revision, status = EXCLUDED.status,
        publish_by = EXCLUDED.publish_by, payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
      WHERE brain_opportunities.revision < EXCLUDED.revision`, [opportunity.id, opportunity.creatorId, opportunity.revision, opportunity.status, opportunity.publishBy, opportunity, opportunity.revisedAt]);
  }

  async getOpportunity(id: string): Promise<Opportunity | null> { return this.one("SELECT payload FROM brain_opportunities WHERE id = $1", [id], opportunitySchema); }
  async getOpportunityRevision(id: string, revision: number): Promise<Opportunity | null> { return this.one("SELECT payload FROM brain_opportunity_revisions WHERE opportunity_id = $1 AND revision = $2", [id, revision], opportunitySchema); }
  async listOpportunityRevisions(id: string): Promise<Opportunity[]> { return this.many("SELECT payload FROM brain_opportunity_revisions WHERE opportunity_id = $1 ORDER BY revision ASC", [id], opportunitySchema); }

  async listOpportunities(query: OpportunityQuery = {}): Promise<Opportunity[]> {
    const validatedQuery = opportunityQuerySchema.parse(query);
    const limit = validatedQuery.limit ?? 20;
    if (validatedQuery.statuses?.length) return this.many("SELECT payload FROM brain_opportunities WHERE status = ANY($1::text[]) ORDER BY publish_by ASC, id ASC LIMIT $2", [validatedQuery.statuses, limit], opportunitySchema);
    return this.many("SELECT payload FROM brain_opportunities ORDER BY publish_by ASC, id ASC LIMIT $1", [limit], opportunitySchema);
  }

  async appendSignalEvidence(input: SignalEvidence): Promise<void> { const value = signalEvidenceSchema.parse(input); await this.insert("INSERT INTO brain_signal_evidence (id, opportunity_id, prediction_revision, captured_at, payload) VALUES ($1, $2, $3, $4, $5)", [value.id, value.opportunityId, value.predictionRevision, value.capturedAt, value]); }
  async listSignalEvidence(opportunityId: string, revision?: number): Promise<SignalEvidence[]> { return revision === undefined ? this.many("SELECT payload FROM brain_signal_evidence WHERE opportunity_id = $1 ORDER BY prediction_revision ASC, captured_at ASC, id ASC", [opportunityId], signalEvidenceSchema) : this.many("SELECT payload FROM brain_signal_evidence WHERE opportunity_id = $1 AND prediction_revision = $2 ORDER BY prediction_revision ASC, captured_at ASC, id ASC", [opportunityId, revision], signalEvidenceSchema); }
  async appendDraftVariant(input: DraftVariant): Promise<void> { const value = draftVariantSchema.parse(input); await this.insert("INSERT INTO brain_draft_variants (id, opportunity_id, prediction_revision, created_at, payload) VALUES ($1, $2, $3, $4, $5)", [value.id, value.opportunityId, value.predictionRevision, value.createdAt, value]); }
  async listDraftVariants(opportunityId: string, revision?: number): Promise<DraftVariant[]> { return revision === undefined ? this.many("SELECT payload FROM brain_draft_variants WHERE opportunity_id = $1 ORDER BY prediction_revision ASC, created_at ASC, id ASC", [opportunityId], draftVariantSchema) : this.many("SELECT payload FROM brain_draft_variants WHERE opportunity_id = $1 AND prediction_revision = $2 ORDER BY prediction_revision ASC, created_at ASC, id ASC", [opportunityId, revision], draftVariantSchema); }
  async appendDecisionEvent(input: DecisionEvent): Promise<void> { const value = decisionEventSchema.parse(input); await this.insert("INSERT INTO brain_decision_events (id, opportunity_id, opportunity_revision, event_type, occurred_at, payload) VALUES ($1, $2, $3, $4, $5, $6)", [value.id, value.opportunityId, value.opportunityRevision, value.type, value.occurredAt, value]); }
  async listDecisionEvents(opportunityId: string): Promise<DecisionEvent[]> { return this.many("SELECT payload FROM brain_decision_events WHERE opportunity_id = $1 ORDER BY occurred_at ASC, id ASC", [opportunityId], decisionEventSchema); }
  async appendOutcomeSnapshot(input: OutcomeSnapshot): Promise<void> { const value = outcomeSnapshotSchema.parse(input); await this.insert("INSERT INTO brain_outcome_snapshots (id, opportunity_id, observed_at, payload) VALUES ($1, $2, $3, $4)", [value.id, value.opportunityId, value.observedAt, value]); }
  async listOutcomeSnapshots(opportunityId: string): Promise<OutcomeSnapshot[]> { return this.many("SELECT payload FROM brain_outcome_snapshots WHERE opportunity_id = $1 ORDER BY observed_at ASC, id ASC", [opportunityId], outcomeSnapshotSchema); }
  async appendComplianceCheck(input: ComplianceCheck): Promise<void> { const value = complianceCheckSchema.parse(input); await this.insert("INSERT INTO brain_compliance_checks (id, retained_post_id, checked_at, payload) VALUES ($1, $2, $3, $4)", [value.id, value.retainedPostId, value.checkedAt, value]); }
  async listComplianceChecks(retainedPostId?: string): Promise<ComplianceCheck[]> { return retainedPostId === undefined ? this.many("SELECT payload FROM brain_compliance_checks ORDER BY checked_at ASC, id ASC", [], complianceCheckSchema) : this.many("SELECT payload FROM brain_compliance_checks WHERE retained_post_id = $1 ORDER BY checked_at ASC, id ASC", [retainedPostId], complianceCheckSchema); }
  async appendCreatorArchive(input: CreatorArchive): Promise<void> { const value = creatorArchiveSchema.parse(input); await this.insert("INSERT INTO brain_creator_archives (id, creator_id, source_fingerprint, imported_at, payload) VALUES ($1, $2, $3, $4, $5)", [value.id, value.creatorId, value.sourceFingerprint, value.importedAt, value]); }
  async getLatestCreatorArchive(): Promise<CreatorArchive | null> { return this.one("SELECT payload FROM brain_creator_archives WHERE creator_id = $1 ORDER BY imported_at DESC, id DESC LIMIT 1", ["casey-mcdougal"], creatorArchiveSchema); }
  async healthCheck(): Promise<void> { await this.pool.query("SELECT 1"); }

  private async insert(sql: string, values: unknown[]): Promise<void> { await this.pool.query(sql, values); }
  private async one<T>(sql: string, values: unknown[], parser: { parse(value: unknown): T }): Promise<T | null> { const result = await this.pool.query<PayloadRow>(sql, values); return result.rows[0] ? parser.parse(result.rows[0].payload) : null; }
  private async many<T>(sql: string, values: unknown[], parser: { parse(value: unknown): T }): Promise<T[]> { const result = await this.pool.query<PayloadRow>(sql, values); return result.rows.map((row) => parser.parse(row.payload)); }
}
