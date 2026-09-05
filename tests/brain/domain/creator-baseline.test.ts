import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  acceptCreatorBaseline,
  acceptedCreatorBaselineSchema,
  baselineClaimAreaSchema,
  buildCreatorBaselineProposal,
  creatorBaselineModelOutputSchema,
  creatorBaselineProposalSchema,
  type CreatorArchive,
  type CreatorBaselineModelOutput,
  type CreatorBaselineProposal
} from "../../../src/brain/domain";

const PROPOSAL_ID = "20000000-0000-4000-8000-000000000001";
const ARCHIVE_FINGERPRINT = "a".repeat(64);
const CREATED_AT = "2026-09-04T21:00:00.000Z";
const ACCEPTED_AT = "2026-09-04T22:00:00.000Z";

function ownedArchive(): CreatorArchive {
  return {
    schemaVersion: 1,
    id: "10000000-0000-4000-8000-000000000001",
    creatorId: "casey-mcdougal",
    source: "x-api-owned-posts",
    consentBasis: "casey-approved-x-owned-post-import",
    consentRecordedAt: "2026-09-04T20:00:00.000Z",
    sourceFingerprint: ARCHIVE_FINGERPRINT,
    importedAt: "2026-09-04T20:01:00.000Z",
    profile: {
      handle: "caseymcdougal",
      displayName: "Casey McDougal",
      bio: "Builder",
      profileUrl: "https://x.com/caseymcdougal",
      followersCount: 100,
      followingCount: 50,
      capturedAt: "2026-09-04T20:00:00.000Z"
    },
    posts: [
      {
        xPostId: "100",
        url: "https://x.com/caseymcdougal/status/100",
        text: "Build the thing, then show the receipt.",
        postedAt: "2026-09-01T12:00:00.000Z",
        capturedAt: "2026-09-04T20:00:00.000Z",
        viewsCount: 1_000,
        likesCount: 20,
        repostsCount: 4,
        repliesCount: 3,
        bookmarksCount: 6
      },
      {
        xPostId: "101",
        url: "https://x.com/caseymcdougal/status/101",
        text: "The useful question is whether it changed the product.",
        postedAt: "2026-09-02T12:00:00.000Z",
        capturedAt: "2026-09-04T20:00:00.000Z",
        viewsCount: 800,
        likesCount: 12,
        repostsCount: 2,
        repliesCount: 5,
        bookmarksCount: 2
      }
    ],
    voiceProfile: null,
    voiceOverrides: "",
    strategyMemory: null,
    creativeDirections: [],
    importReport: { importedPosts: 2, omittedFields: [] }
  };
}

function baselineModelOutput(): CreatorBaselineModelOutput {
  return {
    voiceProfile: {
      summary: "Direct builder language grounded in concrete work.",
      casing_and_punctuation: ["Sentence case with restrained punctuation."],
      sentence_rhythm: ["Short claim followed by a concrete test."],
      vocabulary: ["build", "useful", "receipt"],
      hook_moves: ["Open with an imperative or falsifiable claim."],
      banned_moves: ["Avoid empty hype."],
      style_excerpts: ["Build the thing, then show the receipt."]
    },
    strategyMemory: {
      positioning: "A hands-on AI product builder who shows evidence.",
      audience_segments: ["AI product builders"],
      strongest_lanes: ["Build evidence and product judgment"],
      weak_lanes: ["Unsupported industry commentary"],
      voice_rules: ["Lead with the concrete claim."],
      proof_points: ["Published build receipts"],
      active_experiments: [
        {
          hypothesis: "Posts with a concrete artifact earn stronger saves.",
          status: "active",
          evidence: "Compare future artifact posts with this owned baseline."
        }
      ]
    },
    duplicationGuard: { consideredPostIds: ["100", "101"] },
    claims: [
      {
        area: "voice",
        claim: "Casey uses short claims tied to concrete work.",
        postIds: ["100", "101"],
        evidenceKind: "measured",
        confidence: 0.9,
        uncertainty: "The archive is small."
      },
      {
        area: "positioning",
        claim: "The account can credibly own evidence-backed building.",
        postIds: ["100"],
        evidenceKind: "inferred",
        confidence: 0.72,
        uncertainty: "Audience response is inferred from public metrics."
      },
      {
        area: "duplication",
        claim: "Both imported posts were considered for repeated phrasing.",
        postIds: ["100", "101"],
        evidenceKind: "measured",
        confidence: 1,
        uncertainty: "Only the imported archive was checked."
      }
    ],
    largestUncertainty: "Twenty-four posts can reveal patterns but not causal strategy."
  };
}

