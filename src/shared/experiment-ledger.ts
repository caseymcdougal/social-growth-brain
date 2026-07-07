import type { AnalysisSummary } from "./analysis-schema";
import { formatScanHistoryDelta, type ScanHistoryBrief } from "./scan-history";
import type { StrategyMemory } from "./strategy-intelligence-schema";

export type ExperimentLedgerItemStatus = "winning" | "needs-review" | "needs-scan" | "no-signal";
export type ExperimentLedgerSource = "memory" | "pattern";

export interface ExperimentLedgerItem {
  id: string;
  hypothesis: string;
  source: ExperimentLedgerSource;
  sourceLabel: string;
  status: ExperimentLedgerItemStatus;
  statusLabel: string;
  trendLabel: string;
  evidence: string;
  nextAction: string;
}

export interface ExperimentLedger {
  summary: string;
  statusLabel: string;
  items: ExperimentLedgerItem[];
}

interface ExperimentCandidate {
  id: string;
  hypothesis: string;
  source: ExperimentLedgerSource;
  sourceLabel: string;
  evidence: string;
}

function titleCaseStatus(status: string) {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function experimentsFromMemory(memory: StrategyMemory | null): ExperimentCandidate[] {
  if (!memory) return [];
  return memory.active_experiments.map((experiment, index) => ({
    id: `memory-${index}`,
    hypothesis: experiment.hypothesis,
    source: "memory",
    sourceLabel: `${titleCaseStatus(experiment.status)} experiment`,
    evidence: experiment.evidence
  }));
}

function experimentsFromAnalysis(analysis: AnalysisSummary | null): ExperimentCandidate[] {
  if (!analysis) return [];
  // Watch what's working, not raw top_patterns — the latter can carry a "posts got 0 likes"
  // observation, which reads as nonsense once prefixed with "Repeat:".
  const wins = analysis.what_is_working.length > 0 ? analysis.what_is_working : analysis.top_patterns;
  return wins.slice(0, 2).map((pattern, index) => ({
    id: `pattern-${index}`,
    hypothesis: `Repeat: ${pattern}`,
    source: "pattern",
    sourceLabel: "Pattern watch",
    evidence: "From what the audit says is working."
  }));
}

function buildItemStatus(scanHistory: ScanHistoryBrief) {
  if (scanHistory.status !== "ready") {
    return {
      status: "needs-scan" as const,
      statusLabel: "Needs scan",
      trendLabel: scanHistory.status === "single-scan" ? "Waiting for second scan" : "Waiting for first scan",
      nextAction: scanHistory.nextAction
    };
  }

  if (scanHistory.deltas.medianSignal > 0) {
    return {
      status: "winning" as const,
      statusLabel: "Winning",
      trendLabel: `${formatScanHistoryDelta(scanHistory.deltas.medianSignal)} median signal`,
      nextAction: "Turn the validated premise into the next production slot, then rescan after it lands."
    };
  }

  if (scanHistory.deltas.medianSignal < 0) {
    return {
      status: "needs-review" as const,
      statusLabel: "Needs review",
      trendLabel: `${formatScanHistoryDelta(scanHistory.deltas.medianSignal)} median signal`,
      nextAction: "Compare the weaker scan against this hypothesis before drafting the next slot."
    };
  }

  return {
    status: "no-signal" as const,
    statusLabel: "No signal yet",
    trendLabel: "0 median signal",
    nextAction: "Keep the test live for one more posting cycle, then rescan."
  };
}

function pluralize(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

function buildSummary({ items, memory }: { items: ExperimentLedgerItem[]; memory: StrategyMemory | null }) {
  if (items.length === 0) return "Run an audit or apply strategy memory to start tracking experiments.";
  if (!memory && items.some((item) => item.source === "pattern")) {
    return "Pattern watch created from the latest audit until strategy memory is applied.";
  }
  if (items.some((item) => item.status === "needs-scan")) {
    return "Experiment ledger needs another scan before validation.";
  }

  const winningCount = items.filter((item) => item.status === "winning").length;
  if (winningCount > 0) {
    return `${winningCount} ${pluralize(winningCount, "experiment")} looks validated by the latest scan.`;
  }

  const reviewCount = items.filter((item) => item.status === "needs-review").length;
  if (reviewCount > 0) {
    return `${reviewCount} ${pluralize(reviewCount, "experiment")} needs review after the latest scan.`;
  }

  return "Experiments are holding steady; keep testing against the next scan.";
}

export function buildExperimentLedger({
  analysis,
  memory,
  scanHistory
}: {
  analysis: AnalysisSummary | null;
  memory: StrategyMemory | null;
  scanHistory: ScanHistoryBrief;
}): ExperimentLedger {
  const candidates = experimentsFromMemory(memory);
  const resolvedCandidates = candidates.length > 0 ? candidates : experimentsFromAnalysis(analysis);
  const itemStatus = buildItemStatus(scanHistory);
  const items = resolvedCandidates.map((candidate) => ({
    ...candidate,
    ...itemStatus
  }));

  return {
    summary: buildSummary({ items, memory }),
    statusLabel: items.length > 0 ? `${items.length} tracked` : "Locked",
    items
  };
}

export function formatExperimentLedgerForClipboard(ledger: ExperimentLedger) {
  const itemLines = ledger.items.flatMap((item) => [
    `- [${item.statusLabel}] ${item.hypothesis}`,
    `  Source: ${item.sourceLabel}`,
    `  Trend: ${item.trendLabel}`,
    `  Evidence: ${item.evidence}`,
    `  Next: ${item.nextAction}`
  ]);

  return [
    `Experiment ledger: ${ledger.summary}`,
    `Status: ${ledger.statusLabel}`,
    "",
    "Tracked hypotheses:",
    ...(itemLines.length > 0 ? itemLines : ["- No hypotheses tracked yet."])
  ].join("\n");
}
