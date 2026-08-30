import type { AnalysisOutput } from "./analysis-schema";
import { rankPostsByVisibleSignal, scorePostByVisibleSignal } from "./performance";
import type { StrategyMemory } from "./strategy-intelligence-schema";
import type { CapturedAccountSnapshot, PostSnapshotInput } from "./types";

export interface GenerationStrategyBrief {
  profile: {
    handle: string;
    bio: string;
    positioning: string;
    audienceSegments: string[];
    followerRead: string;
  };
  performanceSignals: {
    /** Top-quartile posts as mechanisms — never post body copy. */
    topicMechanismWinners: {
      postId: string;
      score: number;
      visibleSignal: string;
      whyItMatters: string;
    }[];
    /** Cadence / opening moves observed on winners (mechanism language only). */
    toneMoves: string[];
    /** Bottom-half posts framed as angles to avoid remixing. */
    antiPatterns: {
      postId: string;
      score: number;
      avoidBecause: string;
    }[];
    workingPatterns: string[];
    blockers: string[];
  };
  strategy: {
    strongestLanes: string[];
    avoidLanes: string[];
    voiceRules: string[];
    proofPoints: string[];
    activeExperiments: string[];
    currentDirection: string | null;
  };
  avoidCorpus: {
    publishedPosts: string[];
    priorDrafts: string[];
  };
}

/** @deprecated Use topicMechanismWinners — kept for older test fixtures naming. */
export type GenerationTopPost = GenerationStrategyBrief["performanceSignals"]["topicMechanismWinners"][number];

interface GenerationStrategyBriefInput {
  snapshot: CapturedAccountSnapshot;
  analysis: AnalysisOutput;
  strategyMemory?: StrategyMemory | null;
  direction?: string | null;
  priorDrafts?: string[];
}

function unique(values: (string | null | undefined)[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    result.push(normalized);
  }
  return result;
}

