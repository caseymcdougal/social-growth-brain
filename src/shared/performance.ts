import type { PostSnapshotInput, VisibleMetrics } from "./types";

const metricKeys: (keyof VisibleMetrics)[] = [
  "viewsCount",
  "likesCount",
  "repostsCount",
  "repliesCount",
  "bookmarksCount"
];

export interface MetricCompletenessSummary {
  capturedFields: number;
  totalFields: number;
  missingFields: number;
  completenessRatio: number;
  postsWithAnyMetrics: number;
  postsWithFullMetrics: number;
}

export interface RankedPost {
  post: PostSnapshotInput;
  rank: number;
  score: number;
}

function metricValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function scorePostByVisibleSignal(post: VisibleMetrics) {
  return (
    metricValue(post.viewsCount) * 0.01 +
    metricValue(post.likesCount) * 2 +
    metricValue(post.repostsCount) * 5 +
    metricValue(post.repliesCount) * 4 +
    metricValue(post.bookmarksCount) * 3
  );
}

export function rankPostsByVisibleSignal(posts: PostSnapshotInput[]): RankedPost[] {
  return posts
    .map((post) => ({ post, score: scorePostByVisibleSignal(post) }))
    .sort((a, b) => b.score - a.score || (b.post.postedAt ?? "").localeCompare(a.post.postedAt ?? ""))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function summarizeMetricCompleteness(posts: PostSnapshotInput[]): MetricCompletenessSummary {
  const totalFields = posts.length * metricKeys.length;
  let capturedFields = 0;
  let postsWithAnyMetrics = 0;
  let postsWithFullMetrics = 0;

  for (const post of posts) {
    const present = metricKeys.filter((key) => post[key] !== null).length;
    capturedFields += present;
    if (present > 0) postsWithAnyMetrics += 1;
    if (present === metricKeys.length) postsWithFullMetrics += 1;
  }

  return {
    capturedFields,
    totalFields,
    missingFields: totalFields - capturedFields,
    completenessRatio: totalFields === 0 ? 0 : capturedFields / totalFields,
    postsWithAnyMetrics,
    postsWithFullMetrics
  };
}
