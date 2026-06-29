import { scorePostByVisibleSignal } from "./performance";
import type { PostProductionPlan, ProductionPlanSlot } from "./post-production-plan";
import { getSlotWorkflowStatus, type ProductionWorkflowState } from "./production-workflow";
import type { PostSnapshotInput, VisibleMetrics } from "./types";

export type ProductionOutcomeStatus = "matched" | "awaiting-scan";

export interface ProductionOutcomeEntry {
  slotId: string;
  slotTitle: string;
  status: ProductionOutcomeStatus;
  label: string;
  detail: string;
  postUrl: string | null;
  metricsLabel: string;
  visibleScore: number | null;
}

export interface ProductionOutcomeLoop {
  summary: string;
  nextAction: string;
  usedCount: number;
  matchedCount: number;
  awaitingScanCount: number;
  entries: ProductionOutcomeEntry[];
}

const numberFormatter = new Intl.NumberFormat("en-US");
const stopWords = new Set([
  "about",
  "after",
  "again",
  "because",
  "before",
  "being",
  "between",
  "does",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "most",
  "that",
  "than",
  "their",
  "then",
  "there",
  "they",
  "this",
  "when",
  "with",
  "would",
  "your"
]);

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function formatMetric(value: number | null, singular: string, plural = `${singular}s`) {
  if (value === null) return null;
  return `${numberFormatter.format(value)} ${pluralize(value, singular, plural)}`;
}

export function formatProductionOutcomeMetrics(metrics: VisibleMetrics) {
  return [
    formatMetric(metrics.viewsCount, "view"),
    formatMetric(metrics.likesCount, "like"),
    formatMetric(metrics.repliesCount, "reply", "replies"),
    formatMetric(metrics.repostsCount, "repost"),
    formatMetric(metrics.bookmarksCount, "bookmark")
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function textMatchScore(slot: ProductionPlanSlot, post: PostSnapshotInput) {
  const normalizedPost = normalizeText(post.text);
  const normalizedDraft = normalizeText(slot.draft);
  const normalizedHook = normalizeText(slot.hook);
  if (normalizedDraft.length > 24 && normalizedPost.includes(normalizedDraft)) return 1;
  if (normalizedHook.length > 24 && normalizedPost.includes(normalizedHook)) return 0.86;

  const slotTokens = new Set(tokenize(`${slot.hook} ${slot.draft}`));
  const postTokens = new Set(tokenize(post.text));
  if (slotTokens.size === 0 || postTokens.size === 0) return 0;

  const overlapCount = [...slotTokens].filter((token) => postTokens.has(token)).length;
  if (overlapCount < 5) return 0;
  return overlapCount / slotTokens.size;
}

function findBestMatchingPost(slot: ProductionPlanSlot, capturedPosts: PostSnapshotInput[]) {
  return capturedPosts
    .map((post) => ({ post, matchScore: textMatchScore(slot, post) }))
    .filter((match) => match.matchScore >= 0.55)
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore ||
        scorePostByVisibleSignal(right.post) - scorePostByVisibleSignal(left.post) ||
        (right.post.postedAt ?? "").localeCompare(left.post.postedAt ?? "")
    )[0]?.post ?? null;
}

function buildEntry(slot: ProductionPlanSlot, capturedPosts: PostSnapshotInput[]): ProductionOutcomeEntry {
  const matchedPost = findBestMatchingPost(slot, capturedPosts);
  if (!matchedPost) {
    return {
      slotId: slot.id,
      slotTitle: slot.title,
      status: "awaiting-scan",
      label: "Awaiting next scan",
      detail: "No captured post matches this used draft yet.",
      postUrl: null,
      metricsLabel: "Scan public metrics after posting",
      visibleScore: null
    };
  }

  const metricsLabel = formatProductionOutcomeMetrics(matchedPost);
  return {
    slotId: slot.id,
    slotTitle: slot.title,
    status: "matched",
    label: "Matched captured post",
    detail: "Latest scan contains a post that matches this used draft.",
    postUrl: matchedPost.url,
    metricsLabel: metricsLabel || "No visible metrics captured yet",
    visibleScore: scorePostByVisibleSignal(matchedPost)
  };
}

function buildSummary(usedCount: number, matchedCount: number, awaitingScanCount: number) {
  if (usedCount === 0) return "No used slots yet.";
  if (matchedCount === usedCount) {
    return `${usedCount} used ${pluralize(usedCount, "slot")} matched in the latest scan.`;
  }
  if (matchedCount > 0) {
    return `${matchedCount} matched, ${awaitingScanCount} awaiting a matching scan.`;
  }
  return `${awaitingScanCount} used ${pluralize(awaitingScanCount, "slot")} awaiting a matching scan.`;
}

function buildNextAction(usedCount: number, awaitingScanCount: number) {
  if (usedCount === 0) {
    return "Plan a slot, mark it used after posting, then scan public metrics to measure the result.";
  }
  if (awaitingScanCount > 0) {
    return "Run Scan public metrics after the post is live, then this loop will attach visible outcomes.";
  }
  return "Compare the matched outcome against readiness before choosing the next draft.";
}

export function buildProductionOutcomeLoop({
  productionPlan,
  workflowState,
  capturedPosts
}: {
  productionPlan: PostProductionPlan;
  workflowState: ProductionWorkflowState;
  capturedPosts: PostSnapshotInput[];
}): ProductionOutcomeLoop {
  const usedSlots = productionPlan.slots.filter((slot) => getSlotWorkflowStatus(workflowState, slot.id) === "used");
  const entries = usedSlots.map((slot) => buildEntry(slot, capturedPosts));
  const matchedCount = entries.filter((entry) => entry.status === "matched").length;
  const awaitingScanCount = entries.filter((entry) => entry.status === "awaiting-scan").length;

  return {
    summary: buildSummary(usedSlots.length, matchedCount, awaitingScanCount),
    nextAction: buildNextAction(usedSlots.length, awaitingScanCount),
    usedCount: usedSlots.length,
    matchedCount,
    awaitingScanCount,
    entries
  };
}
