import { Activity } from "lucide-react";
import { buildScanHistoryBrief, formatScanHistoryDelta } from "../../shared/scan-history";
import type { CapturedAccountSnapshot } from "../../shared/types";

function formatScanDate(value: string | null) {
  if (!value) return "No scan";
  return new Date(value).toLocaleDateString();
}

function formatCurrentCount(value: number | null) {
  return value === null ? "n/a" : value.toLocaleString();
}

export function ScanHistoryPanel({ history }: { history: CapturedAccountSnapshot[] }) {
  const brief = buildScanHistoryBrief(history);
  const currentDate = formatScanDate(brief.current.capturedAt);
  const previousDate = formatScanDate(brief.previous?.capturedAt ?? null);

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
          <strong>{formatScanHistoryDelta(brief.deltas.medianSignal)}</strong>
          <small>{brief.current.medianSignal} current</small>
        </article>
        <article>
          <span>Followers</span>
          <strong>{formatScanHistoryDelta(brief.deltas.followers)}</strong>
          <small>{formatCurrentCount(brief.current.followersCount)} now</small>
        </article>
        <article>
          <span>Coverage</span>
          <strong>{brief.current.metricCoveragePercent}%</strong>
          <small>
            {currentDate} vs {previousDate}
          </small>
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
