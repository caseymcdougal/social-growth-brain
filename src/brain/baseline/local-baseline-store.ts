import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import type { z } from "zod";
import {
  acceptedCreatorBaselineSchema,
  creatorBaselineProposalSchema,
  type AcceptedCreatorBaseline,
  type CreatorBaselineProposal
} from "../domain/creator-baseline";

export const DEFAULT_BASELINE_PROPOSAL_PATH = resolve("data/social-brain/casey-baseline-proposal.json");
export const DEFAULT_ACCEPTED_BASELINE_PATH = resolve("data/social-brain/casey-baseline.json");

function assertRegularFinalPath(path: string): void {
  try {
    const stat = fs.lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("Baseline record path must not be a symlink");
    if (!stat.isFile()) throw new Error("Baseline record path must be a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function visitParentSegments(parent: string, onMissing: (path: string) => void): void {
  const absolute = resolve(parent);
  const segments = absolute.split("/");
  let current = segments[0] === "" ? "/" : segments.shift()!;

  for (const segment of segments) {
    if (!segment) continue;
    current = current === "/" ? `/${segment}` : `${current}/${segment}`;
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error("Baseline record parent must not contain symlinks");
      if (!stat.isDirectory()) throw new Error("Baseline record parent must contain only directories");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      onMissing(current);
    }
  }
}

function ensurePrivateParent(parent: string): void {
  const absolute = resolve(parent);
  visitParentSegments(absolute, (path) => {
    fs.mkdirSync(path, { mode: 0o700 });
    const created = fs.lstatSync(path);
    if (!created.isDirectory() || created.isSymbolicLink()) {
      throw new Error("Baseline record parent must be a real directory");
    }
    fs.chmodSync(path, 0o700);
  });

  const finalParent = fs.lstatSync(absolute);
  if (finalParent.isSymbolicLink() || !finalParent.isDirectory()) {
    throw new Error("Baseline record parent must be a real directory");
  }
  fs.chmodSync(absolute, 0o700);
}

function validateExistingParent(parent: string): void {
  let missing = false;
  visitParentSegments(parent, () => {
    missing = true;
  });
  if (missing) return;
}

function readPrivateRecord<T>(path: string, schema: z.ZodType<T>): T | null {
  let fileDescriptor: number | undefined;
  try {
    validateExistingParent(dirname(path));
    fileDescriptor = fs.openSync(
      path,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    const stat = fs.fstatSync(fileDescriptor);
    if (!stat.isFile()) throw new Error("Baseline record path must be a regular file");
    return schema.parse(JSON.parse(fs.readFileSync(fileDescriptor, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      throw new Error("Baseline record path must not be a symlink");
    }
    throw error;
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
  }
}

function writePrivateRecord<T>(path: string, input: T, schema: z.ZodType<T>): T {
  const record = schema.parse(input);
  ensurePrivateParent(dirname(path));
  assertRegularFinalPath(path);

  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let fileDescriptor: number | undefined;
  let temporaryCreated = false;
  try {
    fileDescriptor = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600
    );
    temporaryCreated = true;
    fs.fchmodSync(fileDescriptor, 0o600);
    fs.writeFileSync(fileDescriptor, JSON.stringify(record));
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(temporaryPath, path);
    return record;
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {}
    }
    if (temporaryCreated) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw error;
  }
}

export function readLocalBaselineProposal(
  path = DEFAULT_BASELINE_PROPOSAL_PATH
): CreatorBaselineProposal | null {
  return readPrivateRecord(path, creatorBaselineProposalSchema);
}

export function writeLocalBaselineProposal(
  path: string,
  input: CreatorBaselineProposal
): CreatorBaselineProposal {
  return writePrivateRecord(path, input, creatorBaselineProposalSchema);
}

export function readLocalAcceptedBaseline(
  path = DEFAULT_ACCEPTED_BASELINE_PATH
): AcceptedCreatorBaseline | null {
  return readPrivateRecord(path, acceptedCreatorBaselineSchema);
}

export function writeLocalAcceptedBaseline(
  path: string,
  input: AcceptedCreatorBaseline
): AcceptedCreatorBaseline {
  return writePrivateRecord(path, input, acceptedCreatorBaselineSchema);
}
