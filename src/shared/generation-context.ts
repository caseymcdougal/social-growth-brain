import type { AnalysisOutput } from "./analysis-schema";
import { rankPostsByVisibleSignal } from "./performance";
import type { StrategyMemory } from "./strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "./types";

export interface GenerationStrategyBrief {
  profile: {
    handle: string;
    bio: string;
    positioning: string;
    audienceSegments: string[];
    followerRead: string;
  };
  performanceSignals: {
    topPosts: {
      postId: string;
      score: number;
      visibleSignal: string;
      whyItMatters: string;
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
}

interface GenerationStrategyBriefInput {
  snapshot: CapturedAccountSnapshot;
  analysis: AnalysisOutput;
  strategyMemory?: StrategyMemory | null;
  direction?: string | null;
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
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}...`;
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

function visibleSignal(post: CapturedAccountSnapshot["posts"][number]) {
  return [
    `views=${post.viewsCount ?? "unknown"}`,
    `likes=${post.likesCount ?? "unknown"}`,
    `reposts=${post.repostsCount ?? "unknown"}`,
    `replies=${post.repliesCount ?? "unknown"}`,
    `bookmarks=${post.bookmarksCount ?? "unknown"}`
  ].join(", ");
}

export function buildGenerationStrategyBrief(input: GenerationStrategyBriefInput): GenerationStrategyBrief {
  const memory = input.strategyMemory ?? null;
  return {
    profile: {
      handle: text(input.snapshot.profile.handle),
      bio: text(input.snapshot.profile.bio),
      positioning: memory?.positioning ?? text(input.analysis.account_positioning_read),
      audienceSegments: unique(memory?.audience_segments ?? []),
      followerRead: followerRead(input.snapshot)
    },
    performanceSignals: {
      topPosts: rankPostsByVisibleSignal(input.snapshot.posts)
        .slice(0, 5)
        .map((item) => ({
          postId: item.post.xPostId,
          score: Number(item.score.toFixed(2)),
          visibleSignal: visibleSignal(item.post),
          whyItMatters: truncate(item.post.text, 180)
        })),
      workingPatterns: unique([...list(input.analysis.top_patterns), ...list(input.analysis.what_is_working)]),
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
    }
  };
}
