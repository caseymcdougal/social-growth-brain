import type { AnalysisOutput, AnalysisSummary } from "./analysis-schema";
import type { GenerationOutput } from "./generation-schema";
import type { MetricCompletenessSummary, RankedPost } from "./performance";
import type { CapturedAccountSnapshot } from "./types";

export type OpportunityAction = "scan" | "audit" | "generate" | "review-drafts";
export type OpportunityCardKind = "repeat" | "repair" | "evidence";

type OpportunityAnalysis = AnalysisSummary & Partial<Pick<AnalysisOutput, "post_analyses">>;

export interface OpportunityCommand {
  action: OpportunityAction;
  label: string;
  title: string;
  detail: string;
  evidence: string;
}

export interface OpportunityCard {
  kind: OpportunityCardKind;
  label: string;
  title: string;
  detail: string;
  evidence: string;
  postId?: string;
  postUrl?: string;
  score?: number;
}

export interface OpportunityBrief {
  command: OpportunityCommand;
  priorityCards: OpportunityCard[];
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function compactText(text: string, maxLength = 150) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function coverageLabel(metricSummary: MetricCompletenessSummary) {
  return `${Math.round(metricSummary.completenessRatio * 100)}% metric coverage`;
}

function buildCommand({
  snapshot,
  analysis,
  generation,
  metricSummary
}: {
  snapshot: CapturedAccountSnapshot | null;
  analysis: OpportunityAnalysis | null;
  generation: GenerationOutput | null;
  metricSummary: MetricCompletenessSummary;
}): OpportunityCommand {
  if (!snapshot) {
    return {
      action: "scan",
      label: "Next command",
      title: "Scan the public profile",
      detail: "Pull the latest visible X posts into the local cockpit before judging performance.",
      evidence: "No local capture is loaded."
    };
  }

  const postCount = snapshot.posts.length;
  if (!analysis) {
    return {
      action: "audit",
      label: "Next command",
      title: "Run the strategy read",
      detail: `${pluralize(postCount, "captured post")} · ${coverageLabel(metricSummary)}.`,
      evidence: "The cockpit can rank public signal, but diagnosis and drafts need an audit."
    };
  }

  if (!generation) {
    const topPattern = analysis.top_patterns[0] ?? "the strongest observed pattern";
    return {
      action: "generate",
      label: "Next command",
      title: "Generate the next draft set",
      detail: `Use "${topPattern}" as the starting constraint for today's ideas.`,
      evidence: "The audit is ready; the next product move is converting it into copy."
    };
  }

  return {
    action: "review-drafts",
    label: "Next command",
    title: "Review the draft queue",
    detail: `${pluralize(generation.posts.length, "draft")} staged from the latest audit.`,
    evidence: "Pick one angle, copy it out, then confirm against the next scan."
  };
}

function repeatCard(rankedPosts: RankedPost[], analysis: OpportunityAnalysis | null): OpportunityCard | null {
  const top = rankedPosts[0];
  if (!top) return null;
  const postAnalysis = analysis?.post_analyses?.find((item) => item.post_id === top.post.xPostId);
  return {
    kind: "repeat",
    label: `#${top.rank} · score ${Math.round(top.score)}`,
    title: "Repeat the public winner",
    detail: compactText(postAnalysis?.recommended_change ?? top.post.text),
    evidence: postAnalysis?.performance_read ?? "This post has the strongest visible engagement signal in the capture.",
    postId: top.post.xPostId,
    postUrl: top.post.url,
    score: top.score
  };
}

function repairCard(rankedPosts: RankedPost[], analysis: OpportunityAnalysis | null): OpportunityCard | null {
  const postAnalyses = analysis?.post_analyses ?? [];
  if (postAnalyses.length === 0) return null;
  const candidate = [...rankedPosts]
    .reverse()
    .find((rankedPost) => rankedPost.rank > 1 && postAnalyses.some((item) => item.post_id === rankedPost.post.xPostId));
  if (!candidate) return null;
  const postAnalysis = postAnalyses.find((item) => item.post_id === candidate.post.xPostId);
  if (!postAnalysis) return null;

  return {
    kind: "repair",
    label: `#${candidate.rank} · score ${Math.round(candidate.score)}`,
    title: "Rewrite the buried useful post",
    detail: postAnalysis.recommended_change,
    evidence: postAnalysis.likely_reason,
    postId: candidate.post.xPostId,
    postUrl: candidate.post.url,
    score: candidate.score
  };
}

function evidenceCard(metricSummary: MetricCompletenessSummary): OpportunityCard {
  const label =
    metricSummary.totalFields === 0
      ? "No capture"
      : `${metricSummary.capturedFields}/${metricSummary.totalFields} fields`;
  const title =
    metricSummary.completenessRatio >= 0.85
      ? "Trust the current read"
      : metricSummary.completenessRatio >= 0.55
        ? "Use the read, note gaps"
        : "Improve capture quality";

  return {
    kind: "evidence",
    label,
    title,
    detail: `${coverageLabel(metricSummary)} across visible replies, reposts, likes, bookmarks, and views.`,
    evidence:
      metricSummary.totalFields === 0
        ? "Scan or paste a snapshot to create the first evidence base."
        : `${pluralize(metricSummary.postsWithFullMetrics, "post")} with a complete metric set; ${pluralize(metricSummary.missingFields, "field")} missing.`
  };
}

export function buildOpportunityBrief({
  snapshot,
  analysis,
  generation,
  rankedPosts,
  metricSummary
}: {
  snapshot: CapturedAccountSnapshot | null;
  analysis: OpportunityAnalysis | null;
  generation: GenerationOutput | null;
  rankedPosts: RankedPost[];
  metricSummary: MetricCompletenessSummary;
}): OpportunityBrief {
  return {
    command: buildCommand({ snapshot, analysis, generation, metricSummary }),
    priorityCards: [
      repeatCard(rankedPosts, analysis),
      repairCard(rankedPosts, analysis),
      evidenceCard(metricSummary)
    ].filter((card): card is OpportunityCard => Boolean(card))
  };
}

export function formatOpportunityBriefForClipboard(brief: OpportunityBrief) {
  const priorityLines = brief.priorityCards.map(
    (card) => `- ${card.title}: ${card.detail} (${card.evidence})`
  );

  return [
    `Next command: ${brief.command.title}`,
    brief.command.detail,
    brief.command.evidence,
    "",
    "Priorities:",
    ...priorityLines
  ].join("\n");
}
