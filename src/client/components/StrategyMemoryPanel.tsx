import { Brain, CheckCircle2, RotateCcw } from "lucide-react";
import type { StrategyMemory } from "../../shared/strategy-intelligence-schema";
import type { StrategyMemoryProposal } from "../api";
import type { AnalysisSummary } from "../../shared/analysis-schema";

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="memory-chip-list">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

export function StrategyMemoryPanel({
  analysis,
  memory,
  proposal,
  updating,
  applying,
  onRefresh,
  onApply
}: {
  analysis: AnalysisSummary | null;
  memory: StrategyMemory | null;
  proposal: StrategyMemoryProposal | null;
  updating: boolean;
  applying: boolean;
  onRefresh: () => void;
  onApply: (proposalId: number) => void;
}) {
  return (
    <section className="panel memory-panel" aria-labelledby="strategy-memory-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Strategy Memory</p>
          <h2 id="strategy-memory-title">{memory ? "Accepted context" : proposal ? "Proposed context" : "No memory yet"}</h2>
        </div>
        <span className="status-chip">{proposal ? "Proposal" : memory ? "Applied" : analysis ? "Ready" : "Locked"}</span>
      </div>

      <div className="memory-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={!analysis || updating || applying}
          onClick={onRefresh}
          aria-busy={updating || undefined}
        >
          <RotateCcw size={16} aria-hidden="true" /> {updating ? "Updating memory" : "Update strategy memory"}
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={!proposal || updating || applying}
          onClick={() => proposal && onApply(proposal.id)}
          aria-busy={applying || undefined}
        >
          <CheckCircle2 size={16} aria-hidden="true" /> {applying ? "Applying" : "Apply memory updates"}
        </button>
      </div>

      {!analysis && (
        <div className="memory-empty">
          <Brain size={18} aria-hidden="true" />
          <p>Run a strategy audit before updating the local context engine.</p>
        </div>
      )}

      {analysis && !memory && !proposal && (
        <div className="memory-empty">
          <Brain size={18} aria-hidden="true" />
          <p>Generate a proposed memory from the latest audit. You decide when it becomes accepted context.</p>
        </div>
      )}

      {(proposal?.memory ?? memory) && (
        <div className="memory-block">
          <span>Positioning</span>
          <p>{(proposal?.memory ?? memory)?.positioning}</p>
          <span>Strong lanes</span>
          <ChipList items={(proposal?.memory ?? memory)?.strongest_lanes ?? []} />
          <span>Voice rules</span>
          <ChipList items={(proposal?.memory ?? memory)?.voice_rules ?? []} />
        </div>
      )}

      {proposal && (
        <div className="proposal-list">
          {proposal.updates.map((update) => (
            <article key={`${update.area}-${update.proposed}`}>
              <span>{update.area}</span>
              <p>{update.proposed}</p>
              <small>{update.evidence}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
