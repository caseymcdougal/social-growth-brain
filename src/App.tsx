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
  saveCreativeDirection,
  deleteCreativeDirection,
  type CreativeDirectionEntry,
  type DashboardState,
  type StrategyMemoryProposal
} from "./client/api";
import { ActionProgressPanel, getActionState, type ActionProgressItem } from "./client/components/ActionProgressPanel";
import { AuditCommandCenter } from "./client/components/AuditCommandCenter";
import { AuditCompleteBanner } from "./client/components/AuditCompleteBanner";
import { CoachReport } from "./client/components/CoachReport";
import { CreativeDirectionCard } from "./client/components/CreativeDirectionCard";
import { NextMoveHero } from "./client/components/NextMoveHero";
import { NextPostQueue } from "./client/components/NextPostQueue";
import { PreDraftBrief } from "./client/components/PreDraftBrief";
import { RecoveryNoticePanel } from "./client/components/RecoveryNoticePanel";
import { ReferenceShelf } from "./client/components/ReferenceShelf";
import { ScoreStrip } from "./client/components/ScoreStrip";
import { WorkspaceSidebar } from "./client/components/WorkspaceSidebar";
import { PhaseLayout } from "./client/layout/PhaseLayout";
import { scrollToSection } from "./client/utils/scroll-to-section";
import { getCurrentStep } from "./client/utils/workflow-steps";
import type { AnalysisOutput, AnalysisSummary } from "./shared/analysis-schema";
import { buildCreatorScorecard } from "./shared/creator-scorecard";
import type { GenerationOutput } from "./shared/generation-schema";
import { buildOpportunityBrief } from "./shared/opportunities";
import { buildSelectedPostLabBrief, type PostAnalysis, type SelectedPostLabBrief } from "./shared/post-lab";
import { rankPostsByVisibleSignal, summarizeMetricCompleteness } from "./shared/performance";
import { buildScanHistoryBrief } from "./shared/scan-history";
import type { StrategyMemory, TopicExplorationOutput } from "./shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "./shared/types";
import { getWorkflowPhase } from "./shared/workflow-phase";

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
const DeferredVoiceProfilePanel = lazy(() =>
  import("./client/components/VoiceProfilePanel").then((module) => ({ default: module.VoiceProfilePanel }))
);
const DeferredTopicExplorer = lazy(() =>
  import("./client/components/TopicExplorer").then((module) => ({ default: module.TopicExplorer }))
);

