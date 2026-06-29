import type { AnalysisSummary } from "./analysis-schema";
import type { GenerationOutput } from "./generation-schema";
import type { MetricCompletenessSummary } from "./performance";
import type { ScanHistoryBrief } from "./scan-history";
import type { StrategyMemory } from "./strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "./types";

export type CreatorScorecardDimensionKey = "evidence" | "momentum" | "strategy" | "production";
export type CreatorScorecardStatus = "Compounding" | "Operational" | "Needs focus" | "Setup required";

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
      label: "Evidence",
      score: 10,
      statusLabel: "No capture",
      detail: "No public profile capture is loaded.",
      nextAction: "Scan or paste the public profile before trusting any strategic read."
    };
  }

  const percent = coveragePercent(metricSummary);
  const score = percent >= 85 ? 95 : percent >= 55 ? 65 : 35;
  const statusLabel = percent >= 85 ? "Reliable" : percent >= 55 ? "Partial" : "Thin";

  return {
    key: "evidence",
    label: "Evidence",
    score,
    statusLabel,
    detail: `${percent}% metric coverage across ${metricSummary.postsWithAnyMetrics}/${snapshot.posts.length} ranked posts.`,
    nextAction:
      percent >= 85
        ? "Use the current evidence base for ranking and diagnosis."
        : "Improve capture coverage before making fine-grained strategic calls."
  };
}

function buildMomentumDimension(scanHistory: ScanHistoryBrief): CreatorScorecardDimension {
  if (scanHistory.status === "empty") {
    return {
      key: "momentum",
      label: "Momentum",
      score: 15,
      statusLabel: "No trend",
      detail: "No scan history is available yet.",
      nextAction: scanHistory.nextAction
    };
  }

  if (scanHistory.status === "single-scan") {
    return {
      key: "momentum",
      label: "Momentum",
      score: 45,
      statusLabel: "Baseline only",
      detail: "One scan is captured, but movement is not measurable yet.",
      nextAction: scanHistory.nextAction
    };
  }

  if (scanHistory.deltas.medianSignal > 50) {
    return {
      key: "momentum",
      label: "Momentum",
      score: 92,
      statusLabel: "Accelerating",
      detail: `Median visible signal is up by ${scanHistory.deltas.medianSignal} since the previous scan.`,
      nextAction: "Turn the new winner into the next production constraint."
    };
  }

  if (scanHistory.deltas.medianSignal > 0) {
    return {
      key: "momentum",
      label: "Momentum",
      score: 78,
      statusLabel: "Up",
      detail: `Median visible signal is up by ${scanHistory.deltas.medianSignal} since the previous scan.`,
      nextAction: "Keep testing the active lane while the signal is improving."
    };
  }

  if (scanHistory.deltas.medianSignal < 0) {
    return {
      key: "momentum",
      label: "Momentum",
      score: 35,
      statusLabel: "Down",
      detail: `Median visible signal is down by ${Math.abs(scanHistory.deltas.medianSignal)} since the previous scan.`,
      nextAction: "Compare the weaker scan against the last winning post before drafting again."
    };
  }

  return {
    key: "momentum",
    label: "Momentum",
    score: 60,
    statusLabel: "Flat",
    detail: "Median visible signal is flat since the previous scan.",
    nextAction: "Run one sharper experiment before changing the whole strategy."
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
      label: "Strategy",
      score: 88,
      statusLabel: "Instrumented",
      detail: `${pluralize(activeExperimentCount, "active experiment")} connected to accepted strategy memory.`,
      nextAction: "Use scan movement to validate or retire the active hypotheses."
    };
  }

  if (analysis) {
    return {
      key: "strategy",
      label: "Strategy",
      score: 65,
      statusLabel: "Audited",
      detail: "Audit patterns are available, but accepted strategy memory is not applied.",
      nextAction: "Update and apply strategy memory so future reads retain context."
    };
  }

  return {
    key: "strategy",
    label: "Strategy",
    score: 25,
    statusLabel: "Unscored",
    detail: "No strategy audit is available.",
    nextAction: "Run the strategy audit to turn ranked posts into reusable context."
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
      label: "Production",
      score,
      statusLabel: "Drafts ready",
      detail: `${pluralize(generation.posts.length, "draft")} staged for review.`,
      nextAction: "Pick one draft, mark the slot used, and confirm it against the next scan."
    };
  }

  if (analysis) {
    return {
      key: "production",
      label: "Production",
      score: 60,
      statusLabel: "Needs drafts",
      detail: "The audit is ready, but no current draft queue is staged.",
      nextAction: "Generate today's ideas from the strongest pattern."
    };
  }

  return {
    key: "production",
    label: "Production",
    score: 25,
    statusLabel: "Waiting",
    detail: "Draft production starts after the strategy audit.",
    nextAction: "Run the audit before generating or copying drafts."
  };
}

function statusForScore(score: number): CreatorScorecardStatus {
  if (score >= 85) return "Compounding";
  if (score >= 70) return "Operational";
  if (score >= 50) return "Needs focus";
  return "Setup required";
}

function buildSummary(statusLabel: CreatorScorecardStatus, primaryConstraint: CreatorScorecardDimension) {
  if (statusLabel === "Compounding") return "Creator system is compounding; keep the strongest loop active.";
  return `Creator system is ${statusLabel.toLowerCase()}; ${primaryConstraint.label.toLowerCase()} is the constraint.`;
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
    `Primary constraint: ${scorecard.primaryConstraint.label}`,
    `Next: ${scorecard.primaryConstraint.nextAction}`,
    "",
    "Dimensions:",
    ...scorecard.dimensions.map(
      (dimension) =>
        `- ${dimension.label} [${dimension.statusLabel}] ${dimension.score}/100: ${dimension.detail} Next: ${dimension.nextAction}`
    )
  ].join("\n");
}
