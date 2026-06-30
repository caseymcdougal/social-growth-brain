import { Check, Copy, FileText, ListChecks, LockKeyhole, RefreshCcw, Sparkles, Upload, Wand2 } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  applyStrategyMemoryProposal,
  analyzeLatestSnapshot,
  captureSnapshot,
  exploreNearbyTopics,
  generateTodaysIdeas,
  getBootstrappedDashboardState,
  getDashboardState,
  getLatestAnalysis,
  getLatestStrategyMemory,
  getLatestTopicExploration,
  importSnapshot,
  isBootstrappedDashboardStateFromStorage,
  refreshStrategyMemory,
  type DashboardState,
  type StrategyMemoryProposal
} from "./client/api";
import { CaptureBar } from "./client/components/CaptureBar";
import { CoachReport } from "./client/components/CoachReport";
import { NextPostQueue } from "./client/components/NextPostQueue";
import { OpportunityDesk } from "./client/components/OpportunityDesk";
import { ScanHistoryPanel } from "./client/components/ScanHistoryPanel";
import type { AnalysisOutput, AnalysisSummary } from "./shared/analysis-schema";
import { buildCreatorScorecard, formatCreatorScorecardForClipboard, type CreatorScorecard } from "./shared/creator-scorecard";
import type { GenerationOutput } from "./shared/generation-schema";
import { buildOpportunityBrief, type OpportunityBrief } from "./shared/opportunities";
import { buildSelectedPostLabBrief, type PostAnalysis, type SelectedPostLabBrief } from "./shared/post-lab";
import { rankPostsByVisibleSignal, summarizeMetricCompleteness } from "./shared/performance";
import { buildScanHistoryBrief } from "./shared/scan-history";
import type { StrategyMemory, TopicExplorationOutput } from "./shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "./shared/types";

const DeferredManualImportPanel = lazy(() =>
  import("./client/components/ManualImportPanel").then((module) => ({ default: module.ManualImportPanel }))
);
const DeferredPostBreakdown = lazy(() =>
  import("./client/components/PostBreakdown").then((module) => ({ default: module.PostBreakdown }))
);
const DeferredStrategyMemoryPanel = lazy(() =>
  import("./client/components/StrategyMemoryPanel").then((module) => ({ default: module.StrategyMemoryPanel }))
);
const DeferredExperimentLedgerPanel = lazy(() =>
  import("./client/components/ExperimentLedgerPanel").then((module) => ({ default: module.ExperimentLedgerPanel }))
);
const DeferredTopicExplorer = lazy(() =>
  import("./client/components/TopicExplorer").then((module) => ({ default: module.TopicExplorer }))
);

const auditSteps = [
  { key: "scan", label: "Scan", detail: "Public X metrics" },
  { key: "rank", label: "Rank", detail: "Visible signal" },
  { key: "diagnose", label: "Diagnose", detail: "Why it moved" },
  { key: "write", label: "Write", detail: "Next posts" }
] as const;

type AuditStepKey = (typeof auditSteps)[number]["key"];
type StepState = "idle" | "current" | "complete";
type ActionProgressState = "locked" | "ready" | "running" | "complete" | "issue";
type StrategyEngineView = "experiments" | "memory" | "topics";
type ActionProgressItem = {
  label: string;
  detail: string;
  state: ActionProgressState;
};
type RecoveryNotice = {
  kind: "analysis" | "generation" | "memory" | "topic";
  message: string;
};

const stepOrder: AuditStepKey[] = ["scan", "rank", "diagnose", "write"];
const actionProgressValue: Record<ActionProgressState, number> = {
  locked: 8,
  ready: 28,
  running: 68,
  complete: 100,
  issue: 100
};
const actionProgressLabel: Record<ActionProgressState, string> = {
  locked: "Locked",
  ready: "Ready",
  running: "Running",
  complete: "Complete",
  issue: "Needs attention"
};

function getCurrentStep(snapshot: CapturedAccountSnapshot | null, analysis: AnalysisSummary | null, generation: GenerationOutput | null) {
  if (generation) return "write";
  if (analysis) return "write";
  if (snapshot) return "diagnose";
  return "scan";
}

function getStepState(step: AuditStepKey, currentStep: AuditStepKey, generation: GenerationOutput | null): StepState {
  if (generation) return "complete";
  const stepIndex = stepOrder.indexOf(step);
  const currentIndex = stepOrder.indexOf(currentStep);
  if (stepIndex < currentIndex) return "complete";
  if (stepIndex === currentIndex) return "current";
  return "idle";
}

