import { Activity, BarChart3, Bot, ClipboardList, Lightbulb, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { analyzeLatestSnapshot, getLatestSnapshot, importSnapshot } from "./client/api";
import { CaptureBar } from "./client/components/CaptureBar";
import { CoachReport } from "./client/components/CoachReport";
import { ManualImportPanel } from "./client/components/ManualImportPanel";
import { NextPostQueue } from "./client/components/NextPostQueue";
import { PostBreakdown } from "./client/components/PostBreakdown";
import type { AnalysisOutput } from "./shared/analysis-schema";
import type { CapturedAccountSnapshot } from "./shared/types";

const navItems = [
  { icon: Activity, label: "Capture", active: true },
  { icon: Bot, label: "Coach" },
  { icon: ClipboardList, label: "Posts" },
  { icon: Lightbulb, label: "Ideas" }
];

export function App() {
  const [snapshot, setSnapshot] = useState<CapturedAccountSnapshot | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    await refresh();
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
            <span>Local dashboard</span>
          </div>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a href={`#${item.label.toLowerCase()}`} aria-current={item.active ? "page" : undefined} key={item.label}>
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="privacy-note">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>Browser session and Codex CLI stay local.</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">X Strategy Room</p>
            <h1>Analyze recent posts</h1>
          </div>
          <div className="run-status" aria-live="polite">
            <span className={loading ? "status-dot is-loading" : "status-dot"} />
            {loading ? "Loading" : snapshot ? `${postCount} ${postLabel} ready` : "No capture"}
          </div>
        </header>

        <CaptureBar
          snapshot={snapshot}
          loading={loading}
          analyzing={analyzing}
          error={loadError}
          onAnalyze={() => void handleAnalyze()}
          onOpenImport={() => setImportOpen(true)}
          onRefresh={() => void refresh()}
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
