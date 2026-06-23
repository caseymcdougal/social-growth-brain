import type { VisibleMetrics } from "./types";

export function parseMetricCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)(?:\s*([KMB])\b)?/i);
  if (!match) return null;

  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;

  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : suffix === "B" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseMetricFromLabelText(raw: string | null | undefined, labels: string[]): number | null {
  if (!raw) return null;
  const labelPattern = labels.map(escapeRegExp).join("|");
  const numberPattern = "\\d[\\d,]*(?:\\.\\d+)?\\s*(?:[KMB])?";
  const countBeforeLabel = new RegExp(`(${numberPattern})\\s+(?:${labelPattern})\\b`, "i");
  const labelBeforeCount = new RegExp(`(?:${labelPattern})\\b[^\\d]{0,32}(${numberPattern})`, "i");

  return parseMetricCount(raw.match(countBeforeLabel)?.[1] ?? raw.match(labelBeforeCount)?.[1]);
}

export function parseVisibleMetrics(raw: {
  views?: string | null;
  likes?: string | null;
  reposts?: string | null;
  replies?: string | null;
  bookmarks?: string | null;
}): VisibleMetrics {
  return {
    viewsCount: parseMetricCount(raw.views),
    likesCount: parseMetricCount(raw.likes),
    repostsCount: parseMetricCount(raw.reposts),
    repliesCount: parseMetricCount(raw.replies),
    bookmarksCount: parseMetricCount(raw.bookmarks)
  };
}
