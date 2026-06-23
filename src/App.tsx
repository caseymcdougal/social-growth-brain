import { BarChart3, Bot, ClipboardList, Radio, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { analyzeLatestSnapshot, captureSnapshot, getLatestSnapshot, importSnapshot } from "./client/api";
import { CaptureBar } from "./client/components/CaptureBar";
import { CoachReport } from "./client/components/CoachReport";
import { ManualImportPanel } from "./client/components/ManualImportPanel";
import { NextPostQueue } from "./client/components/NextPostQueue";
import { PostBreakdown } from "./client/components/PostBreakdown";
import type { AnalysisOutput } from "./shared/analysis-schema";
import type { CapturedAccountSnapshot } from "./shared/types";

const auditSteps = [
  { icon: Radio, label: "Capture", detail: "X or JSON" },
  { icon: Bot, label: "Diagnose", detail: "Codex CLI" },
  { icon: ClipboardList, label: "Draft", detail: "Hooks + rewrites" }
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
  const postCount = snapshot?.posts.length ?? 0;
  const postLabel = postCount === 1 ? "post" : "posts";

  async function refresh() {
    setLoading(true);
    setLoadError(null);
    try {
      setSnapshot(await getLatestSnapshot());
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
    setCaptureError(null);
    await refresh();
  }

  async function handleCapture() {
    setCapturing(true);
    setCaptureError(null);
    setCaptureStatus("Opening X in Chrome and reading visible posts. This should finish in under a minute.");
    setAnalysis(null);
    setAnalysisError(null);
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
    try {
      setAnalysis(await analyzeLatestSnapshot());
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand-lockup">
          <div className="brand-mark">
            <BarChart3 size={19} aria-hidden="true" />
          </div>
          <div>
            <strong>Social Audit</strong>
            <span>Private X review</span>
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
          <ShieldCheck size={17} aria-hidden="true" />
          <div>
            <strong>Local-only</strong>
            <span>No X API key or analytics-panel scraping.</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Casey / X audit</p>
            <h1>Audit workspace</h1>
            <p className="topbar-copy">Capture visible post signals, run a hidden Codex diagnosis, and keep the recommendations in this local app.</p>
          </div>
          <div className="run-status" aria-live="polite">
            <span className={loading ? "status-dot is-loading" : snapshot ? "status-dot" : "status-dot is-empty"} />
            {loading ? "Loading" : snapshot ? `${postCount} ${postLabel} ready` : "No capture"}
          </div>
        </header>

        <CaptureBar
          snapshot={snapshot}
          loading={loading}
          capturing={capturing}
          analyzing={analyzing}
          error={loadError ?? captureError}
          status={capturing ? captureStatus : null}
          onAnalyze={() => void handleAnalyze()}
          onCapture={() => void handleCapture()}
          onOpenImport={() => setImportOpen(true)}
        />

        {analysisError && <section className="panel error-panel">{analysisError}</section>}

        <div className="dashboard-grid">
          <CoachReport analysis={analysis} />
          <NextPostQueue analysis={analysis} />
        </div>

        <PostBreakdown snapshot={snapshot} analysis={analysis} />
      </main>

      <ManualImportPanel open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />
    </div>
  );
}
