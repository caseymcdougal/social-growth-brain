import { Suspense, type ReactNode } from "react";
import type { MetricCompletenessSummary } from "../../shared/performance";
import type { ScanHistoryBrief } from "../../shared/scan-history";
import type { WorkflowPhase } from "../../shared/workflow-phase";
import type { CapturedAccountSnapshot } from "../../shared/types";
import type { OpportunityBrief } from "../../shared/opportunities";
import { ActionProgressPanel, type ActionProgressItem } from "./ActionProgressPanel";
import { OpportunityDesk } from "./OpportunityDesk";
import { ScanHistoryPanel } from "./ScanHistoryPanel";

export function ReferenceShelf({
  phase,
  postCount,
  topPostText,
  metricHealth,
  coveragePercent,
  metricSummary,
  scanHistoryBrief,
  history,
  opportunityBrief,
  evidenceDetailsOpen,
  deferredCoachReport,
  strategyEngineSection,
  postBreakdownPanel,
  actionProgressItems
}: {
  phase: WorkflowPhase;
  postCount: number;
  topPostText: string | null;
  metricHealth: string;
  coveragePercent: number;
  metricSummary: MetricCompletenessSummary;
  scanHistoryBrief: ScanHistoryBrief;
  history: CapturedAccountSnapshot[];
  opportunityBrief: OpportunityBrief;
  evidenceDetailsOpen: boolean;
  deferredCoachReport: ReactNode | null;
  strategyEngineSection: ReactNode;
  postBreakdownPanel: ReactNode | null;
  actionProgressItems: ActionProgressItem[];
}) {
  if (phase !== "audited" && phase !== "drafted") return null;

  return (
    <section className="reference-shelf" aria-label="Reference panels">
      <div className="reference-shelf-head">
        <p className="eyebrow">Go deeper</p>
        <span>Optional detail when you want to dig into numbers or advanced tools.</span>
      </div>

      {phase === "drafted" && (
        <>
          <OpportunityDesk brief={opportunityBrief} deferred />
          {deferredCoachReport}
        </>
      )}

      <details
        className="disclosure disclosure-panel evidence-details-panel"
        aria-label="How this was built"
        open={evidenceDetailsOpen}
      >
        <summary>
          <span>How this was built</span>
          <strong>
            {metricHealth} · {coveragePercent}% of metrics captured
          </strong>
          <small>{scanHistoryBrief.summary}</small>
        </summary>
        <div className="operations-grid" aria-label="Scan history and data quality">
          <ScanHistoryPanel history={history} />
          <section className="panel signal-panel" aria-label="Data quality">
            <p className="eyebrow">Data quality</p>
            <h2>{metricHealth}</h2>
            <div className="signal-meter" aria-hidden="true">
              <span style={{ width: `${coveragePercent}%` }} />
            </div>
            <dl className="signal-list">
              <div>
                <dt>Metrics captured</dt>
                <dd>
                  {coveragePercent}% · {metricSummary.capturedFields}/{metricSummary.totalFields || 0}
                </dd>
              </div>
              <div>
                <dt>Posts with metrics</dt>
                <dd>
                  {metricSummary.postsWithAnyMetrics}/{postCount}
                </dd>
              </div>
              <div>
                <dt>Your top post</dt>
                <dd>{topPostText ?? "Scan to see"}</dd>
              </div>
            </dl>
          </section>
          <ActionProgressPanel actions={actionProgressItems} />
        </div>
      </details>

      <Suspense fallback={null}>
        {strategyEngineSection}
        {phase === "drafted" && postBreakdownPanel}
      </Suspense>
    </section>
  );
}