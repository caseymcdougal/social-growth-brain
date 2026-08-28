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
});

export type ReplayFixture = z.infer<typeof replayFixtureSchema>;
