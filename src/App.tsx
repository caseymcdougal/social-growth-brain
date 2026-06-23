import { Crosshair, FileText, LockKeyhole, Radar, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import {
  analyzeLatestSnapshot,
  captureSnapshot,
  generateTodaysIdeas,
  getLatestAnalysis,
  getLatestGeneration,
  getLatestSnapshot,
  importSnapshot
} from "./client/api";
import { CaptureBar } from "./client/components/CaptureBar";
import { CoachReport } from "./client/components/CoachReport";
import { ManualImportPanel } from "./client/components/ManualImportPanel";
import { NextPostQueue } from "./client/components/NextPostQueue";
import { PostBreakdown } from "./client/components/PostBreakdown";
import type { AnalysisOutput } from "./shared/analysis-schema";
import type { GenerationOutput } from "./shared/generation-schema";
import { rankPostsByVisibleSignal, summarizeMetricCompleteness } from "./shared/performance";
import type { CapturedAccountSnapshot } from "./shared/types";

const auditSteps = [
  { icon: Radar, label: "Scan", detail: "Public X metrics" },
  { icon: TrendingUp, label: "Rank", detail: "Visible signal" },
  { icon: Crosshair, label: "Diagnose", detail: "Why it moved" },
  { icon: Sparkles, label: "Write", detail: "Next posts" }
];

export function App() {
  const [snapshot, setSnapshot] = useState<CapturedAccountSnapshot | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisOutput | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationOutput | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const postCount = snapshot?.posts.length ?? 0;
  const postLabel = postCount === 1 ? "post" : "posts";
  const posts = snapshot?.posts ?? [];
  const metricSummary = summarizeMetricCompleteness(posts);
  const rankedPosts = rankPostsByVisibleSignal(posts);
  const topPost = rankedPosts[0]?.post;

  async function refresh() {
    setLoading(true);
    setLoadError(null);
    try {
      const latestSnapshot = await getLatestSnapshot();
      setSnapshot(latestSnapshot);
      const latestAnalysis = latestSnapshot ? await getLatestAnalysis() : null;
      setAnalysis(latestAnalysis);
      setGeneration(latestAnalysis ? await getLatestGeneration() : null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load latest snapshot");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleImport(rawJson: string) {
    await importSnapshot(JSON.parse(rawJson));
    setAnalysis(null);
    setAnalysisError(null);
    setGeneration(null);
    setGenerationError(null);
    setCaptureError(null);
    await refresh();
  }

  async function handleCapture() {
    setCapturing(true);
    setCaptureError(null);
    setCaptureStatus("Opening X in Chrome and reading visible posts. This should finish in under a minute.");
    setAnalysis(null);
    setAnalysisError(null);
    setGeneration(null);
    setGenerationError(null);
    try {
      setSnapshot(await captureSnapshot());
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
    try {
      setAnalysis(await analyzeLatestSnapshot());
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

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Audit workflow">
        <div className="brand-lockup">
          <div className="brand-mark">
            <FileText size={18} aria-hidden="true" />
          </div>
          <div>
            <strong>Audit Room</strong>
            <span>Casey / X</span>
          </div>
        </div>
        <div className="step-rail" aria-label="Audit sequence">
          {auditSteps.map((item, index) => {
            const Icon = item.icon;
            return (
              <div className="step-row" key={item.label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon size={16} aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              </div>
            );
          })}
        </div>
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
            <p className="eyebrow">Private X strategy room</p>
            <h1>X Audit Cockpit</h1>
            <p className="topbar-copy">
              Rank the last public posts, separate strong signals from weak hooks, and turn the read into copy-ready ideas.
            </p>
          </div>
          <div className="run-status" aria-live="polite">
            <span className={loading ? "status-dot is-loading" : snapshot ? "status-dot" : "status-dot is-empty"} />
            {loading ? "Loading" : snapshot ? `${postCount} ${postLabel} ready` : "No capture"}
          </div>
        </header>

        <div className="mission-grid">
          <CaptureBar
            snapshot={snapshot}
            metricSummary={metricSummary}
            loading={loading}
            capturing={capturing}
            analyzing={analyzing}
            generating={generating}
            hasAnalysis={Boolean(analysis)}
            error={loadError ?? captureError}
            status={capturing ? captureStatus : null}
            onAnalyze={() => void handleAnalyze()}
            onCapture={() => void handleCapture()}
            onGenerateToday={() => void handleGenerateToday()}
            onOpenImport={() => setImportOpen(true)}
          />

          <section className="panel signal-panel" aria-label="Public metric signal">
            <p className="eyebrow">Signal</p>
            <h2>{Math.round(metricSummary.completenessRatio * 100)}% metric coverage</h2>
            <div className="signal-meter" aria-hidden="true">
              <span style={{ width: `${Math.round(metricSummary.completenessRatio * 100)}%` }} />
            </div>
            <dl className="signal-list">
              <div>
                <dt>Fields read</dt>
                <dd>
                  {metricSummary.capturedFields}/{metricSummary.totalFields || 0}
                </dd>
              </div>
              <div>
                <dt>Posts with stats</dt>
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
        </div>

        {analysisError && <section className="panel error-panel">{analysisError}</section>}
        {generationError && <section className="panel error-panel">{generationError}</section>}

        <div className="dashboard-grid">
          <CoachReport analysis={analysis} postCount={postCount} />
          <NextPostQueue
            analysis={analysis}
            generation={generation}
            generating={generating}
            onGenerateToday={() => void handleGenerateToday()}
          />
        </div>

        <PostBreakdown rankedPosts={rankedPosts} analysis={analysis} />
      </main>

      <ManualImportPanel open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />
    </div>
  );
}
