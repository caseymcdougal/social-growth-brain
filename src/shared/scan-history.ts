import { rankPostsByVisibleSignal, scorePostByVisibleSignal, summarizeMetricCompleteness } from "./performance";
import type { CapturedAccountSnapshot } from "./types";

export type ScanHistoryStatus = "empty" | "single-scan" | "ready";
export type TopPostShiftStatus = "none" | "same-top-post" | "new-top-post";

export interface ScanHistorySnapshotSummary {
  capturedAt: string | null;
  postCount: number;
  followersCount: number | null;
  medianSignal: number;
  topPostText: string;
  metricCoveragePercent: number;
}

export interface ScanHistoryDeltas {
  medianSignal: number;
  followers: number | null;
  postCount: number;
}

export interface ScanHistoryTopPostShift {
  status: TopPostShiftStatus;
  label: string;
  currentTitle: string;
  previousTitle: string | null;
}

export interface ScanHistoryBrief {
  status: ScanHistoryStatus;
  summary: string;
  nextAction: string;
  current: ScanHistorySnapshotSummary;
  previous: ScanHistorySnapshotSummary | null;
  deltas: ScanHistoryDeltas;
  topPostShift: ScanHistoryTopPostShift;
  entries: ScanHistorySnapshotSummary[];
}

function compactPostText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 92) return normalized;
  return `${normalized.slice(0, 89).trim()}...`;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function summarizeSnapshot(snapshot: CapturedAccountSnapshot): ScanHistorySnapshotSummary {
  const rankedPosts = rankPostsByVisibleSignal(snapshot.posts);
  const metricSummary = summarizeMetricCompleteness(snapshot.posts);
  return {
    capturedAt: snapshot.profile.capturedAt,
    postCount: snapshot.posts.length,
    followersCount: snapshot.profile.followersCount,
    medianSignal: Math.round(median(snapshot.posts.map((post) => scorePostByVisibleSignal(post)))),
    topPostText: rankedPosts[0] ? compactPostText(rankedPosts[0].post.text) : "No posts captured",
    metricCoveragePercent: Math.round(metricSummary.completenessRatio * 100)
  };
}

function rawMedianSignal(snapshot: CapturedAccountSnapshot | undefined) {
  if (!snapshot) return 0;
  return median(snapshot.posts.map((post) => scorePostByVisibleSignal(post)));
}

function emptySummary(): ScanHistorySnapshotSummary {
  return {
    capturedAt: null,
    postCount: 0,
    followersCount: null,
    medianSignal: 0,
    topPostText: "Awaiting scan",
    metricCoveragePercent: 0
  };
}

function sortSnapshots(snapshots: CapturedAccountSnapshot[]) {
  return [...snapshots].sort(
    (left, right) =>
      right.profile.capturedAt.localeCompare(left.profile.capturedAt) ||
      right.posts.length - left.posts.length
  );
}

function signed(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function direction(delta: number) {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function buildSummary(delta: number) {
  const trend = direction(delta);
  if (trend === "flat") return "Median visible signal flat since previous scan.";
  return `Median visible signal ${trend} by ${Math.abs(delta)} since previous scan.`;
}

function buildTopPostShift(snapshots: CapturedAccountSnapshot[]): ScanHistoryTopPostShift {
  const currentTop = rankPostsByVisibleSignal(snapshots[0]?.posts ?? [])[0]?.post ?? null;
  const previousTop = rankPostsByVisibleSignal(snapshots[1]?.posts ?? [])[0]?.post ?? null;
  if (!currentTop) {
    return {
      status: "none",
      label: "No top post yet",
      currentTitle: "Awaiting scan",
      previousTitle: null
    };
  }
  if (!previousTop) {
    return {
      status: "none",
      label: "First scan baseline",
      currentTitle: compactPostText(currentTop.text),
      previousTitle: null
    };
  }
  if (currentTop.xPostId === previousTop.xPostId) {
    return {
      status: "same-top-post",
      label: "Top post still leads",
      currentTitle: compactPostText(currentTop.text),
      previousTitle: compactPostText(previousTop.text)
    };
  }
  return {
    status: "new-top-post",
    label: "New top post took over",
    currentTitle: compactPostText(currentTop.text),
    previousTitle: compactPostText(previousTop.text)
  };
}

function buildNextAction({
  status,
  medianDelta,
  topPostShift
}: {
  status: ScanHistoryStatus;
  medianDelta: number;
  topPostShift: ScanHistoryTopPostShift;
}) {
  if (status === "empty") return "Capture public metrics to create the first trend baseline.";
  if (status === "single-scan") return "Run another public scan after the next posting cycle to unlock deltas.";
  if (topPostShift.status === "new-top-post" && medianDelta > 0) {
    return "Double down on the new winner, then scan again after the next post lands.";
  }
  if (medianDelta < 0) return "Inspect what changed in the weaker scan before generating the next draft set.";
  return "Use the trendline as a baseline while testing the next production slot.";
}

export function buildScanHistoryBrief(snapshots: CapturedAccountSnapshot[]): ScanHistoryBrief {
  const sortedSnapshots = sortSnapshots(snapshots);
  const entries = sortedSnapshots.map(summarizeSnapshot);
  const current = entries[0] ?? emptySummary();
  const previous = entries[1] ?? null;
  const medianSignalDelta = previous ? Math.round(rawMedianSignal(sortedSnapshots[0]) - rawMedianSignal(sortedSnapshots[1])) : 0;
  const followersDelta =
    previous && current.followersCount !== null && previous.followersCount !== null
      ? current.followersCount - previous.followersCount
      : null;
  const postCountDelta = previous ? current.postCount - previous.postCount : 0;
  const status: ScanHistoryStatus = entries.length === 0 ? "empty" : entries.length === 1 ? "single-scan" : "ready";
  const topPostShift = buildTopPostShift(sortedSnapshots);

  return {
    status,
    summary:
      status === "empty"
        ? "No scans captured yet."
        : status === "single-scan"
          ? "One scan captured. Trendline starts after the next scan."
          : buildSummary(medianSignalDelta),
    nextAction: buildNextAction({ status, medianDelta: medianSignalDelta, topPostShift }),
    current,
    previous,
    deltas: {
      medianSignal: medianSignalDelta,
      followers: followersDelta,
      postCount: postCountDelta
    },
    topPostShift,
    entries
  };
}

export function formatScanHistoryDelta(value: number | null) {
  if (value === null) return "n/a";
  return signed(value);
}
