import fixture from "../../replay/fixtures/synthetic-replay.json";
import originalFixture from "../../replay/fixtures/synthetic-original-replay.json";
import quoteFixture from "../../replay/fixtures/synthetic-quote-replay.json";
import { DEFAULT_OWNED_X_ARCHIVE_PATH, readLocalCreatorArchive } from "../../import/local-creator-archive";
import { DEFAULT_ACCEPTED_BASELINE_PATH, DEFAULT_BASELINE_PROPOSAL_PATH, readLocalAcceptedBaseline, readLocalBaselineProposal } from "../../baseline/local-baseline-store";
import { BrainQueryService } from "../../query/brain-query-service";
import { runReplay } from "../../replay/replay-runner";
import { replayFixtureSchema } from "../../replay/replay-schema";
import { InMemoryBrainEventStore } from "../../storage/in-memory-event-store";
import { createReadOnlyMcpServer } from "./create-server";

export interface CreateLocalMcpServerOptions {
  readonly archivePath?: string | null;
  readonly proposalPath?: string | null;
  readonly acceptedBaselinePath?: string | null;
}

export async function createLocalMcpServer(options: CreateLocalMcpServerOptions = {}) {
  const store = new InMemoryBrainEventStore();
  for (const replay of [fixture, quoteFixture, originalFixture]) {
    await runReplay(store, replayFixtureSchema.parse(replay));
  }

  const archivePath = options.archivePath === undefined ? DEFAULT_OWNED_X_ARCHIVE_PATH : options.archivePath;
  const archive = archivePath === null ? null : readLocalCreatorArchive(archivePath);
  if (archive) await store.appendCreatorArchive(archive);

  const proposalPath = options.proposalPath === undefined ? DEFAULT_BASELINE_PROPOSAL_PATH : options.proposalPath;
  const acceptedBaselinePath = options.acceptedBaselinePath === undefined ? DEFAULT_ACCEPTED_BASELINE_PATH : options.acceptedBaselinePath;
  const proposal = proposalPath === null ? null : readLocalBaselineProposal(proposalPath);
  const accepted = acceptedBaselinePath === null ? null : readLocalAcceptedBaseline(acceptedBaselinePath);

  return createReadOnlyMcpServer(new BrainQueryService(store, {
    mode: "synthetic",
    databaseUrl: "postgresql://social_brain:social_brain@127.0.0.1:54329/social_brain_test"
  }, {
    currentArchiveFingerprint: archive?.sourceFingerprint ?? null,
    proposal,
    accepted
  }));
}
