import { Activity } from "lucide-react";
import { buildScanHistoryBrief, formatScanHistoryDelta } from "../../shared/scan-history";
import type { CapturedAccountSnapshot } from "../../shared/types";

function formatCurrentCount(value: number | null) {
  return value === null ? "n/a" : value.toLocaleString();
}

function deltaDirection(value: number | null) {
  if (value === null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

// Same-day scans read as "7/5 vs 7/5", which looks broken. Fall back to time when the dates match,
// and to a single baseline line when there is no previous scan to compare against.
function formatScanWindow(currentAt: string | null, previousAt: string | null) {
  if (!currentAt) return "Awaiting first scan";
  const current = new Date(currentAt);
  if (!previousAt) return `Baseline · ${current.toLocaleDateString()}`;
  const previous = new Date(previousAt);
  const sameDay = current.toLocaleDateString() === previous.toLocaleDateString();
  const fmt = (date: Date) =>
    sameDay ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString();
  return `${fmt(previous)} → ${fmt(current)}`;
}

export function ScanHistoryPanel({ history }: { history: CapturedAccountSnapshot[] }) {
  const brief = buildScanHistoryBrief(history);
  const scanWindow = formatScanWindow(brief.current.capturedAt, brief.previous?.capturedAt ?? null);

  return (
    <section className="panel trend-panel" aria-label="Scan history trend">
      <div className="trend-panel-head">
        <div>
          <p className="eyebrow">Scan history</p>
          <h2>Trendline</h2>
        </div>
        <Activity size={18} aria-hidden="true" />
      </div>
      <p className="trend-summary">{brief.summary}</p>
      <div className="trend-kpis" aria-label="Scan trend deltas">
        <article>
          <span>Median signal</span>
          <strong>{brief.current.medianSignal}</strong>
          <small className="trend-delta" data-dir={deltaDirection(brief.deltas.medianSignal)}>
            {formatScanHistoryDelta(brief.deltas.medianSignal)} vs last
          </small>
        </article>
        <article>
          <span>Followers</span>
          <strong>{formatCurrentCount(brief.current.followersCount)}</strong>
          <small className="trend-delta" data-dir={deltaDirection(brief.deltas.followers)}>
            {formatScanHistoryDelta(brief.deltas.followers)} vs last
          </small>
        </article>
        <article>
          <span>Coverage</span>
          <strong>{brief.current.metricCoveragePercent}%</strong>
          <small>{scanWindow}</small>
        </article>
      </div>
      <div className="trend-shift" data-status={brief.topPostShift.status}>
        <span>{brief.topPostShift.label}</span>
        <strong>{brief.topPostShift.currentTitle}</strong>
        <small>{brief.nextAction}</small>
      </div>
    </section>
  );
}
