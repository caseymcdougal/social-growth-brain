import { Check, Copy, Lightbulb, PenLine, Target } from "lucide-react";
import { useState } from "react";
import type { AnalysisOutput } from "../../shared/analysis-schema";

const queue = [
  { icon: Lightbulb, label: "Hook", value: "Run an audit to generate hooks" },
  { icon: Target, label: "Why", value: "Each idea includes the rationale" },
  { icon: PenLine, label: "Draft", value: "Draft copy appears after analysis" }
];

export function NextPostQueue({ analysis }: { analysis: AnalysisOutput | null }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyDraft(id: string, text: string) {
    await navigator.clipboard?.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1400);
  }

  if (!analysis) {
    return (
      <section className="panel next-posts" aria-labelledby="next-posts-title">
        <p className="eyebrow">Idea studio</p>
        <h2 id="next-posts-title">No drafts yet</h2>
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
      </section>
    );
  }

  return (
    <section className="panel next-posts" aria-labelledby="next-posts-title">
      <p className="eyebrow">Idea studio</p>
      <h2 id="next-posts-title">Recommended posts</h2>
      <div className="idea-list">
        {analysis.next_post_ideas.map((idea, index) => (
          <article className="idea-card" key={idea.title}>
            <Lightbulb size={17} aria-hidden="true" />
            <div>
              <span>{idea.title}</span>
              <p className="idea-hook">{idea.hook}</p>
              <p className="idea-draft">{idea.draft}</p>
              <small>{idea.reason}</small>
              <button className="copy-button" type="button" onClick={() => void copyDraft(`${idea.title}-${index}`, idea.draft)}>
                {copied === `${idea.title}-${index}` ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                {copied === `${idea.title}-${index}` ? "Copied" : "Copy draft"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
