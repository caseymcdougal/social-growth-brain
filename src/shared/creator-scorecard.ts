import type { AnalysisSummary } from "./analysis-schema";
import type { GenerationOutput } from "./generation-schema";
import type { MetricCompletenessSummary } from "./performance";
import type { ScanHistoryBrief } from "./scan-history";
import type { StrategyMemory } from "./strategy-intelligence-schema";
import type { CapturedAccountSnapshot, PostSnapshotInput } from "./types";

export type CreatorScorecardDimensionKey = "profile" | "performance" | "evidence";
export type CreatorScorecardStatus = "Growing strong" | "On track" | "Needs attention" | "Just getting started";

export interface CreatorScorecardDimension {
  key: CreatorScorecardDimensionKey;
  label: string;
  score: number;
  statusLabel: string;
  detail: string;
  nextAction: string;
}

export interface CreatorScorecard {
  overallScore: number;
  statusLabel: CreatorScorecardStatus;
  summary: string;
  primaryConstraint: CreatorScorecardDimension;
  dimensions: CreatorScorecardDimension[];
}

function coveragePercent(metricSummary: MetricCompletenessSummary) {
  return Math.round(metricSummary.completenessRatio * 100);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatNumber(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function statusForDimension(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Promising";
  if (score >= 45) return "Needs attention";
  return "Thin";
}

function buildProfileDimension(snapshot: CapturedAccountSnapshot | null): CreatorScorecardDimension {
  if (!snapshot) {
    return {
      key: "profile",
      label: "Profile quality",
      score: 0,
      statusLabel: "No profile",
      detail: "No live X profile has been loaded yet.",
      nextAction: "Run a scan to check your name, handle, and bio."
    };
  }

  const profile = snapshot.profile;
  const bio = profile.bio.trim();
  const hasName = Boolean(profile.displayName.trim());
  const hasHandle = Boolean(profile.handle.trim());
  const clearBioLength = bio.length >= 50 && bio.length <= 160;
  const explainsWhatYouDo = /\b(build|building|make|making|help|ship|work|for|with)\b/i.test(bio);
  const score =
    (hasName ? 20 : 0) +
    (hasHandle ? 15 : 0) +
    (bio ? 30 : 0) +
    (clearBioLength ? 20 : 0) +
    (explainsWhatYouDo ? 15 : 0);

  if (score >= 85) {
    return {
      key: "profile",
      label: "Profile quality",
      score,
      statusLabel: "Strong",
      detail: "Your name, handle, and bio make your work clear at a glance.",
      nextAction: "Keep the bio outcome-specific when your current focus changes."
    };
  }

  return {
    key: "profile",
    label: "Profile quality",
    score,
    statusLabel: statusForDimension(score),
    detail: bio
      ? "Your profile is present, but the bio can do more to explain what you build and for whom."
      : "Your profile is missing the bio context that tells a new visitor why to follow.",
    nextAction: bio
      ? "Rewrite the bio as: what you build + who it helps + a concrete proof point."
      : "Add a one-sentence bio explaining what you build and who it helps."
  };
}

function actionCount(post: PostSnapshotInput) {
  return (post.likesCount ?? 0) + (post.repostsCount ?? 0) + (post.repliesCount ?? 0) + (post.bookmarksCount ?? 0);
}

function buildRecentPostPerformanceDimension(snapshot: CapturedAccountSnapshot | null): CreatorScorecardDimension {
  const posts = snapshot?.posts ?? [];
  if (!posts.length) {
    return {
      key: "performance",
      label: "Recent-post performance",
      score: 0,
      statusLabel: "No posts",
      detail: "No recent original posts are available to score.",
      nextAction: "Run a scan to pull your recent posts and public metrics."
    };
  }

  const visiblePosts = posts.filter((post) => post.viewsCount !== null);
  const medianViews = median(visiblePosts.map((post) => post.viewsCount ?? 0));
  const totalViews = visiblePosts.reduce((total, post) => total + (post.viewsCount ?? 0), 0);
  const totalActions = posts.reduce((total, post) => total + actionCount(post), 0);
  const actionRate = totalViews > 0 ? (totalActions / totalViews) * 100 : 0;
  const followerCount = snapshot?.profile.followersCount ?? 0;
  const reachRatio = followerCount > 0 ? medianViews / followerCount : 0;
  const reachScore =
    followerCount === 0 ? 50 : reachRatio >= 3 ? 100 : reachRatio >= 1.5 ? 85 : reachRatio >= 0.75 ? 70 : reachRatio >= 0.3 ? 55 : 35;
  const actionScore = actionRate >= 5 ? 95 : actionRate >= 2 ? 80 : actionRate >= 1 ? 65 : actionRate > 0 ? 40 : 20;
  const score = Math.round(reachScore * 0.6 + actionScore * 0.4);
  const detail = `${formatNumber(medianViews)} median views across ${pluralize(posts.length, "recent post")}; ${actionRate.toFixed(1)}% public action rate.`;

  if (actionRate < 1) {
    return {
      key: "performance",
      label: "Recent-post performance",
      score,
      statusLabel: statusForDimension(score),
      detail,
      nextAction: "Keep the next post focused on one sharp claim, then ask for one specific response."
    };
  }

  return {
    key: "performance",
    label: "Recent-post performance",
    score,
    statusLabel: statusForDimension(score),
    detail,
    nextAction: "Repeat the strongest topic and structure, then test one sharper hook."
  };
}

function buildEvidenceDimension({
  snapshot,
  metricSummary
}: {
  snapshot: CapturedAccountSnapshot | null;
  metricSummary: MetricCompletenessSummary;
}): CreatorScorecardDimension {
  if (!snapshot) {
    return {
      key: "evidence",
      label: "How well we can see your posts",
      score: 10,
      statusLabel: "No posts yet",
      detail: "No posts are loaded yet.",
      nextAction: "Scan or paste your X profile so we can see how your posts are doing."
    };
  }

  const percent = coveragePercent(metricSummary);
  const score = percent >= 85 ? 95 : percent >= 55 ? 65 : 35;
  const statusLabel = percent >= 85 ? "Solid" : percent >= 55 ? "Partial" : "Thin";

  return {
    key: "evidence",
    label: "How well we can see your posts",
    score,
    statusLabel,
    detail: `${percent}% of metrics captured across ${metricSummary.postsWithAnyMetrics}/${snapshot.posts.length} posts.`,
    nextAction:
      percent >= 85
        ? "You have enough data to trust the audit — keep going."
        : "Scan again for fuller metrics before making fine-grained calls."
  };
}

function statusForScore(score: number): CreatorScorecardStatus {
  if (score >= 85) return "Growing strong";
  if (score >= 70) return "On track";
  if (score >= 50) return "Needs attention";
  return "Just getting started";
}

function buildSummary(statusLabel: CreatorScorecardStatus, primaryConstraint: CreatorScorecardDimension) {
  if (statusLabel === "Growing strong") return "You're on a good roll — keep doing what's working.";
  if (statusLabel === "Just getting started") {
    return `Start by loading your posts — ${primaryConstraint.label.toLowerCase()} is the first thing to fix.`;
  }
  return `Your audit points to ${primaryConstraint.label.toLowerCase()} as the first thing to improve.`;
}

export function buildCreatorScorecard({
  snapshot,
  metricSummary,
  analysis: _analysis,
  generation: _generation,
  scanHistory: _scanHistory,
  memory: _memory
}: {
  snapshot: CapturedAccountSnapshot | null;
  analysis: AnalysisSummary | null;
  generation: GenerationOutput | null;
  metricSummary: MetricCompletenessSummary;
  scanHistory: ScanHistoryBrief;
  memory: StrategyMemory | null;
}): CreatorScorecard {
  const dimensions = [
    buildProfileDimension(snapshot),
    buildRecentPostPerformanceDimension(snapshot),
    buildEvidenceDimension({ snapshot, metricSummary })
  ];
  const overallScore = Math.round(dimensions.reduce((total, dimension) => total + dimension.score, 0) / dimensions.length);
  const statusLabel = statusForScore(overallScore);
  const primaryConstraint = [...dimensions].sort((left, right) => left.score - right.score)[0] ?? dimensions[0];

  return {
    overallScore,
    statusLabel,
    summary: buildSummary(statusLabel, primaryConstraint),
    primaryConstraint,
    dimensions
  };
}

export function formatCreatorScorecardForClipboard(scorecard: CreatorScorecard) {
  return [
    `Creator scorecard: ${scorecard.overallScore}/100 - ${scorecard.statusLabel}`,
    scorecard.summary,
    `What to fix first: ${scorecard.primaryConstraint.label}`,
    `Next: ${scorecard.primaryConstraint.nextAction}`,
    "",
    "Dimensions:",
    ...scorecard.dimensions.map(
      (dimension) =>
        `- ${dimension.label} [${dimension.statusLabel}] ${dimension.score}/100: ${dimension.detail} Next: ${dimension.nextAction}`
    )
  ].join("\n");
}
