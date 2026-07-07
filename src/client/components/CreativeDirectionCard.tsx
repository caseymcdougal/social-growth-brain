import { Compass, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CreativeDirectionEntry } from "../api";

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
  directions,
  onAdd,
  onDelete
}: {
  directions: CreativeDirectionEntry[];
  onAdd: (text: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const canAdd = text.trim().length > 0;

  async function handleAdd() {
    if (!canAdd) return;
    setSaving(true);
    try {
      await onAdd(text);
      setText("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="panel direction-card direction-card-embedded" aria-label="Creative direction">
      <div className="direction-head">
        <p className="eyebrow">
          <Compass size={13} aria-hidden="true" /> Creative direction
        </p>
        <h2>Steer what gets generated</h2>
        <p>Plain-language guidance fed into every idea, topic, and memory run. All saved directions apply.</p>
      </div>
      <textarea
        className="direction-input"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="e.g. Move away from crypto takes. Lean into build-in-public and tooling."
        rows={2}
        aria-label="New creative direction"
      />
      <div className="direction-foot">
        <span aria-live="polite">
          {directions.length === 0
            ? "Not set"
            : `${directions.length} ${directions.length === 1 ? "direction" : "directions"} active`}
        </span>
        <button
          className="secondary-button direction-save"
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving || !canAdd}
          aria-busy={saving || undefined}
        >
          <Plus size={16} aria-hidden="true" /> {saving ? "Adding" : "Add direction"}
        </button>
      </div>
      {directions.length > 0 && (
        <ul className="direction-list" aria-label="Saved directions">
          {directions.map((entry) => (
            <li className="direction-entry" key={entry.id}>
              <div>
                <p>{entry.text}</p>
                <small>Added {relativeTime(entry.updatedAt)}</small>
              </div>
              <button
                className="direction-delete"
                type="button"
                onClick={() => void handleDelete(entry.id)}
                disabled={deletingId === entry.id}
                aria-label={`Delete direction: ${entry.text.slice(0, 40)}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