type StrategyEngineView = "experiments" | "memory" | "voice" | "topics";

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
  const [directions, setDirections] = useState<CreativeDirectionEntry[]>(() => bootstrappedDashboard?.directions ?? []);
  const [strategyEngineView, setStrategyEngineView] = useState<StrategyEngineView>("experiments");
  const [deferredPanelsReady, setDeferredPanelsReady] = useState(false);
  const [dockSheetOpen, setDockSheetOpen] = useState(false);
  const [initialDashboardState] = useState<Promise<DashboardState>>(() =>
    bootstrappedDashboard ? Promise.resolve(bootstrappedDashboard) : getDashboardState({ force: true })
  );

  const phase = getWorkflowPhase(snapshot, analysis, generation);
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
    coveragePercent >= 85 ? "Strong read" : coveragePercent >= 55 ? "Partial read" : "Not enough data yet";

  const actionProgressItems = useMemo<ActionProgressItem[]>(
    () => [
      {
        label: "Loading your dashboard",
        detail: "Reading your saved state",
        state: getActionState({ running: loading, error: Boolean(loadError), complete: !loading && !loadError })
      },
      {
        label: "Scanning your posts",
        detail: "Reading your public X metrics",
        state: getActionState({
          running: capturing,
          error: Boolean(captureError),
          complete: Boolean(snapshot),
          ready: true
        })
      },
      {
        label: "Paste a snapshot",
        detail: "Manual fallback if a scan won't load",
        state: getActionState({ running: importingSnapshot, complete: Boolean(snapshot), ready: true })
      },
      {
        label: "Finding patterns",
        detail: "Ranking what's working and what's not",
        state: getActionState({
          running: analyzing,
          error: Boolean(analysisError),
          complete: Boolean(analysis),
          ready: Boolean(snapshot),
          blocked: !snapshot
        })
      },
      {
        label: "Writing draft ideas",
        detail: "Drafting post candidates",
        state: getActionState({
          running: generating,
          error: Boolean(generationError),
          complete: Boolean(generation),
          ready: Boolean(analysis),
          blocked: !analysis
        })
      },
      {
        label: "Updating memory",
        detail: "Suggesting what to remember",
        state: getActionState({
          running: updatingMemory,
          error: Boolean(memoryError),
          complete: Boolean(memoryProposal || strategyMemory),
          ready: Boolean(analysis),
          blocked: !analysis
        })
      },
      {
        label: "Saving memory",
        detail: "Saving what to remember",
        state: getActionState({
          running: applyingMemory,
          error: Boolean(memoryError),
          complete: Boolean(strategyMemory),
          ready: Boolean(memoryProposal),
          blocked: !memoryProposal
        })
      },
      {
        label: "Finding related topics",
        detail: "Looking for nearby content lanes",
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
      ? "Saving memory"
      : exploringTopics
        ? "Finding related topics"
        : memoryProposal
          ? "Memory suggestion ready"
          : memoryError || topicError
            ? "Needs a retry"
            : topicExploration
              ? `${topicExploration.topics.length} related ${topicExploration.topics.length === 1 ? "topic" : "topics"} saved`
              : strategyMemory
                ? "Memory saved"
                : analysis
                  ? "4 deeper tools ready"
                  : "Find patterns first";

  const strategyEngineViews = useMemo(
    () =>
      [
        {
          key: "experiments" as const,
          label: "Experiments",
          detail: strategyMemory ? "Test your active bets" : analysis ? "Track what to try" : "Find patterns first"
        },
        {
          key: "memory" as const,
          label: "Memory",
          detail: memoryProposal ? "Suggestion ready" : strategyMemory ? "Saved" : analysis ? "Ready to update" : "Find patterns first"
        },
        {
          key: "voice" as const,
          label: "Voice",
          detail: snapshot ? "How you write" : "Scan posts first"
        },
        {
          key: "topics" as const,
          label: "Topics",
          detail: topicExploration ? `${topicExploration.topics.length} related topics` : analysis ? "Find related topics" : "Find patterns first"
        }
      ],
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
      setDirections(dashboard.directions);
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
      window.setTimeout(() => scrollToSection("coach-report-title", { expand: true }), 400);
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
      window.setTimeout(() => scrollToSection("next-posts-title", { expand: true }), 400);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleReviewDraftQueue() {
    scrollToSection("next-posts-title", { expand: true });
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

  const hero = (
    <NextMoveHero
      snapshot={snapshot}
      metricSummary={metricSummary}
      scorecard={creatorScorecard}
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
  );

  const commandCenter =
    phase === "drafted" ? (
      <AuditCommandCenter
        activeAction={activeAction}
        analyzing={analyzing}
        capturing={capturing}
        coveragePercent={coveragePercent}
        draftCount={generation?.posts.length ?? 0}
        generating={generating}
        isGenerated
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
    ) : null;

  const scannedPreview =
    deferredPanelsReady && rankedPosts.length > 0 ? (
      <Suspense fallback={null}>
        <DeferredPostBreakdown rankedPosts={rankedPosts} analysis={null} preview />
      </Suspense>
    ) : null;

  const auditedInsightGrid =
    analysis && deferredPanelsReady ? (
      <>
        <div className="dashboard-grid audited-insight-grid">
          <Suspense fallback={null}>
            <DeferredPostBreakdown
              rankedPosts={rankedPosts}
              analysis={fullAnalysis}
              selectedPostId={selectedPostId}
              onSelectPost={setSelectedPostId}
            />
          </Suspense>
          <PreDraftBrief analysis={analysis} />
        </div>
        {selectedPostBrief && (
          <NextPostQueue
            analysis={analysis}
            capturedPosts={posts}
            generation={null}
            selectedPostBrief={selectedPostBrief}
          />
        )}
      </>
    ) : null;

  const strategyEngineSection = deferredPanelsReady ? (
    <details className="strategy-engine-section" aria-label="Advanced tools" open={strategyEngineDetailsOpen}>
      <summary className="strategy-engine-summary">
        <span>
          <span className="eyebrow">Advanced</span>
          <strong>Strategy tools</strong>
          <small>Test ideas, save memory, and explore related topics when you're ready.</small>
        </span>
        <strong>{strategyEngineStatus}</strong>
      </summary>

      <div className="strategy-engine-body">
        <CreativeDirectionCard
          directions={directions}
          onAdd={async (text) => {
            setDirections(await saveCreativeDirection(text));
          }}
          onDelete={async (id) => {
            setDirections(await deleteCreativeDirection(id));
          }}
        />
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
          {strategyEngineView === "voice" && (
            <DeferredVoiceProfilePanel hasSnapshot={Boolean(snapshot)} />
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
  ) : null;

  const postBreakdownDeferred =
    deferredPanelsReady && phase === "drafted" ? (
      <DeferredPostBreakdown
        rankedPosts={rankedPosts}
        analysis={fullAnalysis}
        deferred
        selectedPostId={selectedPostId}
        onSelectPost={setSelectedPostId}
      />
    ) : null;

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        currentStep={currentStep}
        generation={generation}
        dockSheetOpen={dockSheetOpen}
        onToggleDockSheet={() => setDockSheetOpen((open) => !open)}
      />

      <main className="workspace" data-phase={phase}>
        <header className="topbar">
          <div>
            <p className="eyebrow">Casey on X</p>
            <h1>
              Social Audit <span className="title-accent">Studio</span>
            </h1>
            <p className="topbar-copy">Scan your posts, read the pattern, write the next one.</p>
          </div>
          <div className={activeAction ? "run-status is-running" : "run-status"} aria-live="polite">
            <span className={activeAction ? "status-dot is-loading" : snapshot ? "status-dot" : "status-dot is-empty"} />
            {activeAction ? `${activeAction.label}…` : snapshot ? `${postCount} ${postLabel} loaded` : "No posts yet"}
          </div>
        </header>

        <PhaseLayout
          phase={phase}
          hero={hero}
          commandCenter={commandCenter}
          auditBanner={analysis ? <AuditCompleteBanner analysis={analysis} scorecard={creatorScorecard} /> : null}
          scoreStrip={analysis ? <ScoreStrip scorecard={creatorScorecard} /> : null}
          scannedPreview={scannedPreview}
          auditedCoach={analysis ? <CoachReport analysis={analysis} postCount={postCount} /> : null}
          auditedInsightGrid={auditedInsightGrid}
          draftedWorkspace={
            <NextPostQueue
              analysis={analysis}
              capturedPosts={posts}
              generation={generation}
              selectedPostBrief={selectedPostBrief}
            />
          }
          referenceShelf={
            <ReferenceShelf
              phase={phase}
              postCount={postCount}
              topPostText={topPost ? topPost.text : null}
              metricHealth={metricHealth}
              coveragePercent={coveragePercent}
              metricSummary={metricSummary}
              scanHistoryBrief={scanHistoryBrief}
              history={history}
              opportunityBrief={opportunityBrief}
              evidenceDetailsOpen={evidenceDetailsOpen}
              deferredCoachReport={
                analysis ? <CoachReport analysis={analysis} postCount={postCount} deferred /> : null
              }
              strategyEngineSection={strategyEngineSection}
              postBreakdownPanel={postBreakdownDeferred}
              actionProgressItems={actionProgressItems}
            />
          }
          recoveryNotices={
            <>
              {analysisError && <RecoveryNoticePanel kind="analysis" message={analysisError} />}
              {generationError && <RecoveryNoticePanel kind="generation" message={generationError} />}
              {memoryError && <RecoveryNoticePanel kind="memory" message={memoryError} />}
              {topicError && <RecoveryNoticePanel kind="topic" message={topicError} />}
            </>
          }
        />
      </main>

      {importOpen && (
        <Suspense fallback={null}>
          <DeferredManualImportPanel open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />
        </Suspense>
      )}
    </div>
  );
}