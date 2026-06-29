import { Check, Compass, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AnalysisSummary } from "../../shared/analysis-schema";
import type { TopicExplorationOutput } from "../../shared/strategy-intelligence-schema";

export function TopicExplorer({
  analysis,
  exploration,
  exploring,
  onExplore
}: {
  analysis: AnalysisSummary | null;
  exploration: TopicExplorationOutput | null;
  exploring: boolean;
  onExplore: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyDraft(id: string, text: string) {
    await navigator.clipboard?.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1400);
  }

  return (
    <section className="panel topic-panel" aria-labelledby="topic-explorer-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Topic Explorer</p>
          <h2 id="topic-explorer-title">{exploration ? "Nearby lanes" : "Explore from the audit"}</h2>
        </div>
        <span className="status-chip">{exploration ? `${exploration.topics.length} topics` : analysis ? "Ready" : "Locked"}</span>
      </div>

      <div className="topic-actions">
        <button
          className="primary-button"
          type="button"
          disabled={!analysis || exploring}
          onClick={onExplore}
          aria-busy={exploring || undefined}
        >
          <Compass size={16} aria-hidden="true" /> {exploring ? "Exploring" : "Explore nearby topics"}
        </button>
      </div>

      {!analysis && (
        <div className="memory-empty">
          <Sparkles size={18} aria-hidden="true" />
          <p>Run an audit first so topic exploration can stay near your actual signal.</p>
        </div>
      )}

      {analysis && !exploration && (
        <div className="memory-empty">
          <Sparkles size={18} aria-hidden="true" />
          <p>Find adjacent ideas that stay close to the lanes already working in your posts.</p>
        </div>
      )}

      {exploration && (
        <div className="topic-list">
          {exploration.topics.map((topic, index) => {
            const copyId = `${topic.title}-${index}`;
            return (
              <article className="topic-card" key={copyId}>
                <div className="topic-card-top">
                  <span>{topic.lane}</span>
                  <small>{topic.risk} risk</small>
                </div>
                <h3>{topic.title}</h3>
                <p>{topic.why_near}</p>
                <div className="topic-hooks">
                  {topic.hooks.map((hook) => (
                    <span key={hook}>{hook}</span>
                  ))}
                </div>
                <p className="idea-draft">{topic.draft}</p>
                <small>{topic.evidence.join(" ")}</small>
                <button className="copy-button" type="button" onClick={() => void copyDraft(copyId, topic.draft)}>
                  {copied === copyId ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copied === copyId ? "Copied" : "Copy draft"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
