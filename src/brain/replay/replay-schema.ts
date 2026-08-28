import { z } from "zod";
import {
  complianceCheckSchema,
  decisionEventSchema,
  draftVariantSchema,
  opportunitySchema,
  outcomeSnapshotSchema,
  signalEvidenceSchema,
  uuidSchema
} from "../domain";

const replayEventSchema = z.discriminatedUnion("kind", [
  z.object({ sequence: z.number().int().positive(), at: z.string().datetime({ offset: true }), kind: z.literal("opportunity_revision"), payload: opportunitySchema }),
  z.object({ sequence: z.number().int().positive(), at: z.string().datetime({ offset: true }), kind: z.literal("signal_evidence"), payload: signalEvidenceSchema }),
  z.object({ sequence: z.number().int().positive(), at: z.string().datetime({ offset: true }), kind: z.literal("draft_variant"), payload: draftVariantSchema }),
  z.object({ sequence: z.number().int().positive(), at: z.string().datetime({ offset: true }), kind: z.literal("decision_event"), payload: decisionEventSchema }),
  z.object({ sequence: z.number().int().positive(), at: z.string().datetime({ offset: true }), kind: z.literal("outcome_snapshot"), payload: outcomeSnapshotSchema }),
  z.object({ sequence: z.number().int().positive(), at: z.string().datetime({ offset: true }), kind: z.literal("compliance_check"), payload: complianceCheckSchema })
]);

export const replayFixtureSchema = z.object({
  schemaVersion: z.literal(1),
  replayId: uuidSchema,
  name: z.string().trim().min(1),
  primaryOpportunityId: uuidSchema,
  events: z.array(replayEventSchema).min(1)
}).superRefine((fixture, context) => {
  const issue = (index: number, message: string) => context.addIssue({ code: "custom", path: ["events", index], message });
  const revisions = new Map<string, { index: number; payload: Extract<ReplayFixture["events"][number], { kind: "opportunity_revision" }> ["payload"] }>();
  const immutableIds = new Set<string>();
  for (let index = 1; index < fixture.events.length; index += 1) {
    const previous = fixture.events[index - 1];
    const current = fixture.events[index];
    if (current.sequence <= previous.sequence) {
      context.addIssue({ code: "custom", path: ["events", index, "sequence"], message: "sequence must strictly increase" });
    }
    if (Date.parse(current.at) < Date.parse(previous.at)) {
      context.addIssue({ code: "custom", path: ["events", index, "at"], message: "event time cannot move backward" });
    }
  }
  fixture.events.forEach((event, index) => {
    const payloadTime = event.kind === "opportunity_revision" ? event.payload.revisedAt
      : event.kind === "signal_evidence" ? event.payload.capturedAt
      : event.kind === "draft_variant" ? event.payload.createdAt
      : event.kind === "decision_event" ? event.payload.occurredAt
      : event.kind === "outcome_snapshot" ? event.payload.observedAt : event.payload.checkedAt;
    if (event.at !== payloadTime) issue(index, "event envelope timestamp must equal payload timestamp");
    if (event.kind === "opportunity_revision") {
      if (event.payload.id !== fixture.primaryOpportunityId) issue(index, "opportunity revision must belong to primary opportunity");
      const key = `${event.payload.id}:${event.payload.revision}`;
      if (revisions.has(key)) issue(index, "opportunity revision keys must be unique");
      revisions.set(key, { index, payload: event.payload });
      return;
    }
    if (!immutableIds.add(event.payload.id)) issue(index, "immutable payload ids must be globally unique");
    if (event.kind === "compliance_check") {
      if (![...revisions.values()].some(({ index: revisionIndex, payload }) => revisionIndex < index && payload.targetPostId === event.payload.retainedPostId)) {
        issue(index, "compliance must follow an opportunity revision with its matching target");
      }
      return;
    }
    if (event.kind === "outcome_snapshot" && ![...revisions.values()].some(({ index: revisionIndex }) => revisionIndex < index)) {
      issue(index, "outcome must follow an opportunity revision");
    }
    if (event.payload.opportunityId !== fixture.primaryOpportunityId) issue(index, "record must belong to primary opportunity");
    const revision = event.kind === "signal_evidence" || event.kind === "draft_variant" ? event.payload.predictionRevision
      : event.kind === "decision_event" ? event.payload.opportunityRevision : undefined;
    const opportunity = revision === undefined ? undefined : revisions.get(`${fixture.primaryOpportunityId}:${revision}`);
    if (revision !== undefined && !opportunity) issue(index, "record must reference an included opportunity revision");
    else if (opportunity && opportunity.index >= index) issue(index, "opportunity revision must precede dependent records");
    if (event.kind === "signal_evidence" && opportunity && event.payload.retainedPostId !== opportunity.payload.targetPostId) issue(index, "evidence target must match opportunity target");
    if (event.kind === "draft_variant" && opportunity && (event.payload.actionType !== opportunity.payload.actionType || event.payload.targetPostId !== opportunity.payload.targetPostId)) issue(index, "draft action and target must match opportunity");
  });
  const primaryRevisions = [...revisions.values()].filter(({ payload }) => payload.id === fixture.primaryOpportunityId);
  if (!primaryRevisions.length) context.addIssue({ code: "custom", path: ["primaryOpportunityId"], message: "primary opportunity must have a revision" });
  for (const { index, payload } of primaryRevisions) {
    const evidence = new Set(fixture.events.filter((event) => event.kind === "signal_evidence" && event.payload.predictionRevision === payload.revision).map((event) => event.payload.id));
    const drafts = new Set(fixture.events.filter((event) => event.kind === "draft_variant" && event.payload.predictionRevision === payload.revision).map((event) => event.payload.id));
    if (!payload.evidenceIds.every((id) => evidence.has(id))) issue(index, "opportunity evidence ids must resolve to its revision evidence");
    if (payload.recommendedDraftId && !drafts.has(payload.recommendedDraftId)) issue(index, "recommended draft must resolve to its revision draft");
  }
});

export type ReplayFixture = z.infer<typeof replayFixtureSchema>;
