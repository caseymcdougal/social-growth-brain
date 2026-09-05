import { uuidSchema, type AcceptedCreatorBaseline } from "../domain";
import { DEFAULT_OWNED_X_ARCHIVE_PATH, readLocalCreatorArchive } from "../import/local-creator-archive";
import { acceptCreatorBaseline } from "../domain/creator-baseline";
import {
  DEFAULT_ACCEPTED_BASELINE_PATH,
  DEFAULT_BASELINE_PROPOSAL_PATH,
  readLocalBaselineProposal,
  writeLocalAcceptedBaseline
} from "./local-baseline-store";

const USAGE = "Usage: npm run brain:baseline:accept -- --proposal-id <uuid> --source-fingerprint <64 lowercase hex>";
const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/;

export function parseBaselineAcceptArgs(args: readonly string[]): {
  proposalId: string;
  sourceFingerprint: string;
} {
  if (
    args.length !== 4 ||
    args[0] !== "--proposal-id" ||
    args[2] !== "--source-fingerprint" ||
    !args[1] ||
    !args[3]
  ) {
    throw new Error(USAGE);
  }
  const parsedProposalId = uuidSchema.safeParse(args[1]);
  if (!parsedProposalId.success) throw new Error("Proposal ID must be a UUID");
  const proposalId = parsedProposalId.data;
  if (!LOWERCASE_SHA256.test(args[3])) throw new Error("Source fingerprint must be 64 lowercase hexadecimal characters");
  return { proposalId, sourceFingerprint: args[3] };
}

export function acceptLocalCreatorBaseline(input: {
  proposalId: string;
  sourceFingerprint: string;
  archivePath?: string;
  proposalPath?: string;
  acceptedPath?: string;
  now?: () => Date;
}): AcceptedCreatorBaseline {
  const archive = readLocalCreatorArchive(input.archivePath ?? DEFAULT_OWNED_X_ARCHIVE_PATH);
  if (!archive) throw new Error("Owned X archive is unavailable");
  const proposal = readLocalBaselineProposal(input.proposalPath ?? DEFAULT_BASELINE_PROPOSAL_PATH);
  if (!proposal) throw new Error("Creator baseline proposal is unavailable");
  const accepted = acceptCreatorBaseline({
    archive,
    proposal,
    proposalId: input.proposalId,
    sourceFingerprint: input.sourceFingerprint,
    now: input.now
  });
  return writeLocalAcceptedBaseline(input.acceptedPath ?? DEFAULT_ACCEPTED_BASELINE_PATH, accepted);
}
