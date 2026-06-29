import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import {
  formatOpportunityBriefForClipboard,
  type OpportunityBrief,
  type OpportunityCard
} from "../../shared/opportunities";

function OpportunityCardView({ card }: { card: OpportunityCard }) {
  return (
    <article className="opportunity-card" data-kind={card.kind}>
      <div className="opportunity-card-top">
        <span>{card.label}</span>
        {card.postUrl && (
          <a href={card.postUrl} target="_blank" rel="noreferrer" aria-label={`Open ${card.title} on X`}>
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>
      <h3>{card.title}</h3>
      <p>{card.detail}</p>
      <small>{card.evidence}</small>
    </article>
  );
}

export function OpportunityDesk({ brief, deferred = false }: { brief: OpportunityBrief; deferred?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyBrief() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(formatOpportunityBriefForClipboard(brief));
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 1800);
    }
  }

  const priorityContent = (
    <>
      <div className="opportunity-command">
        <div>
          <p className="eyebrow">Decision support</p>
          <h2 id="priority-signals-title">Priority signals</h2>
          <p>Use these cards to see what to repeat, what to repair, and how much to trust the current read.</p>
        </div>
        <button className="copy-button opportunity-copy" type="button" onClick={() => void copyBrief()}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied brief" : copyFailed ? "Copy unavailable" : "Copy priority brief"}
        </button>
      </div>

      <div className="opportunity-grid" aria-label="Priority signals">
        {brief.priorityCards.map((card) => (
          <OpportunityCardView card={card} key={`${card.kind}-${card.postId ?? card.title}`} />
        ))}
      </div>
    </>
  );

  if (deferred) {
    return (
      <details className="panel opportunity-desk opportunity-disclosure" aria-label="Decision support">
        <summary>
          <span>Decision support</span>
          <strong>{brief.priorityCards.length} priority signals</strong>
          <small>Open for repeat, repair, and evidence confidence after you review the draft.</small>
        </summary>
        {priorityContent}
      </details>
    );
  }

  return (
    <section className="panel opportunity-desk" aria-labelledby="priority-signals-title">
      {priorityContent}
    </section>
  );
}
