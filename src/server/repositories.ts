import type { AppDatabase } from "./db";
import { analysisOutputSchema, type AnalysisOutput, type AnalysisSummary } from "../shared/analysis-schema";
import { generationOutputSchema, type GenerationOutput } from "../shared/generation-schema";
import {
  strategyMemoryProposalOutputSchema,
  strategyMemorySchema,
  topicExplorationOutputSchema,
  type StrategyMemory,
  type StrategyMemoryProposalOutput,
  type TopicExplorationOutput
} from "../shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot, CaptureSource } from "../shared/types";
import { voiceProfileSchema, type VoiceProfile } from "../shared/voice-profile";

interface StoredProfile {
  id: number;
  handle: string;
  display_name: string;
  bio: string;
  profile_url: string;
  followers_count: number | null;
  following_count: number | null;
  captured_at: string;
  source: CaptureSource;
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
  source: CaptureSource;
}

interface StoredAnalysisRun {
  id: number;
  profile_snapshot_id: number;
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

interface StoredGeneratedPost {
  title: string;
  angle: string;
  why_this: string;
  hook: string;
  draft: string;
  source_signal: string;
}

interface StoredStrategyMemory {
  id: number;
  memory_json: string;
  created_at: string;
}

interface StoredStrategyMemoryProposal {
  id: number;
  proposed_memory_json: string;
  updates_json: string;
  created_at: string;
}

interface StoredTopicExplorationRun {
  output_json: string;
}

function buildAnalysisOutput(report: StoredStrategyReport, postAnalyses: StoredPostAnalysis[]): AnalysisOutput {
  return analysisOutputSchema.parse({
    ...buildAnalysisSummary(report),
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

function buildAnalysisSummary(report: StoredStrategyReport): AnalysisSummary {
  return {
    executive_summary: report.executive_summary,
    account_positioning_read: report.account_positioning_read,
    top_patterns: JSON.parse(report.top_patterns_json),
    what_is_working: JSON.parse(report.what_is_working_json),
    what_is_holding_back: JSON.parse(report.what_is_holding_back_json),
    recommended_content_pillars: JSON.parse(report.content_pillars_json),
    next_post_ideas: JSON.parse(report.next_post_recommendations_json)
  };
}

function buildCapturedSnapshot(profile: StoredProfile, posts: StoredPost[]): CapturedAccountSnapshot {
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

      return buildCapturedSnapshot(profile, posts);
    },

    getRecentSnapshots(limit = 6): CapturedAccountSnapshot[] {
      const boundedLimit = Math.max(1, Math.min(24, Math.floor(limit)));
      const profiles = db
        .prepare("SELECT * FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT ?")
        .all(boundedLimit) as StoredProfile[];

      const selectPosts = db.prepare("SELECT * FROM post_snapshots WHERE profile_snapshot_id = ? ORDER BY id ASC");
      return profiles.map((profile) => buildCapturedSnapshot(profile, selectPosts.all(profile.id) as StoredPost[]));
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

    getLatestAnalysisRecordForLatestSnapshot(): { profileSnapshotId: number; analysisRunId: number; analysis: AnalysisOutput } | null {
      const profile = db
        .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (!profile) return null;

      const run = db
        .prepare(
          "SELECT id, profile_snapshot_id FROM analysis_runs WHERE profile_snapshot_id = ? AND status = 'succeeded' ORDER BY finished_at DESC, id DESC LIMIT 1"
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

      return {
        profileSnapshotId: run.profile_snapshot_id,
        analysisRunId: run.id,
        analysis: buildAnalysisOutput(report, postAnalyses)
      };
    },

    getLatestAnalysisForLatestSnapshot(): AnalysisOutput | null {
      return this.getLatestAnalysisRecordForLatestSnapshot()?.analysis ?? null;
    },

    // Unlike the method above, this survives a re-scan: it returns the newest successful
    // analysis across ALL snapshots, so a fresh audit can reference the previous one.
    getMostRecentAnalysis(): AnalysisOutput | null {
      const run = db
        .prepare("SELECT id, profile_snapshot_id FROM analysis_runs WHERE status = 'succeeded' ORDER BY finished_at DESC, id DESC LIMIT 1")
        .get() as StoredAnalysisRun | undefined;
      if (!run) return null;

      const report = db
        .prepare("SELECT * FROM strategy_reports WHERE analysis_run_id = ? LIMIT 1")
        .get(run.id) as StoredStrategyReport | undefined;
      if (!report) return null;

      const postAnalyses = db
        .prepare("SELECT * FROM post_analyses WHERE analysis_run_id = ? ORDER BY id ASC")
        .all(run.id) as StoredPostAnalysis[];

      return buildAnalysisOutput(report, postAnalyses);
    },

    getLatestAnalysisSummaryForLatestSnapshot(): AnalysisSummary | null {
      const profile = db
        .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (!profile) return null;

      const run = db
        .prepare(
          "SELECT id FROM analysis_runs WHERE profile_snapshot_id = ? AND status = 'succeeded' ORDER BY finished_at DESC, id DESC LIMIT 1"
        )
        .get(profile.id) as { id: number } | undefined;
      if (!run) return null;

      const report = db
        .prepare("SELECT * FROM strategy_reports WHERE analysis_run_id = ? LIMIT 1")
        .get(run.id) as StoredStrategyReport | undefined;
      return report ? buildAnalysisSummary(report) : null;
    },

    saveGeneration(input: {
      profileSnapshotId: number;
      analysisRunId: number;
      jobDir: string;
      mode: "today";
      output: GenerationOutput;
    }): number {
      const startedAt = new Date().toISOString();
      const tx = db.transaction(() => {
        const run = db
          .prepare(`
            INSERT INTO generation_runs
            (profile_snapshot_id, analysis_run_id, status, mode, started_at, finished_at, job_dir)
            VALUES (?, ?, 'succeeded', ?, ?, ?, ?)
          `)
          .run(input.profileSnapshotId, input.analysisRunId, input.mode, startedAt, startedAt, input.jobDir);
        const generationRunId = Number(run.lastInsertRowid);

        const insertPost = db.prepare(`
          INSERT INTO generated_posts
          (generation_run_id, title, angle, why_this, hook, draft, source_signal)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const post of input.output.posts) {
          insertPost.run(
            generationRunId,
            post.title,
            post.angle,
            post.why_this,
            post.hook,
            post.draft,
            post.source_signal
          );
        }

        return generationRunId;
      });

      return tx();
    },

    getLatestGenerationForLatestSnapshot(): GenerationOutput | null {
      const profile = db
        .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (!profile) return null;

      const run = db
        .prepare(
          "SELECT id FROM generation_runs WHERE profile_snapshot_id = ? AND status = 'succeeded' ORDER BY finished_at DESC, id DESC LIMIT 1"
        )
        .get(profile.id) as { id: number } | undefined;
      if (!run) return null;

      const posts = db
        .prepare("SELECT title, angle, why_this, hook, draft, source_signal FROM generated_posts WHERE generation_run_id = ? ORDER BY id ASC")
        .all(run.id) as StoredGeneratedPost[];

      return generationOutputSchema.parse({ posts });
    },

    /** Recent generated draft texts used as avoid-corpus negatives for the next run. */
    getRecentGeneratedDraftSnippets(limit = 12): string[] {
      const rows = db
        .prepare(
          `
          SELECT hook, draft
          FROM generated_posts
          ORDER BY id DESC
          LIMIT ?
        `
        )
        .all(limit) as Array<{ hook: string; draft: string }>;

      return rows.map((row) => `${row.hook}\n${row.draft}`.trim()).filter(Boolean);
    },

    getLatestStrategyMemory(): { id: number; memory: StrategyMemory; createdAt: string } | null {
      const row = db
        .prepare("SELECT id, memory_json, created_at FROM strategy_memories ORDER BY created_at DESC, id DESC LIMIT 1")
        .get() as StoredStrategyMemory | undefined;
      if (!row) return null;

      return {
        id: row.id,
        memory: strategyMemorySchema.parse(JSON.parse(row.memory_json)),
        createdAt: row.created_at
      };
    },

    getLatestPendingStrategyMemoryProposal():
      | ({ id: number; createdAt: string } & StrategyMemoryProposalOutput)
      | null {
      const profile = db
        .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (!profile) return null;

      const row = db
        .prepare(
          "SELECT id, proposed_memory_json, updates_json, created_at FROM strategy_memory_proposals WHERE profile_snapshot_id = ? AND status = 'pending' ORDER BY created_at DESC, id DESC LIMIT 1"
        )
        .get(profile.id) as StoredStrategyMemoryProposal | undefined;
      if (!row) return null;

      const output = strategyMemoryProposalOutputSchema.parse({
        memory: JSON.parse(row.proposed_memory_json),
        updates: JSON.parse(row.updates_json)
      });

      return {
        id: row.id,
        createdAt: row.created_at,
        ...output
      };
    },

    saveStrategyMemoryProposal(input: {
      profileSnapshotId: number;
      analysisRunId: number;
      jobDir: string;
      output: StrategyMemoryProposalOutput;
    }): number {
      const createdAt = new Date().toISOString();
      const result = db
        .prepare(`
          INSERT INTO strategy_memory_proposals
          (profile_snapshot_id, analysis_run_id, status, proposed_memory_json, updates_json, created_at, job_dir)
          VALUES (?, ?, 'pending', ?, ?, ?, ?)
        `)
        .run(
          input.profileSnapshotId,
          input.analysisRunId,
          JSON.stringify(input.output.memory),
          JSON.stringify(input.output.updates),
          createdAt,
          input.jobDir
        );

      return Number(result.lastInsertRowid);
    },

    applyStrategyMemoryProposal(proposalId: number): { id: number; memory: StrategyMemory; createdAt: string } | null {
      const proposal = db
        .prepare("SELECT id, proposed_memory_json FROM strategy_memory_proposals WHERE id = ? AND status = 'pending' LIMIT 1")
        .get(proposalId) as { id: number; proposed_memory_json: string } | undefined;
      if (!proposal) return null;

      const memory = strategyMemorySchema.parse(JSON.parse(proposal.proposed_memory_json));
      const createdAt = new Date().toISOString();
      const tx = db.transaction(() => {
        const result = db
          .prepare("INSERT INTO strategy_memories (source_proposal_id, memory_json, created_at) VALUES (?, ?, ?)")
          .run(proposal.id, JSON.stringify(memory), createdAt);
        db.prepare("UPDATE strategy_memory_proposals SET status = 'applied', applied_at = ? WHERE id = ?").run(createdAt, proposal.id);

        return Number(result.lastInsertRowid);
      });

      return {
        id: tx(),
        memory,
        createdAt
      };
    },

    saveTopicExploration(input: {
      profileSnapshotId: number;
      analysisRunId: number;
      strategyMemoryId: number | null;
      jobDir: string;
      output: TopicExplorationOutput;
    }): number {
      const startedAt = new Date().toISOString();
      const result = db
        .prepare(`
          INSERT INTO topic_exploration_runs
          (profile_snapshot_id, analysis_run_id, strategy_memory_id, status, output_json, started_at, finished_at, job_dir)
          VALUES (?, ?, ?, 'succeeded', ?, ?, ?, ?)
        `)
        .run(
          input.profileSnapshotId,
          input.analysisRunId,
          input.strategyMemoryId,
          JSON.stringify(input.output),
          startedAt,
          startedAt,
          input.jobDir
        );

      return Number(result.lastInsertRowid);
    },

    getLatestTopicExplorationForLatestSnapshot(): TopicExplorationOutput | null {
      const profile = db
        .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (!profile) return null;

      const row = db
        .prepare(
          "SELECT output_json FROM topic_exploration_runs WHERE profile_snapshot_id = ? AND status = 'succeeded' ORDER BY finished_at DESC, id DESC LIMIT 1"
        )
        .get(profile.id) as StoredTopicExplorationRun | undefined;
      if (!row) return null;

      return topicExplorationOutputSchema.parse(JSON.parse(row.output_json));
    },

    listCreativeDirections(): Array<{ id: number; text: string; updatedAt: string }> {
      return db
        .prepare("SELECT id, text, updated_at as updatedAt FROM creative_direction ORDER BY id DESC")
        .all() as Array<{ id: number; text: string; updatedAt: string }>;
    },

    addCreativeDirection(text: string): { id: number; text: string; updatedAt: string } | null {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const updatedAt = new Date().toISOString();
      const result = db
        .prepare("INSERT INTO creative_direction (text, updated_at) VALUES (?, ?)")
        .run(trimmed, updatedAt);
      return { id: Number(result.lastInsertRowid), text: trimmed, updatedAt };
    },

    deleteCreativeDirection(id: number): void {
      db.prepare("DELETE FROM creative_direction WHERE id = ?").run(id);
    },

    saveVoiceProfile(input: { profileSnapshotId: number; jobDir: string; profile: VoiceProfile }): number {
      const createdAt = new Date().toISOString();
      const result = db
        .prepare("INSERT INTO voice_profiles (profile_snapshot_id, profile_json, created_at, job_dir) VALUES (?, ?, ?, ?)")
        .run(input.profileSnapshotId, JSON.stringify(input.profile), createdAt, input.jobDir);
      return Number(result.lastInsertRowid);
    },

    getLatestVoiceProfile(): { profile: VoiceProfile; derivedAt: string } | null {
      const row = db
        .prepare("SELECT profile_json, created_at FROM voice_profiles ORDER BY created_at DESC, id DESC LIMIT 1")
        .get() as { profile_json: string; created_at: string } | undefined;
      if (!row) return null;
      return { profile: voiceProfileSchema.parse(JSON.parse(row.profile_json)), derivedAt: row.created_at };
    },

    getVoiceOverrides(): string {
      const row = db.prepare("SELECT text FROM voice_overrides WHERE id = 1").get() as { text: string } | undefined;
      return row?.text ?? "";
    },

    setVoiceOverrides(text: string): void {
      db.prepare(
        "INSERT INTO voice_overrides (id, text, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at"
      ).run(text.trim(), new Date().toISOString());
    },

    getCreativeDirection(): { text: string; updatedAt: string } | null {
      // Generation consumes every saved direction as one newline-joined brief.
      const rows = db
        .prepare("SELECT text, updated_at as updatedAt FROM creative_direction ORDER BY id ASC")
        .all() as Array<{ text: string; updatedAt: string }>;
      if (rows.length === 0) return null;
      return {
        text: rows.map((row) => row.text).join("\n"),
        updatedAt: rows.reduce((latest, row) => (row.updatedAt > latest ? row.updatedAt : latest), rows[0].updatedAt)
      };
    }
  };
}
