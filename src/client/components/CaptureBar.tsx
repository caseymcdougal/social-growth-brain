import { RefreshCcw, Upload, Wand2 } from "lucide-react";
import type { CapturedAccountSnapshot } from "../../shared/types";

export function CaptureBar(props: {
  snapshot: CapturedAccountSnapshot | null;
  loading: boolean;
  analyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
  onOpenImport: () => void;
  onRefresh: () => void;
}) {
  const capturedAt = props.snapshot?.profile.capturedAt
    ? new Date(props.snapshot.profile.capturedAt).toLocaleString()
    : "No capture yet";
  const handle = props.snapshot ? `@${props.snapshot.profile.handle}` : "X account snapshot";
  const postCount = props.snapshot?.posts.length ?? 0;
  const postLabel = postCount === 1 ? "post" : "posts";

  return (
    <section className="capture-bar" aria-label="Capture status">
      <div className="capture-summary">
        <p className="eyebrow">Capture</p>
        <h2>{handle}</h2>
        <p>
          {capturedAt} · {postCount} {postLabel} loaded
        </p>
        {props.error && <p className="inline-error">{props.error}</p>}
      </div>
      <div className="capture-actions">
        <button className="secondary-button" type="button" onClick={props.onOpenImport}>
          <Upload size={16} aria-hidden="true" /> Import manually
        </button>
        <button className="secondary-button" type="button" onClick={props.onRefresh} disabled={props.loading}>
          <RefreshCcw size={16} aria-hidden="true" /> Refresh
        </button>
        <button className="primary-button" type="button" disabled={!props.snapshot || props.analyzing} onClick={props.onAnalyze}>
          <Wand2 size={16} aria-hidden="true" /> {props.analyzing ? "Analyzing" : "Analyze Recent Posts"}
        </button>
      </div>
    </section>
  );
}
