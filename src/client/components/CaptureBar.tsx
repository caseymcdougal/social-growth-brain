import { RefreshCcw, Upload, Wand2 } from "lucide-react";
import type { MetricCompletenessSummary } from "../../shared/performance";
import type { CapturedAccountSnapshot } from "../../shared/types";

export function CaptureBar(props: {
  snapshot: CapturedAccountSnapshot | null;
  metricSummary: MetricCompletenessSummary;
  loading: boolean;
  capturing: boolean;
  analyzing: boolean;
  error: string | null;
  status: string | null;
  onAnalyze: () => void;
  onCapture: () => void;
  onOpenImport: () => void;
}) {
  const capturedAt = props.snapshot?.profile.capturedAt
    ? new Date(props.snapshot.profile.capturedAt).toLocaleString()
    : "No capture yet";
  const handle = props.snapshot ? `@${props.snapshot.profile.handle}` : "No local snapshot";
  const postCount = props.snapshot?.posts.length ?? 0;
  const postLabel = postCount === 1 ? "post" : "posts";
  const coverage = Math.round(props.metricSummary.completenessRatio * 100);

  return (
    <section className="capture-bar" aria-label="Capture status">
      <div className="capture-summary">
        <p className="eyebrow">Capture</p>
        <h2>{handle}</h2>
        <p>
          {capturedAt} / {postCount} {postLabel} / {coverage}% stat coverage
        </p>
        {props.status && <p className="inline-status">{props.status}</p>}
        {props.error && <p className="inline-error">{props.error}</p>}
      </div>
      <div className="capture-actions">
        <button className="secondary-button" type="button" onClick={props.onOpenImport}>
          <Upload size={16} aria-hidden="true" /> Paste snapshot
        </button>
        <button className="secondary-button" type="button" onClick={props.onCapture} disabled={props.loading || props.capturing || props.analyzing}>
          <RefreshCcw size={16} aria-hidden="true" /> {props.capturing ? "Scanning X" : "Scan public metrics"}
        </button>
        <button className="primary-button" type="button" disabled={!props.snapshot || props.analyzing || props.capturing || props.loading} onClick={props.onAnalyze}>
          <Wand2 size={16} aria-hidden="true" /> {props.analyzing ? "Auditing" : "Run strategy audit"}
        </button>
      </div>
    </section>
  );
}
