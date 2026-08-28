import { describe, expect, it } from "vitest";
import { buildCaseyContext, loadLatestCaseyContext } from "../../../src/brain/profile/casey-context";
import type { CreatorArchive } from "../../../src/brain/domain";

const archive: CreatorArchive = { schemaVersion: 1, id: "00000000-0000-4000-8000-000000000001", creatorId: "casey-mcdougal", source: "legacy-sqlite", consentBasis: "casey-requested-import", consentRecordedAt: "2026-08-28T00:00:00.000Z", sourceFingerprint: "a".repeat(64), importedAt: "2026-08-28T00:00:00.000Z", profile: null, posts: [], voiceProfile: null, voiceOverrides: "", strategyMemory: null, creativeDirections: [], importReport: { importedPosts: 0, omittedFields: [] } };
describe("Casey context", () => {
  it("returns null when no archive exists", async () => expect(await loadLatestCaseyContext({ getLatestCreatorArchive: async () => null } as never)).toBeNull());
  it("maps the archive unchanged and versions it by fingerprint", () => expect(buildCaseyContext(archive)).toMatchObject({ creatorId: "casey-mcdougal", version: archive.sourceFingerprint, archiveId: archive.id, importedAt: archive.importedAt, ownedPosts: archive.posts }));
});