function baselineProposal(): CreatorBaselineProposal {
  return buildCreatorBaselineProposal({
    archive: ownedArchive(),
    modelOutput: baselineModelOutput(),
    id: PROPOSAL_ID,
    now: () => new Date(CREATED_AT)
  });
}

describe("creator baseline contracts", () => {
  it("builds a strict proposal tied to every source post", () => {
    const proposal = baselineProposal();

    expect(proposal).toEqual({
      schemaVersion: 1,
      id: PROPOSAL_ID,
      creatorId: "casey-mcdougal",
      createdAt: CREATED_AT,
      sourceArchiveFingerprint: ARCHIVE_FINGERPRINT,
      provenance: {
        interface: "codex-cli",
        model: "codex-cli-chatgpt-default",
        promptTemplateVersion: "owned-x-baseline-v1"
      },
      ...baselineModelOutput()
    });
    expect(creatorBaselineProposalSchema.parse(proposal)).toEqual(proposal);
  });

  it("supports only the approved evidence areas", () => {
    expect(baselineClaimAreaSchema.options).toEqual([
      "voice",
      "positioning",
      "audience",
      "strongest-lane",
      "weak-lane",
      "proof-point",
      "experiment",
      "duplication"
    ]);
    expect(() => baselineClaimAreaSchema.parse("engagement-hack")).toThrow();
  });

  it("rejects unknown and duplicate post evidence", () => {
    const unknown = baselineModelOutput();
    unknown.claims[0]!.postIds = ["999"];
    expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: unknown })).toThrow(/unknown post/i);

    const duplicate = baselineModelOutput();
    duplicate.claims[0]!.postIds = ["100", "100"];
    expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: duplicate })).toThrow(/unique/i);
  });

  it("requires the duplication guard to contain every archive post exactly once", () => {
    const missing = baselineModelOutput();
    missing.duplicationGuard.consideredPostIds = ["100"];
    expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: missing })).toThrow(/considered post/i);

    const duplicate = baselineModelOutput();
    duplicate.duplicationGuard.consideredPostIds = ["100", "100", "101"];
    expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: duplicate })).toThrow(/considered post/i);
  });

  it("requires measured voice and duplication evidence", () => {
    for (const area of ["voice", "duplication"] as const) {
      const output = baselineModelOutput();
      output.claims.find((claim) => claim.area === area)!.evidenceKind = "inferred";
      expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: output })).toThrow(/evidence kind/i);
    }
  });

  it("requires inferred strategy evidence", () => {
    const strategyAreas = ["positioning", "audience", "strongest-lane", "weak-lane", "proof-point", "experiment"] as const;
    for (const area of strategyAreas) {
      const output = baselineModelOutput();
      output.claims[1] = { ...output.claims[1]!, area, evidenceKind: "measured" };
      expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: output })).toThrow(/evidence kind/i);
    }
  });

  it("requires both voice and strategy claim coverage", () => {
    const noVoice = baselineModelOutput();
    noVoice.claims = noVoice.claims.filter((claim) => claim.area !== "voice");
    expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: noVoice })).toThrow(/voice/i);

    const noStrategy = baselineModelOutput();
    noStrategy.claims = noStrategy.claims.filter((claim) => claim.area === "voice" || claim.area === "duplication");
    expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: noStrategy })).toThrow(/strategy/i);
  });

  it("requires a non-empty owned X archive", () => {
    const legacy = { ...ownedArchive(), source: "legacy-sqlite", consentBasis: "casey-requested-import" } as CreatorArchive;
    expect(() => buildCreatorBaselineProposal({ archive: legacy, modelOutput: baselineModelOutput() })).toThrow(/owned X archive/i);

    const empty = { ...ownedArchive(), posts: [], importReport: { importedPosts: 0, omittedFields: [] } };
    expect(() => buildCreatorBaselineProposal({ archive: empty, modelOutput: baselineModelOutput() })).toThrow(/at least one post/i);
  });

  it("rejects malformed model output and unknown fields", () => {
    expect(creatorBaselineModelOutputSchema).toBeDefined();
    expect(creatorBaselineProposalSchema).toBeDefined();
    expect(() => creatorBaselineModelOutputSchema.parse({ ...baselineModelOutput(), largestUncertainty: " " })).toThrow();
    expect(() => creatorBaselineModelOutputSchema.parse({ ...baselineModelOutput(), rawPostText: "private" })).toThrow();
    expect(() => creatorBaselineProposalSchema.parse({ ...baselineProposal(), unknown: true })).toThrow();
  });

  it("enforces evidence rules when parsing stored proposal JSON", () => {
    const wrongEvidence = baselineProposal();
    wrongEvidence.claims[0]!.evidenceKind = "inferred";
    expect(() => creatorBaselineProposalSchema.parse(wrongEvidence)).toThrow(/evidence kind/i);

    const duplicateEvidence = baselineProposal();
    duplicateEvidence.claims[0]!.postIds = ["100", "100"];
    expect(() => creatorBaselineProposalSchema.parse(duplicateEvidence)).toThrow(/unique/i);

    const duplicateConsidered = baselineProposal();
    duplicateConsidered.duplicationGuard.consideredPostIds = ["100", "100"];
    expect(() => creatorBaselineProposalSchema.parse(duplicateConsidered)).toThrow(/considered post/i);

    const noVoice = baselineProposal();
    noVoice.claims = noVoice.claims.filter((claim) => claim.area !== "voice");
    expect(() => creatorBaselineProposalSchema.parse(noVoice)).toThrow(/voice/i);

    const noStrategy = baselineProposal();
    noStrategy.claims = noStrategy.claims.filter((claim) => claim.area === "voice" || claim.area === "duplication");
    expect(() => creatorBaselineProposalSchema.parse(noStrategy)).toThrow(/strategy/i);
  });

  it("creates a deep proposal copy", () => {
    const modelOutput = baselineModelOutput();
    const proposal = buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput, id: PROPOSAL_ID });
    modelOutput.voiceProfile.summary = "mutated";
    modelOutput.claims[0]!.postIds[0] = "999";

    expect(proposal.voiceProfile.summary).not.toBe("mutated");
    expect(proposal.claims[0]!.postIds[0]).toBe("100");
  });

  it("accepts only the exact current proposal and archive", () => {
    const proposal = baselineProposal();
    const accepted = acceptCreatorBaseline({
      archive: ownedArchive(),
      proposal,
      proposalId: proposal.id,
      sourceFingerprint: proposal.sourceArchiveFingerprint,
      now: () => new Date(ACCEPTED_AT)
    });

    expect(accepted).toEqual({
      schemaVersion: 1,
      proposal,
      acceptedAt: ACCEPTED_AT,
      acceptedBy: "casey-mcdougal",
      acceptedProposalId: proposal.id,
      acceptedSourceArchiveFingerprint: proposal.sourceArchiveFingerprint
    });
    expect(acceptedCreatorBaselineSchema.parse(accepted)).toEqual(accepted);
    expect(() => acceptCreatorBaseline({ ...{ archive: ownedArchive(), proposal }, proposalId: randomUUID(), sourceFingerprint: ARCHIVE_FINGERPRINT })).toThrow(/proposal/i);
    expect(() => acceptCreatorBaseline({ ...{ archive: ownedArchive(), proposal }, proposalId: proposal.id, sourceFingerprint: "b".repeat(64) })).toThrow(/fingerprint/i);
  });

  it("rejects stale archives and inconsistent accepted snapshots", () => {
    const proposal = baselineProposal();
    const staleArchive = { ...ownedArchive(), sourceFingerprint: "b".repeat(64) };
    expect(() => acceptCreatorBaseline({ archive: staleArchive, proposal, proposalId: proposal.id, sourceFingerprint: proposal.sourceArchiveFingerprint })).toThrow(/archive/i);

    const accepted = acceptCreatorBaseline({ archive: ownedArchive(), proposal, proposalId: proposal.id, sourceFingerprint: ARCHIVE_FINGERPRINT });
    expect(() => acceptedCreatorBaselineSchema.parse({ ...accepted, acceptedProposalId: randomUUID() })).toThrow(/proposal/i);
    expect(() => acceptedCreatorBaselineSchema.parse({ ...accepted, acceptedSourceArchiveFingerprint: "b".repeat(64) })).toThrow(/fingerprint/i);
  });

  it("snapshots the proposal during acceptance", () => {
    const proposal = baselineProposal();
    const accepted = acceptCreatorBaseline({ archive: ownedArchive(), proposal, proposalId: proposal.id, sourceFingerprint: ARCHIVE_FINGERPRINT });
    proposal.voiceProfile.summary = "mutated";
    proposal.claims[0]!.postIds[0] = "999";

    expect(accepted.proposal.voiceProfile.summary).not.toBe("mutated");
    expect(accepted.proposal.claims[0]!.postIds[0]).toBe("100");
  });
});