function truncate(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  const ellipsis = "...";
  const bodyLength = Math.max(0, maxLength - ellipsis.length);
  return `${cleaned.slice(0, bodyLength).trimEnd()}${ellipsis}`;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function followerRead(snapshot: CapturedAccountSnapshot) {
  const followers = snapshot.profile.followersCount;
  const following = snapshot.profile.followingCount;
  const followersText = typeof followers === "number" ? `${followers} followers` : "unknown follower count";
  const followingText = typeof following === "number" ? `${following} following` : "unknown following count";
  return `${followersText} / ${followingText}`;
}

function visibleSignal(post: PostSnapshotInput) {
  return [
    `views=${post.viewsCount ?? "unknown"}`,
    `likes=${post.likesCount ?? "unknown"}`,
    `reposts=${post.repostsCount ?? "unknown"}`,
    `replies=${post.repliesCount ?? "unknown"}`,
    `bookmarks=${post.bookmarksCount ?? "unknown"}`
  ].join(", ");
}

function postAnalysisFor(analysis: AnalysisOutput, postId: string) {
  return analysis.post_analyses.find((item) => item.post_id === postId) ?? null;
}

/** Top quartile by visible signal (at least 1, at most 5). */
export function selectTopQuartilePosts(posts: PostSnapshotInput[]) {
  const ranked = rankPostsByVisibleSignal(posts);
  if (ranked.length === 0) return [];
  const quartileCount = Math.max(1, Math.ceil(ranked.length / 4));
  return ranked.slice(0, Math.min(5, quartileCount));
}

/** Bottom half by visible signal — anti-pattern sources. */
export function selectBottomHalfPosts(posts: PostSnapshotInput[]) {
  const ranked = rankPostsByVisibleSignal(posts);
  if (ranked.length <= 1) return [];
  const start = Math.ceil(ranked.length / 2);
  return ranked.slice(start).slice(-5);
}

function mechanismForWinner(analysis: AnalysisOutput, postId: string, fallbackPattern: string) {
  const postAnalysis = postAnalysisFor(analysis, postId);
  if (postAnalysis?.performance_read) return truncate(postAnalysis.performance_read, 180);
  if (postAnalysis?.likely_reason) return truncate(postAnalysis.likely_reason, 180);
  return truncate(fallbackPattern, 180);
}

function avoidBecause(analysis: AnalysisOutput, postId: string) {
  const postAnalysis = postAnalysisFor(analysis, postId);
  if (postAnalysis?.likely_reason) return truncate(postAnalysis.likely_reason, 160);
  if (postAnalysis?.hook_diagnosis) return truncate(postAnalysis.hook_diagnosis, 160);
  return "Low visible engagement — do not remix this angle or claim.";
}

function toneMovesFromWinners(analysis: AnalysisOutput, winnerIds: string[]) {
  const moves: string[] = [];
  for (const postId of winnerIds) {
    const postAnalysis = postAnalysisFor(analysis, postId);
    if (postAnalysis?.hook_diagnosis) moves.push(truncate(postAnalysis.hook_diagnosis, 120));
    if (postAnalysis?.clarity_diagnosis) moves.push(truncate(postAnalysis.clarity_diagnosis, 120));
  }
  const fromPatterns = [...list(analysis.what_is_working), ...list(analysis.top_patterns)];
  return unique([...moves, ...fromPatterns]).slice(0, 8);
}

export function buildGenerationStrategyBrief(input: GenerationStrategyBriefInput): GenerationStrategyBrief {
  const memory = input.strategyMemory ?? null;
  const workingPatterns = unique([...list(input.analysis.top_patterns), ...list(input.analysis.what_is_working)]);
  const fallbackPattern = workingPatterns[0] ?? "Repeat the strongest observed mechanism, not the post text.";
  const winners = selectTopQuartilePosts(input.snapshot.posts);
  const losers = selectBottomHalfPosts(input.snapshot.posts);
  const winnerIds = winners.map((item) => item.post.xPostId);

  return {
    profile: {
      handle: text(input.snapshot.profile.handle),
      bio: text(input.snapshot.profile.bio),
      positioning: memory?.positioning ?? text(input.analysis.account_positioning_read),
      audienceSegments: unique(memory?.audience_segments ?? []),
      followerRead: followerRead(input.snapshot)
    },
    performanceSignals: {
      topicMechanismWinners: winners.map((item) => ({
        postId: item.post.xPostId,
        score: Number(item.score.toFixed(2)),
        visibleSignal: visibleSignal(item.post),
        whyItMatters: mechanismForWinner(input.analysis, item.post.xPostId, fallbackPattern)
      })),
      toneMoves: toneMovesFromWinners(input.analysis, winnerIds),
      antiPatterns: losers.map((item) => ({
        postId: item.post.xPostId,
        score: Number(item.score.toFixed(2)),
        avoidBecause: avoidBecause(input.analysis, item.post.xPostId)
      })),
      workingPatterns,
      blockers: unique(list(input.analysis.what_is_holding_back))
    },
    strategy: {
      strongestLanes: unique([...(memory?.strongest_lanes ?? []), ...list(input.analysis.recommended_content_pillars)]),
      avoidLanes: unique([...(memory?.weak_lanes ?? []), ...list(input.analysis.what_is_holding_back)]),
      voiceRules: unique(memory?.voice_rules ?? []),
      proofPoints: unique(memory?.proof_points ?? []),
      activeExperiments: unique(
        (memory?.active_experiments ?? [])
          .filter((experiment) => experiment.status !== "retired")
          .map((experiment) => `${experiment.hypothesis} (${experiment.status}): ${experiment.evidence}`)
      ),
      currentDirection: input.direction?.trim() || null
    },
    avoidCorpus: {
      publishedPosts: input.snapshot.posts.map((post) => post.text.trim()).filter(Boolean),
      priorDrafts: unique(input.priorDrafts ?? []).slice(0, 12)
    }
  };
}

/** Model input with no raw post bodies as templates and no audit rewrite / next_post_ideas payloads. */
export function buildSanitizedGenerationModelInput(input: {
  snapshot: CapturedAccountSnapshot;
  analysis: AnalysisOutput;
  generationBrief: GenerationStrategyBrief;
  mode: "today";
}) {
  return {
    mode: input.mode,
    generationBrief: input.generationBrief,
    profile: {
      handle: input.snapshot.profile.handle,
      bio: input.snapshot.profile.bio,
      followersCount: input.snapshot.profile.followersCount,
      followingCount: input.snapshot.profile.followingCount
    },
    postMetrics: input.snapshot.posts.map((post) => ({
      postId: post.xPostId,
      score: Number(scorePostByVisibleSignal(post).toFixed(2)),
      visibleSignal: visibleSignal(post),
      fingerprint: truncate(post.text, 64)
    })),
    analysisMechanisms: {
      executive_summary: input.analysis.executive_summary,
      account_positioning_read: input.analysis.account_positioning_read,
      top_patterns: input.analysis.top_patterns,
      what_is_working: input.analysis.what_is_working,
      what_is_holding_back: input.analysis.what_is_holding_back,
      recommended_content_pillars: input.analysis.recommended_content_pillars,
      post_diagnoses: input.analysis.post_analyses.map((post) => ({
        post_id: post.post_id,
        performance_read: post.performance_read,
        likely_reason: post.likely_reason,
        hook_diagnosis: post.hook_diagnosis,
        clarity_diagnosis: post.clarity_diagnosis,
        audience_fit: post.audience_fit,
        recommended_change: post.recommended_change
      }))
    }
  };
}
