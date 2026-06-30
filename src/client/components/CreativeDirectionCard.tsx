import { Check, Compass } from "lucide-react";
import { useState } from "react";
import type { CreativeDirection } from "../api";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function CreativeDirectionCard({
  initial,
  onSave
}: {
  initial: CreativeDirection;
  onSave: (text: string) => Promise<CreativeDirection>;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [updatedAt, setUpdatedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedText, setSavedText] = useState(initial?.text ?? "");
  const isDirty = text.trim() !== savedText.trim();

  async function handleSave() {
    setSaving(true);
    try {
      const result = await onSave(text);
      setUpdatedAt(result?.updatedAt ?? null);
      setText(result?.text ?? "");
      setSavedText(result?.text ?? "");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel direction-card" aria-label="Creative direction">
      <div className="direction-head">
        <p className="eyebrow">
          <Compass size={13} aria-hidden="true" /> Creative direction
        </p>
        <h2>Steer what gets generated</h2>
        <p>Plain-language guidance fed into every idea, topic, and memory run.</p>
      </div>
      <textarea
        className="direction-input"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="e.g. Move away from crypto takes. Lean into build-in-public and tooling."
        rows={3}
        aria-label="Creative direction text"
      />
      <div className="direction-foot">
        <span aria-live="polite">{updatedAt ? `Updated ${relativeTime(updatedAt)}` : "Not set"}</span>
        <button
          className={saved ? "secondary-button direction-save is-saved" : "secondary-button direction-save"}
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !isDirty}
          aria-busy={saving || undefined}
        >
          <Check size={16} aria-hidden="true" /> {saving ? "Saving" : saved ? "Saved" : "Save direction"}
        </button>
      </div>
    </section>
  );
}