function getActionState({
  blocked,
  complete,
  error,
  ready,
  running
}: {
  blocked?: boolean;
  complete?: boolean;
  error?: boolean;
  ready?: boolean;
  running?: boolean;
}): ActionProgressState {
  if (running) return "running";
  if (error) return "issue";
  if (complete) return "complete";
  if (blocked) return "locked";
  if (ready) return "ready";
  return "locked";
}

function ActionProgressPanel({ actions }: { actions: ActionProgressItem[] }) {
  const runningCount = actions.filter((action) => action.state === "running").length;
  const issueCount = actions.filter((action) => action.state === "issue").length;
  const completeCount = actions.filter((action) => action.state === "complete").length;
  const readyCount = actions.filter((action) => action.state === "ready").length;
  const lockedCount = actions.filter((action) => action.state === "locked").length;
  const statusLabel = runningCount
    ? `${runningCount} running`
    : issueCount
      ? `${issueCount} needs attention`
      : "All systems idle";
  const detailLabel = runningCount
    ? "Live actions are expanded so progress stays visible."
    : issueCount
      ? "One action needs a retry — see the run log below."
      : `${completeCount} complete · ${readyCount} ready · ${lockedCount} locked`;

  return (
    <section className="action-progress-panel" aria-label="Action progress" aria-live="polite">
      <div className="action-progress-head">
        <div>
          <p className="eyebrow">Run activity</p>
          <h2>Run log</h2>
          <p>{detailLabel}</p>
        </div>
        <span className="status-chip">{statusLabel}</span>
      </div>
      <ol className="action-progress-list">
        {actions.map((action) => {
          const value = actionProgressValue[action.state];
          return (
            <li className="action-progress-row" data-state={action.state} key={action.label}>
              <div>
                <strong>{action.label}</strong>
                <small>{action.detail}</small>
              </div>
              <span className="action-state-label">{actionProgressLabel[action.state]}</span>
              <span
                aria-label={`${action.label} progress`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={value}
                className="action-meter"
                role="progressbar"
              >
                <span style={{ width: `${value}%` }} />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const recoveryNoticeCopy: Record<RecoveryNotice["kind"], { title: string; nextStep: string }> = {
  analysis: {
    title: "Strategy audit did not finish",
    nextStep: "Keep the snapshot in place and run the strategy audit again. If it keeps failing, paste a fresh snapshot first."
  },
  generation: {
    title: "Today's ideas did not generate",
    nextStep: "Keep the audit in place and try Generate today's ideas again. If the model is unavailable, use the Post Lab queue already on screen."
  },
  memory: {
    title: "Strategy memory did not update",
    nextStep: "Keep the current accepted context and retry the memory action after the latest audit is stable."
  },
  topic: {
    title: "Topic exploration did not finish",
    nextStep: "Keep the current audit and retry topic exploration later. The priority signals and post queue are still usable."
  }
};

function RecoveryNoticePanel({ kind, message }: RecoveryNotice) {
  const copy = recoveryNoticeCopy[kind];
  return (
    <section className="panel error-panel" role="alert">
      <div>
        <p className="eyebrow">Recovery needed</p>
        <h2>{copy.title}</h2>
        <p>{message}</p>
      </div>
      <div className="recovery-next-step">
        <span>What to do next</span>
        <p>{copy.nextStep}</p>
      </div>
    </section>
  );
}

function AuditCommandCenter({
  activeAction,
  analyzing,
  capturing,
  coveragePercent,
  draftCount,
  generating,
  isGenerated,
  isBusy,
  onAnalyze,
  onCapture,
  onGenerateToday,
  onOpenImport,
  onReviewDraftQueue,
  opportunityBrief,
  postCount,
  scorecard
}: {
  activeAction: ActionProgressItem | null;
  analyzing: boolean;
  capturing: boolean;
  coveragePercent: number;
  draftCount: number;
  generating: boolean;
  isGenerated: boolean;
  isBusy: boolean;
  onAnalyze: () => void;
  onCapture: () => void;
  onGenerateToday: () => void;
  onOpenImport: () => void;
  onReviewDraftQueue: () => void;
  opportunityBrief: OpportunityBrief;
  postCount: number;
  scorecard: CreatorScorecard;
}) {
  const [scorecardCopied, setScorecardCopied] = useState(false);
  const [scorecardCopyFailed, setScorecardCopyFailed] = useState(false);
  const bestOpportunity = opportunityBrief.priorityCards[0] ?? null;
  const sourcePostLabel = `${postCount} ${postCount === 1 ? "post" : "posts"}`;
  const draftLabel = `${draftCount} ${draftCount === 1 ? "draft" : "drafts"}`;
  const stagedDraftLabel = `${draftLabel} staged`;
  const readinessLabel = activeAction
    ? `${activeAction.label} running`
    : isGenerated
      ? `${draftLabel} · ${coveragePercent}% evidence`
      : `${sourcePostLabel} · ${coveragePercent}% evidence`;
  const commandSignals = [
    {
      label: "Health",
      title: `${scorecard.statusLabel} · ${scorecard.overallScore}`,
      detail: `${sourcePostLabel} · ${coveragePercent}% evidence`
    },
    {
      label: "Constraint",
      title: scorecard.primaryConstraint.label,
      detail: scorecard.primaryConstraint.nextAction
    },
    {
      label: "Opportunity",
      title: bestOpportunity?.title ?? "Create the first evidence base",
      detail: bestOpportunity?.detail ?? "Scan or paste a snapshot so the dashboard can rank what matters."
    }
  ];

  async function copyScorecardBrief() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(formatCreatorScorecardForClipboard(scorecard));
      setScorecardCopyFailed(false);
      setScorecardCopied(true);
      window.setTimeout(() => setScorecardCopied(false), 1400);
    } catch {
      setScorecardCopied(false);
      setScorecardCopyFailed(true);
      window.setTimeout(() => setScorecardCopyFailed(false), 1800);
    }
  }

  return (
    <section
      className={isGenerated ? "panel command-center-panel is-generated" : "panel command-center-panel"}
      data-mode={isGenerated ? "draft" : "audit"}
      aria-label="Audit command center"
      aria-labelledby="command-center-title"
    >
      <div className="command-center-lead">
        <div>
          <p className="eyebrow">{isGenerated ? "Draft handoff" : "Audit summary"}</p>
          <h2 id="command-center-title">{isGenerated ? "Ready-to-write command center" : "Audit command center"}</h2>
          <p>{scorecard.summary}</p>
        </div>
        <span className="status-chip">{readinessLabel}</span>
      </div>

      {isGenerated ? (
        <div className="command-center-handoff" aria-label="Draft handoff priorities">
          <article className="command-center-primary-action">
            <span>Draft queue</span>
            <strong>{stagedDraftLabel}</strong>
            <p>Copy the top draft or refresh ideas.</p>
          </article>
          <div className="command-center-actions">
            <button className="primary-button" type="button" disabled={isBusy} onClick={onReviewDraftQueue}>
              <ListChecks size={16} aria-hidden="true" /> Review draft queue
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isBusy}
              onClick={onGenerateToday}
              aria-busy={generating || undefined}
            >
              <Sparkles size={16} aria-hidden="true" /> {generating ? "Generating" : "Generate fresh ideas"}
            </button>
            <details className="capture-maintenance command-center-maintenance" aria-label="Update source actions">
              <summary>
                <span>Update source</span>
              </summary>
              <div className="capture-maintenance-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={onAnalyze}
                  aria-busy={analyzing || undefined}
                >
                  <Wand2 size={16} aria-hidden="true" /> {analyzing ? "Auditing" : "Re-run audit"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onCapture}
                  disabled={isBusy}
                  aria-busy={capturing || undefined}
                >
                  <RefreshCcw size={16} aria-hidden="true" /> {capturing ? "Scanning X" : "Rescan public metrics"}
                </button>
                <button className="secondary-button" type="button" onClick={onOpenImport} disabled={isBusy}>
                  <Upload size={16} aria-hidden="true" /> Paste snapshot
                </button>
              </div>
            </details>
          </div>
          <div className="command-center-signals" aria-label="Command signals">
            {commandSignals.map((signal) => (
              <article className="command-center-signal" key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.title}</strong>
                <p>{signal.detail}</p>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="command-center-grid">
          <article className="command-center-card is-primary">
            <span>Creator score</span>
            <div className="score-hero">
              <strong className="score-value">{scorecard.overallScore}</strong>
              <span className="score-status">{scorecard.statusLabel}</span>
            </div>
            <p>{scorecard.primaryConstraint.detail}</p>
          </article>
          <article className="command-center-card">
            <span>Next action</span>
            <strong>{opportunityBrief.command.title}</strong>
            <p>{opportunityBrief.command.detail}</p>
          </article>
          <article className="command-center-card">
            <span>Biggest constraint</span>
            <strong>{scorecard.primaryConstraint.label}</strong>
            <p>{scorecard.primaryConstraint.nextAction}</p>
          </article>
          <article className="command-center-card">
            <span>Best opportunity</span>
            <strong>{bestOpportunity?.title ?? "Create the first evidence base"}</strong>
            <p>{bestOpportunity?.detail ?? "Scan or paste a snapshot so the dashboard can rank what matters."}</p>
          </article>
        </div>
      )}

      <section className="scorecard-breakdown-inline command-score-breakdown" aria-label="Score breakdown">
        <div className="scorecard-inline-head">
          <span>Score breakdown</span>
          <strong>{scorecard.dimensions.length} operating signals</strong>
        </div>

        <div className="scorecard-breakdown-body">
          <div className="scorecard-dimensions" aria-label="Creator scorecard dimensions">
            {scorecard.dimensions.map((dimension) => (
              <article data-key={dimension.key} key={dimension.key}>
                <div className="scorecard-dimension-top">
                  <span>{dimension.label}</span>
                  <strong>{dimension.score}</strong>
                </div>
                <div className="scorecard-meter" aria-hidden="true">
                  <span style={{ width: `${dimension.score}%` }} />
                </div>
                <p>{dimension.statusLabel}</p>
                <small>{dimension.detail}</small>
              </article>
            ))}
          </div>
          <button className="copy-button scorecard-copy" type="button" onClick={() => void copyScorecardBrief()}>
            {scorecardCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {scorecardCopied ? "Copied brief" : scorecardCopyFailed ? "Copy unavailable" : "Copy scorecard brief"}
          </button>
        </div>
      </section>
    </section>
  );
}

export function App() {
  const [bootstrappedDashboard] = useState<DashboardState | null>(() => getBootstrappedDashboardState());
  const [bootstrappedFromStorage] = useState(() => isBootstrappedDashboardStateFromStorage());
  const [snapshot, setSnapshot] = useState<CapturedAccountSnapshot | null>(() => bootstrappedDashboard?.snapshot ?? null);
  const [history, setHistory] = useState<CapturedAccountSnapshot[]>(() => bootstrappedDashboard?.history ?? []);
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(() => !bootstrappedDashboard);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(() => bootstrappedDashboard?.analysis ?? null);
  const [fullAnalysis, setFullAnalysis] = useState<AnalysisOutput | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationOutput | null>(() => bootstrappedDashboard?.generation ?? null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [importingSnapshot, setImportingSnapshot] = useState(false);
  const [strategyMemory, setStrategyMemory] = useState<StrategyMemory | null>(
    () => bootstrappedDashboard?.strategyMemory.memory ?? null
  );
  const [memoryProposal, setMemoryProposal] = useState<StrategyMemoryProposal | null>(
    () => bootstrappedDashboard?.strategyMemory.proposal ?? null
  );
  const [updatingMemory, setUpdatingMemory] = useState(false);
  const [applyingMemory, setApplyingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [topicExploration, setTopicExploration] = useState<TopicExplorationOutput | null>(
    () => bootstrappedDashboard?.topicExploration ?? null
  );
  const [exploringTopics, setExploringTopics] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [strategyEngineView, setStrategyEngineView] = useState<StrategyEngineView>("experiments");
  const [deferredPanelsReady, setDeferredPanelsReady] = useState(false);
  const [initialDashboardState] = useState<Promise<DashboardState>>(() =>
    bootstrappedDashboard ? Promise.resolve(bootstrappedDashboard) : getDashboardState({ force: true })
  );
  const postCount = snapshot?.posts.length ?? 0;
  const postLabel = postCount === 1 ? "post" : "posts";
  const posts = useMemo(() => snapshot?.posts ?? [], [snapshot]);
  const scanHistoryBrief = useMemo(() => buildScanHistoryBrief(history), [history]);
  const metricSummary = useMemo(() => summarizeMetricCompleteness(posts), [posts]);
  const rankedPosts = useMemo(() => rankPostsByVisibleSignal(posts), [posts]);
  const creatorScorecard = useMemo(
    () =>
      buildCreatorScorecard({
        snapshot,
        analysis,
        generation,
        metricSummary,
        scanHistory: scanHistoryBrief,
        memory: strategyMemory
      }),
    [analysis, generation, metricSummary, scanHistoryBrief, snapshot, strategyMemory]
  );
  const opportunityBrief = useMemo(
    () =>
      buildOpportunityBrief({
        snapshot,
        analysis: fullAnalysis ?? analysis,
        generation,
        rankedPosts,
        metricSummary
      }),
    [analysis, fullAnalysis, generation, metricSummary, rankedPosts, snapshot]
  );
  const selectedPostBrief = useMemo<SelectedPostLabBrief | null>(() => {
    if (!selectedPostId) return null;
    const rankedPost = rankedPosts.find((item) => item.post.xPostId === selectedPostId);
    if (!rankedPost) return null;
    const postAnalysis = (fullAnalysis?.post_analyses.find((item) => item.post_id === selectedPostId) ?? null) as PostAnalysis | null;
    return buildSelectedPostLabBrief({ rankedPost, postAnalysis });
  }, [fullAnalysis, rankedPosts, selectedPostId]);
  const topPost = rankedPosts[0]?.post;
  const currentStep = getCurrentStep(snapshot, analysis, generation);
  const coveragePercent = Math.round(metricSummary.completenessRatio * 100);
  const metricHealth =
    coveragePercent >= 85 ? "High-confidence read" : coveragePercent >= 55 ? "Usable partial read" : "Thin signal";
  const actionProgressItems = useMemo<ActionProgressItem[]>(
    () => [
      {
        label: "Dashboard load",
        detail: "Latest local state",
        state: getActionState({ running: loading, error: Boolean(loadError), complete: !loading && !loadError })
      },
      {
        label: "Public scan",
        detail: "Capture visible X metrics",
        state: getActionState({
          running: capturing,
          error: Boolean(captureError),
          complete: Boolean(snapshot),
          ready: true
        })
      },
      {
        label: "Snapshot paste",
        detail: "Manual JSON fallback",
        state: getActionState({ running: importingSnapshot, complete: Boolean(snapshot), ready: true })
      },
      {
        label: "Strategy audit",
        detail: "Rank patterns and constraints",
        state: getActionState({
          running: analyzing,
          error: Boolean(analysisError),
          complete: Boolean(analysis),
          ready: Boolean(snapshot),
          blocked: !snapshot
        })
      },
      {
        label: "Today's ideas",
        detail: "Generate draft candidates",
        state: getActionState({
          running: generating,
          error: Boolean(generationError),
          complete: Boolean(generation),
          ready: Boolean(analysis),
          blocked: !analysis
        })
      },
      {
        label: "Memory refresh",
        detail: "Propose reusable context",
        state: getActionState({
          running: updatingMemory,
          error: Boolean(memoryError),
          complete: Boolean(memoryProposal || strategyMemory),
          ready: Boolean(analysis),
          blocked: !analysis
        })
      },
      {
        label: "Memory apply",
        detail: "Accept context updates",
        state: getActionState({
          running: applyingMemory,
          error: Boolean(memoryError),
          complete: Boolean(strategyMemory),
          ready: Boolean(memoryProposal),
          blocked: !memoryProposal
        })
      },
      {
        label: "Topic explore",
        detail: "Find adjacent lanes",
        state: getActionState({
          running: exploringTopics,
          error: Boolean(topicError),
          complete: Boolean(topicExploration),
          ready: Boolean(analysis),
          blocked: !analysis
        })
      }
    ],
    [
      analysis,
      analysisError,
      analyzing,
      applyingMemory,
      captureError,
      capturing,
      exploringTopics,
      generation,
      generationError,
      generating,
      importingSnapshot,
      loadError,
      loading,
      memoryError,
      memoryProposal,
      snapshot,
      strategyMemory,
      topicError,
      topicExploration,
      updatingMemory
    ]
  );
  const activeAction = actionProgressItems.find((action) => action.state === "running") ?? null;
  const isDashboardActionBusy = loading || capturing || analyzing || generating;
  const evidenceDetailsOpen = Boolean(activeAction || loadError || captureError);
  const strategyEngineDetailsOpen = Boolean(
    memoryProposal || updatingMemory || applyingMemory || exploringTopics || memoryError || topicError
  );
  const strategyEngineStatus = updatingMemory
    ? "Updating memory"
    : applyingMemory
      ? "Applying memory"
      : exploringTopics
        ? "Exploring topics"
        : memoryProposal
          ? "Memory proposal waiting"
          : memoryError || topicError
            ? "Needs attention"
            : topicExploration
              ? `${topicExploration.topics.length} topic ${topicExploration.topics.length === 1 ? "lane" : "lanes"} saved`
              : strategyMemory
                ? "Memory context saved"
                : analysis
                  ? "3 optional tools ready"
                  : "Run audit to unlock";
  const strategyEngineViews = useMemo(
    () =>
      [
        {
          key: "experiments",
          label: "Hypotheses",
          detail: strategyMemory ? "Validate active bets" : analysis ? "Track what to test" : "Run audit first"
        },
        {
          key: "memory",
          label: "Memory",
          detail: memoryProposal ? "Proposal waiting" : strategyMemory ? "Context accepted" : analysis ? "Ready to update" : "Run audit first"
        },
        {
          key: "topics",
          label: "Topics",
          detail: topicExploration ? `${topicExploration.topics.length} nearby lanes` : analysis ? "Explore adjacent lanes" : "Run audit first"
        }
      ] satisfies Array<{ key: StrategyEngineView; label: string; detail: string }>,
    [analysis, memoryProposal, strategyMemory, topicExploration]
  );

  async function refresh(
    request: Promise<DashboardState> = getDashboardState({ force: true }),
    options: { showLoading?: boolean } = {}
  ) {
    const showLoading = options.showLoading ?? true;
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const dashboard = await request;
      setSnapshot(dashboard.snapshot);
      setHistory(dashboard.history);
      setAnalysis(dashboard.analysis);
      setFullAnalysis(null);
      setGeneration(dashboard.generation);
      setStrategyMemory(dashboard.strategyMemory.memory);
      setMemoryProposal(dashboard.strategyMemory.proposal);
      setTopicExploration(dashboard.topicExploration);
      if (!dashboard.snapshot?.posts.some((post) => post.xPostId === selectedPostId)) {
        setSelectedPostId(null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load latest snapshot");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    if (!bootstrappedDashboard) {
      void refresh(initialDashboardState);
      return;
    }
    if (bootstrappedFromStorage) {
      const backgroundRefresh = window.setTimeout(() => {
        void refresh(getDashboardState({ force: true }), { showLoading: false });
      }, 120);
      return () => window.clearTimeout(backgroundRefresh);
    }
  }, [bootstrappedDashboard, bootstrappedFromStorage, initialDashboardState]);

  useEffect(() => {
    const deferredPanelTimer = window.setTimeout(() => setDeferredPanelsReady(true), 80);
    return () => window.clearTimeout(deferredPanelTimer);
  }, []);

  useEffect(() => {
    if (!deferredPanelsReady || !analysis || fullAnalysis) return;
    let canceled = false;
    void getLatestAnalysis()
      .then((latestAnalysis) => {
        if (!canceled) setFullAnalysis(latestAnalysis);
      })
      .catch(() => {
        if (!canceled) setFullAnalysis(null);
      });
    return () => {
      canceled = true;
    };
  }, [analysis, deferredPanelsReady, fullAnalysis]);

  useEffect(() => {
    if (!deferredPanelsReady || !analysis) return;
    let canceled = false;
    void Promise.allSettled([getLatestStrategyMemory(), getLatestTopicExploration()]).then(
      ([latestMemory, latestTopics]) => {
        if (canceled) return;
        if (latestMemory.status === "fulfilled") {
          setStrategyMemory(latestMemory.value.memory);
          setMemoryProposal(latestMemory.value.proposal);
        }
        if (latestTopics.status === "fulfilled") {
          setTopicExploration(latestTopics.value);
        }
      }
    );
    return () => {
      canceled = true;
    };
  }, [analysis, deferredPanelsReady]);

  async function handleImport(rawJson: string) {
    setImportingSnapshot(true);
    try {
      await importSnapshot(JSON.parse(rawJson));
      setAnalysis(null);
      setFullAnalysis(null);
      setAnalysisError(null);
      setGeneration(null);
      setGenerationError(null);
      setMemoryProposal(null);
      setMemoryError(null);
      setTopicExploration(null);
      setTopicError(null);
      setCaptureError(null);
      setSelectedPostId(null);
      await refresh();
    } finally {
      setImportingSnapshot(false);
    }
  }

  async function handleCapture() {
    setCapturing(true);
    setCaptureError(null);
    setCaptureStatus("Opening X in Chrome and reading visible posts. This should finish in under a minute.");
    setAnalysis(null);
    setFullAnalysis(null);
    setAnalysisError(null);
    setGeneration(null);
    setGenerationError(null);
    setMemoryProposal(null);
    setMemoryError(null);
    setTopicExploration(null);
    setTopicError(null);
    setSelectedPostId(null);
    try {
      const capturedSnapshot = await captureSnapshot();
      setSnapshot(capturedSnapshot);
      setHistory((currentHistory) => [
        capturedSnapshot,
        ...currentHistory.filter((item) => item.profile.capturedAt !== capturedSnapshot.profile.capturedAt)
      ].slice(0, 6));
      setCaptureStatus(null);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Capture failed");
    } finally {
      setCapturing(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysisError(null);
    setGeneration(null);
    setGenerationError(null);
    setMemoryProposal(null);
    setMemoryError(null);
    setTopicExploration(null);
    setTopicError(null);
    setSelectedPostId(null);
    try {
      const latestAnalysis = await analyzeLatestSnapshot();
      setAnalysis(latestAnalysis);
      setFullAnalysis(latestAnalysis);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerateToday() {
    setGenerating(true);
    setGenerationError(null);
    try {
      setGeneration(await generateTodaysIdeas());
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleReviewDraftQueue() {
    const target = document.getElementById("next-posts-title") ?? document.querySelector(".next-posts");
    if (target && "scrollIntoView" in target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  async function handleRefreshMemory() {
    setUpdatingMemory(true);
    setMemoryError(null);
    try {
      setMemoryProposal(await refreshStrategyMemory());
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : "Strategy memory update failed");
    } finally {
      setUpdatingMemory(false);
    }
  }

  async function handleApplyMemory(proposalId: number) {
    setApplyingMemory(true);
    setMemoryError(null);
    try {
      setStrategyMemory(await applyStrategyMemoryProposal(proposalId));
      setMemoryProposal(null);
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : "Apply memory update failed");
    } finally {
      setApplyingMemory(false);
    }
  }

  async function handleExploreTopics() {
    setExploringTopics(true);
    setTopicError(null);
    try {
      setTopicExploration(await exploreNearbyTopics());
    } catch (error) {
      setTopicError(error instanceof Error ? error.message : "Topic exploration failed");
    } finally {
      setExploringTopics(false);
    }
  }

  function handleStrategyEngineTabChange(view: StrategyEngineView) {
    setStrategyEngineView(view);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const tabs = document.querySelector(".strategy-engine-tabs");
        if (tabs && "scrollIntoView" in tabs && typeof tabs.scrollIntoView === "function") {
          tabs.scrollIntoView({ block: "nearest" });
        }
      });
    });
  }

  const nextPostWorkspace = (
    <NextPostQueue
      analysis={analysis}
      capturedPosts={posts}
      generation={generation}
      selectedPostBrief={selectedPostBrief}
    />
  );
  const coachReport = <CoachReport analysis={analysis} postCount={postCount} />;
  const deferredCoachReport = <CoachReport analysis={analysis} postCount={postCount} deferred />;
  const pairedPostWorkspace = (
    <div className="dashboard-grid">
      {nextPostWorkspace}
      {coachReport}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Audit workflow">
        <div className="brand-lockup">
          <div className="brand-mark">
            <FileText size={18} aria-hidden="true" />
          </div>
          <div>
            <strong>Social Audit</strong>
            <span>Casey / X</span>
          </div>
        </div>
        <ol className="step-rail" aria-label="Audit sequence">
          {auditSteps.map((item, index) => {
            const stepState = getStepState(item.key, currentStep, generation);
            return (
              <li
                aria-current={stepState === "current" ? "step" : undefined}
                className="step-row"
                data-state={stepState}
                key={item.label}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="privacy-note">
          <LockKeyhole size={16} aria-hidden="true" />
          <div>
            <strong>Local run</strong>
            <span>Public profile metrics. No scheduler.</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local creator intelligence</p>
            <h1>Social Audit Studio</h1>
            <p className="topbar-copy">
              Decide the next X post from public signal: scan the account, read the pattern, draft the move, and copy it out.
            </p>
          </div>
          <div className={activeAction ? "run-status is-running" : "run-status"} aria-live="polite">
            <span className={activeAction ? "status-dot is-loading" : snapshot ? "status-dot" : "status-dot is-empty"} />
            {activeAction ? `${activeAction.label} running` : snapshot ? `${postCount} ${postLabel} ready` : "No capture"}
          </div>
        </header>

        <AuditCommandCenter
          activeAction={activeAction}
          analyzing={analyzing}
          capturing={capturing}
          coveragePercent={coveragePercent}
          draftCount={generation?.posts.length ?? 0}
          generating={generating}
          isGenerated={Boolean(generation)}
          isBusy={isDashboardActionBusy}
          onAnalyze={() => void handleAnalyze()}
          onCapture={() => void handleCapture()}
          onGenerateToday={() => void handleGenerateToday()}
          onOpenImport={() => setImportOpen(true)}
          onReviewDraftQueue={handleReviewDraftQueue}
          opportunityBrief={opportunityBrief}
          postCount={postCount}
          scorecard={creatorScorecard}
        />

        {!generation && (
          <CaptureBar
            snapshot={snapshot}
            metricSummary={metricSummary}
            loading={loading}
            capturing={capturing}
            analyzing={analyzing}
            generating={generating}
            hasAnalysis={Boolean(analysis)}
            analysis={analysis}
            generation={generation}
            error={loadError ?? captureError}
            status={capturing ? captureStatus : null}
            onAnalyze={() => void handleAnalyze()}
            onCapture={() => void handleCapture()}
            onGenerateToday={() => void handleGenerateToday()}
            onOpenImport={() => setImportOpen(true)}
          />
        )}

        {analysisError && <RecoveryNoticePanel kind="analysis" message={analysisError} />}
        {generationError && <RecoveryNoticePanel kind="generation" message={generationError} />}
        {memoryError && <RecoveryNoticePanel kind="memory" message={memoryError} />}
        {topicError && <RecoveryNoticePanel kind="topic" message={topicError} />}

        {generation ? (
          <>
            {nextPostWorkspace}
            <OpportunityDesk brief={opportunityBrief} deferred />
            {deferredCoachReport}
          </>
        ) : (
          <>
            <OpportunityDesk brief={opportunityBrief} />
            {pairedPostWorkspace}
          </>
        )}

        <details className="evidence-details-panel" aria-label="Evidence details" open={evidenceDetailsOpen}>
          <summary>
            <span>Evidence details</span>
            <strong>
              {metricHealth} · {coveragePercent}% coverage
            </strong>
            <small>{scanHistoryBrief.summary}</small>
          </summary>
          <div className="operations-grid" aria-label="Operational telemetry">
            <ScanHistoryPanel history={history} />
            <section className="panel signal-panel" aria-label="Public metric signal">
              <p className="eyebrow">Evidence quality</p>
              <h2>{metricHealth}</h2>
              <div className="signal-meter" aria-hidden="true">
                <span style={{ width: `${coveragePercent}%` }} />
              </div>
              <dl className="signal-list">
                <div>
                  <dt>Metric coverage</dt>
                  <dd>
                    {coveragePercent}% · {metricSummary.capturedFields}/{metricSummary.totalFields || 0}
                  </dd>
                </div>
                <div>
                  <dt>Ranked sample</dt>
                  <dd>
                    {metricSummary.postsWithAnyMetrics}/{postCount}
                  </dd>
                </div>
                <div>
                  <dt>Top public signal</dt>
                  <dd>{topPost ? topPost.text.slice(0, 42) : "Awaiting scan"}</dd>
                </div>
              </dl>
            </section>
            <ActionProgressPanel actions={actionProgressItems} />
          </div>
        </details>

        {deferredPanelsReady && (
          <Suspense fallback={null}>
            <details
              className="strategy-engine-section"
              aria-label="Advanced strategy tools"
              open={strategyEngineDetailsOpen}
            >
              <summary className="strategy-engine-summary">
                <span>
                  <span className="eyebrow">Advanced loop</span>
                  <strong>Strategy engine</strong>
                  <small>Optional hypotheses, memory, and topic tools. Open when you need deeper strategy work.</small>
                </span>
                <strong>{strategyEngineStatus}</strong>
              </summary>

              <div className="strategy-engine-body">
                <div className="strategy-engine-tabs" role="tablist" aria-label="Strategy engine views">
                  {strategyEngineViews.map((view) => {
                    const selected = strategyEngineView === view.key;
                    return (
                      <button
                        aria-controls={`strategy-engine-panel-${view.key}`}
                        aria-selected={selected}
                        className="strategy-engine-tab"
                        id={`strategy-engine-tab-${view.key}`}
                        key={view.key}
                        onClick={() => handleStrategyEngineTabChange(view.key)}
                        role="tab"
                        type="button"
                      >
                        <span>{view.label}</span>
                        <small>{view.detail}</small>
                      </button>
                    );
                  })}
                </div>

                <div
                  aria-labelledby={`strategy-engine-tab-${strategyEngineView}`}
                  className="strategy-engine-panel-slot"
                  id={`strategy-engine-panel-${strategyEngineView}`}
                  role="tabpanel"
                >
                  {strategyEngineView === "experiments" && (
                    <DeferredExperimentLedgerPanel analysis={analysis} memory={strategyMemory} scanHistory={scanHistoryBrief} />
                  )}
                  {strategyEngineView === "memory" && (
                    <DeferredStrategyMemoryPanel
                      analysis={analysis}
                      memory={strategyMemory}
                      proposal={memoryProposal}
                      updating={updatingMemory}
                      applying={applyingMemory}
                      onRefresh={() => void handleRefreshMemory()}
                      onApply={(proposalId) => void handleApplyMemory(proposalId)}
                    />
                  )}
                  {strategyEngineView === "topics" && (
                    <DeferredTopicExplorer
                      analysis={analysis}
                      exploration={topicExploration}
                      exploring={exploringTopics}
                      onExplore={() => void handleExploreTopics()}
                    />
                  )}
                </div>
              </div>
            </details>

            <DeferredPostBreakdown
              rankedPosts={rankedPosts}
              analysis={fullAnalysis}
              deferred={Boolean(generation)}
              selectedPostId={selectedPostId}
              onSelectPost={setSelectedPostId}
            />
          </Suspense>
        )}
      </main>

      {importOpen && (
        <Suspense fallback={null}>
          <DeferredManualImportPanel open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />
        </Suspense>
      )}
    </div>
  );
}
