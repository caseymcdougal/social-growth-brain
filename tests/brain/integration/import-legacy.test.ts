import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { openDatabase } from "../../../src/server/db";
import { createRepositories } from "../../../src/server/repositories";
import { creatorArchiveSchema } from "../../../src/brain/domain";
import { importLegacyCreatorArchive } from "../../../src/brain/import/import-legacy";
import { readLegacyCreatorArchive } from "../../../src/brain/import/legacy-sqlite-reader";
import { runMigrations } from "../../../src/brain/storage/migrations";
import { createPostgresPool } from "../../../src/brain/storage/postgres";
import { PostgresBrainEventStore } from "../../../src/brain/storage/postgres-event-store";
import { assertConnectedTestDatabase, TEST_DATABASE_URL, truncateBrainTables } from "./postgres-test-harness";

let pool: Pool; let store: PostgresBrainEventStore; const dirs: string[] = [];
function legacyFixture() {
  const dir = mkdtempSync(join(tmpdir(), "legacy-import-")); dirs.push(dir); const sqlitePath = join(dir, "legacy.sqlite"); const db = openDatabase(sqlitePath); const repos = createRepositories(db);
  repos.saveCapturedSnapshot({ profile: { handle: "caseymcdougal", displayName: "Casey", bio: "bio", profileUrl: "https://x.com/caseymcdougal", followersCount: 1, followingCount: 2, capturedAt: "2026-08-01T00:00:00.000Z", source: "manual" }, posts: [{ xPostId: "100", url: "https://x.com/caseymcdougal/status/100", text: "A post", postedAt: null, capturedAt: "2026-08-01T00:00:00.000Z", source: "manual", viewsCount: 1, likesCount: 2, repostsCount: 3, repliesCount: 4, bookmarksCount: 5 }] }); db.pragma("journal_mode = DELETE"); db.close(); return sqlitePath;
}
describe("legacy import", () => {
  beforeAll(async () => { pool = createPostgresPool(TEST_DATABASE_URL); await assertConnectedTestDatabase(pool); await runMigrations(pool); store = new PostgresBrainEventStore(pool); });
  beforeEach(async () => { await truncateBrainTables(pool); });
  afterAll(async () => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); await pool.end(); });
  it("has exactly one winner for a truly concurrent first import and sequential reimport", async () => {
    const sqlitePath = legacyFixture(); const before = { bytes: readFileSync(sqlitePath), files: readdirSync(join(sqlitePath, "..")).sort() }; expect(readLegacyCreatorArchive({ sqlitePath }).sourceFingerprint).toBe(readLegacyCreatorArchive({ sqlitePath }).sourceFingerprint);
    const [first, second] = await Promise.all([importLegacyCreatorArchive(store, sqlitePath), importLegacyCreatorArchive(store, sqlitePath)]);
    expect([first.status, second.status].sort()).toEqual(["already-imported", "imported"]); expect(first.sourceFingerprint).toBe(second.sourceFingerprint); expect(first.archiveId).toBe(second.archiveId);
    expect(Number((await pool.query<{ count: string }>("SELECT count(*) FROM brain_creator_archives WHERE source_fingerprint = $1", [first.sourceFingerprint])).rows[0]?.count)).toBe(1);
    const third = await importLegacyCreatorArchive(store, sqlitePath); expect(third.status).toBe("already-imported"); const archive = await store.getCreatorArchiveByFingerprint(first.sourceFingerprint); expect(creatorArchiveSchema.parse(archive)).toMatchObject({ id: first.archiveId }); expect(readFileSync(sqlitePath)).toEqual(before.bytes); expect(readdirSync(join(sqlitePath, "..")).sort()).toEqual(before.files);
  });
});
