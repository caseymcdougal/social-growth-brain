import { AlertTriangle, Check, Copy, FlaskConical, Gauge, TrendingUp } from "lucide-react";
import { useState } from "react";
import {
  buildExperimentLedger,
  formatExperimentLedgerForClipboard,
  type ExperimentLedgerItemStatus
} from "../../shared/experiment-ledger";
import type { AnalysisSummary } from "../../shared/analysis-schema";
import type { ScanHistoryBrief } from "../../shared/scan-history";
import type { StrategyMemory } from "../../shared/strategy-intelligence-schema";

function StatusIcon({ status }: { status: ExperimentLedgerItemStatus }) {
  if (status === "winning") return <TrendingUp size={14} aria-hidden="true" />;
  if (status === "needs-review") return <AlertTriangle size={14} aria-hidden="true" />;
  return <Gauge size={14} aria-hidden="true" />;
}

export function ExperimentLedgerPanel({
  analysis,
  memory,
  scanHistory
}: {
  analysis: AnalysisSummary | null;
  memory: StrategyMemory | null;
  scanHistory: ScanHistoryBrief;
}) {
  const ledger = buildExperimentLedger({ analysis, memory, scanHistory });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyBrief() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(formatExperimentLedgerForClipboard(ledger));
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 1800);
    }
  }

  return (
    <section className="panel experiment-panel" aria-label="Experiment ledger">
      <div className="section-head">
        <div>
          <p className="eyebrow">Experiment ledger</p>
          <h2 id="experiment-ledger-title">Hypothesis tracker</h2>
        </div>
        <span className="status-chip">{ledger.statusLabel}</span>
      </div>

      <p className="experiment-summary">{ledger.summary}</p>

      <div className="experiment-copy-row">
        <button className="copy-button" type="button" disabled={ledger.items.length === 0} onClick={() => void copyBrief()}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied brief" : copyFailed ? "Copy unavailable" : "Copy experiment brief"}
        </button>
      </div>

      {ledger.items.length === 0 ? (
        <div className="memory-empty">
          <FlaskConical size={18} aria-hidden="true" />
          <p>Run an audit or apply strategy memory to start tracking hypotheses against scans.</p>
        </div>
      ) : (
        <div className="experiment-list">
          {ledger.items.map((item) => (
            <article className="experiment-card" data-status={item.status} key={item.id}>
              <div className="experiment-card-top">
                <span>{item.sourceLabel}</span>
                <strong className="experiment-status" data-status={item.status}>
                  <StatusIcon status={item.status} />
                  {item.statusLabel}
                </strong>
              </div>
              <h3>{item.hypothesis}</h3>
              <div className="experiment-meta">
                <span>{item.trendLabel}</span>
              </div>
              <p>{item.evidence}</p>
              <small>{item.nextAction}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
