import type { AnalysisOutput } from "./analysis-schema";
import type { RankedPost } from "./performance";

export type PostAnalysis = AnalysisOutput["post_analyses"][number];

export interface SelectedPostLabBrief {
  postId: string;
  postUrl: string;
  rankLabel: string;
  primaryAction: "Rewrite selected post" | "Use as source post";
  sourceText: string;
  performanceRead: string;
  recommendation: string;
  rewrite: string | null;
  variantHooks: string[];
}

function compactScore(score: number) {
  return Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(score);
}

export function buildSelectedPostLabBrief({
  rankedPost,
  postAnalysis
}: {
  rankedPost: RankedPost;
  postAnalysis: PostAnalysis | null;
}): SelectedPostLabBrief {
  return {
    postId: rankedPost.post.xPostId,
    postUrl: rankedPost.post.url,
    rankLabel: `#${rankedPost.rank} · score ${compactScore(rankedPost.score)}`,
    primaryAction: postAnalysis ? "Rewrite selected post" : "Use as source post",
    sourceText: rankedPost.post.text,
    performanceRead: postAnalysis?.performance_read ?? "This post is selected from the visible-signal ranking.",
    recommendation: postAnalysis?.recommended_change ?? "Run or load the full audit to unlock rewrite guidance.",
    rewrite: postAnalysis?.rewrite ?? null,
    variantHooks: postAnalysis?.variant_hooks ?? []
  };
}

export function formatSelectedPostLabBriefForClipboard(brief: SelectedPostLabBrief) {
  return [
    `Selected post: ${brief.rankLabel}`,
    brief.sourceText,
    "",
    `Performance read: ${brief.performanceRead}`,
    `Recommendation: ${brief.recommendation}`,
    brief.rewrite ? `Rewrite: ${brief.rewrite}` : null,
    brief.variantHooks.length ? `Variant hooks: ${brief.variantHooks.join(" | ")}` : null,
    "",
    `Source: ${brief.postUrl}`
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
