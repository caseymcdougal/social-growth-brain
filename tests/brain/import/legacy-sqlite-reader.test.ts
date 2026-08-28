import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../../src/server/db";
import { createRepositories } from "../../../src/server/repositories";
import { readLegacyCreatorArchive } from "../../../src/brain/import/legacy-sqlite-reader";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const voice = { summary: "Direct", casing_and_punctuation: ["lowercase"], sentence_rhythm: ["short"], vocabulary: ["build"], hook_moves: ["claim"], banned_moves: ["hype"], style_excerpts: ["Build the useful thing."] };
const strategy = { positioning: "builder", audience_segments: ["builders"], strongest_lanes: ["product"], weak_lanes: ["news"], voice_rules: ["plain"], proof_points: ["shipped"], active_experiments: [{ hypothesis: "direct works", status: "active", evidence: "posts" }] };
function fixture(mixed = false) {
  const dir = mkdtempSync(join(tmpdir(), "legacy-reader-")); dirs.push(dir); const sqlitePath = join(dir, "legacy.sqlite"); const db = openDatabase(sqlitePath); const repos = createRepositories(db);
  const add = (handle: string, at: string, body: string, xPostId = "100") => repos.saveCapturedSnapshot({ profile: { handle, displayName: handle, bio: "bio", profileUrl: `https://x.com/${handle}`, followersCount: 1, followingCount: 2, capturedAt: at, source: "manual" }, posts: [{ xPostId, url: `https://x.com/${handle}/status/${xPostId}`, text: body, postedAt: null, capturedAt: at, source: "manual", viewsCount: 1, likesCount: 2, repostsCount: 3, repliesCount: 4, bookmarksCount: 5 }] });
  add("caseymcdougal", "2026-08-01T00:00:00.000Z", "old"); const caseyNew = add("CaseyMcDougal", "2026-08-02T00:00:00.000Z", "new"); if (mixed) add("someoneelse", "2026-08-03T00:00:00.000Z", "other", "200");
  db.prepare("INSERT INTO voice_profiles (profile_snapshot_id, profile_json, created_at, job_dir) VALUES (?, ?, ?, ?)").run(caseyNew, JSON.stringify(voice), "2026-08-04T00:00:00.000Z", "ignored");
  const analysisId = Number(db.prepare("INSERT INTO analysis_runs (profile_snapshot_id, status, input_post_count, prompt_version, schema_version, started_at, job_dir) VALUES (?, 'succeeded', 0, 'v1', 'v1', ?, 'ignored')").run(caseyNew, "2026-08-04T00:00:00.000Z").lastInsertRowid);
  const proposalId = Number(db.prepare("INSERT INTO strategy_memory_proposals (profile_snapshot_id, analysis_run_id, status, proposed_memory_json, updates_json, created_at, job_dir) VALUES (?, ?, 'applied', ?, '[]', ?, 'ignored')").run(caseyNew, analysisId, JSON.stringify(strategy), "2026-08-04T00:00:00.000Z").lastInsertRowid);
  db.prepare("INSERT INTO strategy_memories (source_proposal_id, memory_json, created_at) VALUES (?, ?, ?)").run(proposalId, JSON.stringify(strategy), "2026-08-05T00:00:00.000Z"); db.prepare("INSERT INTO voice_overrides (id, text, updated_at) VALUES (1, 'keep it sharp', ?)").run("2026-08-05T00:00:00.000Z"); db.prepare("INSERT INTO creative_direction (text, updated_at) VALUES ('write more examples', ?)").run("2026-08-05T00:00:00.000Z"); db.close(); return { sqlitePath };
}
describe("readLegacyCreatorArchive", () => {
  it("imports only Casey-owned latest/deduplicated content without mutating source", () => {
    const { sqlitePath } = fixture(); const before = readFileSync(sqlitePath); const archive = readLegacyCreatorArchive({ sqlitePath, now: () => new Date("2026-08-06T00:00:00.000Z") });
    expect(archive.profile?.displayName).toBe("CaseyMcDougal"); expect(archive.posts).toHaveLength(1); expect(archive.posts[0]?.text).toBe("new"); expect(archive.voiceProfile).toEqual(voice); expect(archive.strategyMemory).toEqual(strategy); expect(archive.voiceOverrides).toBe("keep it sharp"); expect(archive.creativeDirections).toEqual(["write more examples"]); expect(readFileSync(sqlitePath)).toEqual(before);
  });
  it("omits global fields from mixed-creator archives", () => {
    const { sqlitePath } = fixture(true); const archive = readLegacyCreatorArchive({ sqlitePath });
    expect(archive.posts).toHaveLength(1); expect(archive.voiceOverrides).toBe(""); expect(archive.creativeDirections).toEqual([]); expect(archive.importReport.omittedFields).toEqual(expect.arrayContaining([expect.stringContaining("voice overrides"), expect.stringContaining("creative directions")]));
  });
});
