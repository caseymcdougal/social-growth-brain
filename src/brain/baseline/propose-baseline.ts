import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { dirname, resolve } from "node:path";
import { creatorArchiveSchema, creatorBaselineProposalSchema, buildCreatorBaselineProposal, type CreatorArchive, type CreatorBaselineProposal } from "../domain";
import { DEFAULT_OWNED_X_ARCHIVE_PATH } from "../import/local-creator-archive";
import { deriveCreatorBaseline } from "./codex-baseline-runner";
import { DEFAULT_BASELINE_PROPOSAL_PATH, writeLocalBaselineProposal } from "./local-baseline-store";

function validateExistingParents(path: string): void {
  const requested = resolve(dirname(path));
  const absolute = fs.realpathSync.native(requested);
  if (absolute !== requested) throw new Error("Owned X archive parent must not contain symlinks");
}

function readArchiveBytes(path: string): Buffer {
  let fileDescriptor: number | undefined;
  try {
    validateExistingParents(path);
    fileDescriptor = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fileDescriptor);
    if (!stat.isFile()) throw new Error("Owned X archive path must be a regular file");
    return fs.readFileSync(fileDescriptor);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Owned X archive was not found");
    if ((error as NodeJS.ErrnoException).code === "ELOOP") throw new Error("Owned X archive path must not be a symlink");
    throw error;
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
  }
}

function parseOwnedArchive(bytes: Buffer): CreatorArchive {
  const archive = creatorArchiveSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (archive.source !== "x-api-owned-posts") throw new Error("Creator baseline requires an owned X archive");
  if (archive.posts.length === 0) throw new Error("Owned X archive must contain at least one post");
  return archive;
}

function validateDerivedProposal(
  archive: CreatorArchive,
  input: CreatorBaselineProposal
): CreatorBaselineProposal {
  const proposal = creatorBaselineProposalSchema.parse(input);
  const rebuilt = buildCreatorBaselineProposal({
    archive,
    modelOutput: {
      voiceProfile: proposal.voiceProfile,
      strategyMemory: proposal.strategyMemory,
      duplicationGuard: proposal.duplicationGuard,
      claims: proposal.claims,
      largestUncertainty: proposal.largestUncertainty
    },
    id: proposal.id,
    now: () => new Date(proposal.createdAt)
  });
  if (!isDeepStrictEqual(proposal, rebuilt)) {
    throw new Error("Derived proposal does not match the current archive fingerprint or fixed provenance");
  }
  return proposal;
}

export async function proposeCreatorBaseline(input: {
  archivePath?: string;
  proposalPath?: string;
  derive?: typeof deriveCreatorBaseline;
  writeProposal?: typeof writeLocalBaselineProposal;
} = {}): Promise<CreatorBaselineProposal> {
  const archivePath = input.archivePath ?? DEFAULT_OWNED_X_ARCHIVE_PATH;
  const proposalPath = input.proposalPath ?? DEFAULT_BASELINE_PROPOSAL_PATH;
  const beforeBytes = readArchiveBytes(archivePath);
  const beforeHash = createHash("sha256").update(beforeBytes).digest();
  const archive = parseOwnedArchive(beforeBytes);
  const derived = await (input.derive ?? deriveCreatorBaseline)({ archive });
  const afterBytes = readArchiveBytes(archivePath);
  const afterHash = createHash("sha256").update(afterBytes).digest();

  if (
    beforeBytes.length !== afterBytes.length ||
    !timingSafeEqual(beforeBytes, afterBytes) ||
    !timingSafeEqual(beforeHash, afterHash)
  ) {
    throw new Error("Owned X archive changed during baseline analysis");
  }

  const proposal = validateDerivedProposal(archive, derived);
  return (input.writeProposal ?? writeLocalBaselineProposal)(proposalPath, proposal);
}
