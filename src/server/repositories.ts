import type { AppDatabase } from "./db";
import { analysisOutputSchema, type AnalysisOutput } from "../shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../shared/types";

interface StoredProfile {
  id: number;
  handle: string;
  display_name: string;
  bio: string;
  profile_url: string;
  followers_count: number | null;
  following_count: number | null;
  captured_at: string;
  source: "browser" | "manual";
}

interface StoredPost {
  id: number;
  profile_snapshot_id: number;
  x_post_id: string;
  url: string;
  text: string;
  posted_at: string | null;
  views_count: number | null;
  likes_count: number | null;
  reposts_count: number | null;
  replies_count: number | null;
  bookmarks_count: number | null;
  captured_at: string;
  source: "browser" | "manual";
}

interface StoredAnalysisRun {
  id: number;
}

interface StoredStrategyReport {
  executive_summary: string;
  account_positioning_read: string;
  top_patterns_json: string;
  what_is_working_json: string;
  what_is_holding_back_json: string;
  content_pillars_json: string;
  next_post_recommendations_json: string;
}

interface StoredPostAnalysis {
  x_post_id: string;
  performance_read: string;
  likely_reason: string;
  hook_diagnosis: string;
  clarity_diagnosis: string;
  audience_fit: string;
  recommended_change: string;
  rewrite: string;
  variant_hooks_json: string;
}

export function createRepositories(db: AppDatabase) {
  return {
    saveCapturedSnapshot(snapshot: CapturedAccountSnapshot): number {
      const insertProfile = db.prepare(`
        INSERT INTO profile_snapshots
        (handle, display_name, bio, profile_url, followers_count, following_count, captured_at, source)
        VALUES (@handle, @displayName, @bio, @profileUrl, @followersCount, @followingCount, @capturedAt, @source)
      `);
      const insertPost = db.prepare(`
        INSERT INTO post_snapshots
        (profile_snapshot_id, x_post_id, url, text, posted_at, views_count, likes_count, reposts_count, replies_count, bookmarks_count, captured_at, source)
        VALUES (@profileSnapshotId, @xPostId, @url, @text, @postedAt, @viewsCount, @likesCount, @repostsCount, @repliesCount, @bookmarksCount, @capturedAt, @source)
      `);

      const tx = db.transaction(() => {
        const result = insertProfile.run(snapshot.profile);
        const profileSnapshotId = Number(result.lastInsertRowid);
        for (const post of snapshot.posts) {
          insertPost.run({ ...post, profileSnapshotId });
        }
        return profileSnapshotId;
      });

      return tx();
    },

    getLatestSnapshot(): CapturedAccountSnapshot | null {
      const profile = db
        .prepare("SELECT * FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as StoredProfile | undefined;
      if (!profile) return null;

      const posts = db
        .prepare("SELECT * FROM post_snapshots WHERE profile_snapshot_id = ? ORDER BY id ASC")
        .all(profile.id) as StoredPost[];

      return {
        profile: {
          handle: profile.handle,
          displayName: profile.display_name,
          bio: profile.bio,
          profileUrl: profile.profile_url,
          followersCount: profile.followers_count,
          followingCount: profile.following_count,
          capturedAt: profile.captured_at,
          source: profile.source
        },
        posts: posts.map((post) => ({
          xPostId: post.x_post_id,
          url: post.url,
          text: post.text,
          postedAt: post.posted_at,
          viewsCount: post.views_count,
          likesCount: post.likes_count,
          repostsCount: post.reposts_count,
          repliesCount: post.replies_count,
          bookmarksCount: post.bookmarks_count,
          capturedAt: post.captured_at,
          source: post.source
        }))
      };
    },

    saveAnalysis(profileSnapshotId: number, jobDir: string, output: AnalysisOutput): number {
      const startedAt = new Date().toISOString();
      const tx = db.transaction(() => {
        const run = db
          .prepare(`
            INSERT INTO analysis_runs
            (profile_snapshot_id, status, input_post_count, prompt_version, schema_version, started_at, finished_at, job_dir)
            VALUES (?, 'succeeded', ?, 'v1', 'v1', ?, ?, ?)
          `)
          .run(profileSnapshotId, output.post_analyses.length, startedAt, startedAt, jobDir);
        const analysisRunId = Number(run.lastInsertRowid);

        db.prepare(`
          INSERT INTO strategy_reports
          (analysis_run_id, executive_summary, account_positioning_read, top_patterns_json, what_is_working_json, what_is_holding_back_json, content_pillars_json, next_post_recommendations_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          analysisRunId,
          output.executive_summary,
          output.account_positioning_read,
          JSON.stringify(output.top_patterns),
          JSON.stringify(output.what_is_working),
          JSON.stringify(output.what_is_holding_back),
          JSON.stringify(output.recommended_content_pillars),
          JSON.stringify(output.next_post_ideas)
        );

        const insertPostAnalysis = db.prepare(`
          INSERT INTO post_analyses
          (analysis_run_id, x_post_id, performance_read, likely_reason, hook_diagnosis, clarity_diagnosis, audience_fit, recommended_change, rewrite, variant_hooks_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const post of output.post_analyses) {
          insertPostAnalysis.run(
            analysisRunId,
            post.post_id,
            post.performance_read,
            post.likely_reason,
            post.hook_diagnosis,
            post.clarity_diagnosis,
            post.audience_fit,
            post.recommended_change,
            post.rewrite,
            JSON.stringify(post.variant_hooks)
          );
        }

        return analysisRunId;
      });

      return tx();
    },

    getLatestAnalysisForLatestSnapshot(): AnalysisOutput | null {
      const profile = db
        .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (!profile) return null;

      const run = db
        .prepare(
          "SELECT id FROM analysis_runs WHERE profile_snapshot_id = ? AND status = 'succeeded' ORDER BY finished_at DESC, id DESC LIMIT 1"
        )
        .get(profile.id) as StoredAnalysisRun | undefined;
      if (!run) return null;

      const report = db
        .prepare("SELECT * FROM strategy_reports WHERE analysis_run_id = ? LIMIT 1")
        .get(run.id) as StoredStrategyReport | undefined;
      if (!report) return null;

      const postAnalyses = db
        .prepare("SELECT * FROM post_analyses WHERE analysis_run_id = ? ORDER BY id ASC")
        .all(run.id) as StoredPostAnalysis[];

      return analysisOutputSchema.parse({
        executive_summary: report.executive_summary,
        account_positioning_read: report.account_positioning_read,
        top_patterns: JSON.parse(report.top_patterns_json),
        what_is_working: JSON.parse(report.what_is_working_json),
        what_is_holding_back: JSON.parse(report.what_is_holding_back_json),
        recommended_content_pillars: JSON.parse(report.content_pillars_json),
        next_post_ideas: JSON.parse(report.next_post_recommendations_json),
        post_analyses: postAnalyses.map((post) => ({
          post_id: post.x_post_id,
          performance_read: post.performance_read,
          likely_reason: post.likely_reason,
          hook_diagnosis: post.hook_diagnosis,
          clarity_diagnosis: post.clarity_diagnosis,
          audience_fit: post.audience_fit,
          recommended_change: post.recommended_change,
          rewrite: post.rewrite,
          variant_hooks: JSON.parse(post.variant_hooks_json)
        }))
      });
    }
  };
}
