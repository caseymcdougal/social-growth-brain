import type { AnalysisSummary } from "./analysis-schema";
import type { GenerationOutput } from "./generation-schema";
import type { MetricCompletenessSummary } from "./performance";
import type { ScanHistoryBrief } from "./scan-history";
import type { StrategyMemory } from "./strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "./types";

export type CreatorScorecardDimensionKey = "evidence" | "momentum" | "strategy" | "production";
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
      label: "Post data",
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
    label: "Post data",
    score,
    statusLabel,
    detail: `${percent}% of metrics captured across ${metricSummary.postsWithAnyMetrics}/${snapshot.posts.length} posts.`,
    nextAction:
      percent >= 85
        ? "You have enough data to trust the audit — keep going."
        : "Scan again for fuller metrics before making fine-grained calls."
  };
}

function buildMomentumDimension(scanHistory: ScanHistoryBrief): CreatorScorecardDimension {
  if (scanHistory.status === "empty") {
    return {
      key: "momentum",
      label: "Growth trend",
      score: 15,
      statusLabel: "No trend",
      detail: "No scan history is available yet.",
      nextAction: scanHistory.nextAction
    };
  }

  if (scanHistory.status === "single-scan") {
    return {
      key: "momentum",
      label: "Growth trend",
      score: 45,
      statusLabel: "Baseline only",
      detail: "One scan is captured, but movement is not measurable yet.",
      nextAction: scanHistory.nextAction
    };
  }

  if (scanHistory.deltas.medianSignal > 50) {
    return {
      key: "momentum",
      label: "Growth trend",
      score: 92,
      statusLabel: "Accelerating",
      detail: `Median visible signal is up by ${scanHistory.deltas.medianSignal} since the previous scan.`,
      nextAction: "Turn the new winner into the next production constraint."
    };
  }

  if (scanHistory.deltas.medianSignal > 0) {
    return {
      key: "momentum",
      label: "Growth trend",
      score: 78,
      statusLabel: "Up",
      detail: `Median visible signal is up by ${scanHistory.deltas.medianSignal} since the previous scan.`,
      nextAction: "Keep testing the active lane while the signal is improving."
    };
  }

  if (scanHistory.deltas.medianSignal < 0) {
    return {
      key: "momentum",
      label: "Growth trend",
      score: 35,
      statusLabel: "Down",
      detail: `Median visible signal is down by ${Math.abs(scanHistory.deltas.medianSignal)} since the previous scan.`,
      nextAction: "Compare the weaker scan against the last winning post before drafting again."
    };
  }

  return {
    key: "momentum",
    label: "Growth trend",
    score: 60,
    statusLabel: "Flat",
    detail: "Your posts are getting about the same traction as last scan.",
    nextAction: "Try one sharper post before changing your whole approach."
  };
}

function buildStrategyDimension({
  analysis,
  memory
}: {
  analysis: AnalysisSummary | null;
  memory: StrategyMemory | null;
}): CreatorScorecardDimension {
  const activeExperimentCount = memory?.active_experiments.length ?? 0;
  if (analysis && activeExperimentCount > 0) {
    return {
      key: "strategy",
      label: "Your strategy",
      score: 88,
      statusLabel: "Instrumented",
      detail: `${pluralize(activeExperimentCount, "active experiment")} connected to accepted strategy memory.`,
      nextAction: "Use scan movement to validate or retire the active hypotheses."
    };
  }

  if (analysis) {
    return {
      key: "strategy",
      label: "Your strategy",
      score: 65,
      statusLabel: "Audited",
      detail: "Audit patterns are available, but accepted strategy memory is not applied.",
      nextAction: "Update and apply strategy memory so future reads retain context."
    };
  }

  return {
    key: "strategy",
    label: "Your strategy",
    score: 25,
    statusLabel: "Not yet",
    detail: "No audit yet — we can't spot patterns until you run one.",
    nextAction: "Run the audit to see what's working on your account."
  };
}

function buildProductionDimension({
  analysis,
  generation
}: {
  analysis: AnalysisSummary | null;
  generation: GenerationOutput | null;
}): CreatorScorecardDimension {
  if (generation?.posts.length) {
    const score = generation.posts.length >= 3 ? 86 : 76;
    return {
      key: "production",
      label: "Ready to post",
      score,
      statusLabel: "Drafts ready",
      detail: `${pluralize(generation.posts.length, "draft")} ready to review.`,
      nextAction: "Pick a draft, post it on X, then scan again to see how it did."
    };
  }

  if (analysis) {
    return {
      key: "production",
      label: "Ready to post",
      score: 60,
      statusLabel: "Needs drafts",
      detail: "Your audit is ready, but no drafts yet.",
      nextAction: "Generate draft ideas from what's working."
    };
  }

  return {
    key: "production",
    label: "Ready to post",
    score: 25,
    statusLabel: "Waiting",
    detail: "Drafts come after the audit finds what's working.",
    nextAction: "Run the audit before writing drafts."
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
  return `Your account could grow faster — focus on ${primaryConstraint.label.toLowerCase()} first.`;
}

export function buildCreatorScorecard({
  snapshot,
  analysis,
  generation,
  metricSummary,
  scanHistory,
  memory
}: {
  snapshot: CapturedAccountSnapshot | null;
  analysis: AnalysisSummary | null;
  generation: GenerationOutput | null;
  metricSummary: MetricCompletenessSummary;
  scanHistory: ScanHistoryBrief;
  memory: StrategyMemory | null;
}): CreatorScorecard {
  const dimensions = [
    buildEvidenceDimension({ snapshot, metricSummary }),
    buildMomentumDimension(scanHistory),
    buildStrategyDimension({ analysis, memory }),
    buildProductionDimension({ analysis, generation })
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
