import { Check, Copy, Lightbulb, PenLine, RefreshCcw, Sparkles, Target, Zap } from "lucide-react";
import { useState } from "react";
import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { GenerationOutput } from "../../shared/generation-schema";

const queue = [
  { icon: Target, label: "Audit", value: "Run strategy audit" },
  { icon: Sparkles, label: "Generate", value: "Today's ideas" },
  { icon: Copy, label: "Export", value: "Copy drafts into X" }
];

const labModes = [
  { icon: Sparkles, label: "Generate today's ideas", enabled: true },
  { icon: Zap, label: "Posts like top performer", enabled: false },
  { icon: RefreshCcw, label: "Rewrite selected post", enabled: false },
  { icon: Target, label: "Contrarian angles", enabled: false }
];

export function NextPostQueue({
  analysis,
  generation,
  generating,
  onGenerateToday
}: {
  analysis: AnalysisOutput | null;
  generation: GenerationOutput | null;
  generating: boolean;
  onGenerateToday: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyDraft(id: string, text: string) {
    await navigator.clipboard?.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1400);
  }

  return (
    <section className="panel next-posts" aria-labelledby="next-posts-title">
      <div className="section-head post-lab-head">
        <div>
          <p className="eyebrow">Post Lab</p>
          <h2 id="next-posts-title">{generation ? "Today's generated posts" : analysis ? "Ready to generate" : "Waiting on audit"}</h2>
        </div>
        <span className="status-chip">{generation ? `${generation.posts.length} drafts` : analysis ? "Audit ready" : "Locked"}</span>
      </div>

      <div className="post-lab-actions" aria-label="Post generation modes">
        {labModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              className={mode.enabled ? "lab-action is-primary" : "lab-action"}
              disabled={!analysis || generating || !mode.enabled}
              key={mode.label}
              onClick={mode.enabled ? onGenerateToday : undefined}
              type="button"
            >
              <Icon size={16} aria-hidden="true" />
              <span>{mode.label}</span>
              {!mode.enabled && <small>Next</small>}
            </button>
          );
        })}
      </div>

      {!analysis && (
        <div className="idea-list">
          {queue.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label}>
                <Icon size={17} aria-hidden="true" />
                <div>
                  <span>{item.label}</span>
                  <p>{item.value}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {analysis && !generation && (
        <div className="idea-list starter-list">
          {analysis.next_post_ideas.map((idea) => (
            <article className="idea-card" key={idea.title}>
              <Lightbulb size={17} aria-hidden="true" />
              <div>
                <span>{idea.title}</span>
                <p className="idea-hook">{idea.hook}</p>
                <small>{idea.reason}</small>
              </div>
            </article>
          ))}
        </div>
      )}

      {generation && (
        <div className="idea-list generated-list">
          {generation.posts.map((post, index) => {
            const copyId = `${post.title}-${index}`;
            return (
              <article className="idea-card generated-post-card" key={copyId}>
                <PenLine size={17} aria-hidden="true" />
                <div>
                  <span>{post.title}</span>
                  <p className="idea-hook">{post.hook}</p>
                  <p className="source-signal">{post.source_signal}</p>
                  <p className="idea-draft">{post.draft}</p>
                  <small>{post.why_this}</small>
                  <button className="copy-button" type="button" onClick={() => void copyDraft(copyId, post.draft)}>
                    {copied === copyId ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    {copied === copyId ? "Copied" : "Copy draft"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
