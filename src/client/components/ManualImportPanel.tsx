import { X } from "lucide-react";
import { useState } from "react";

export function ManualImportPanel(props: {
  open: boolean;
  onClose: () => void;
  onImport: (rawJson: string) => Promise<void>;
}) {
  const [rawJson, setRawJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  if (!props.open) return null;

  async function submit() {
    setImporting(true);
    setError(null);
    try {
      await props.onImport(rawJson);
      setRawJson("");
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="manual-import-title" aria-busy={importing || undefined}>
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">Fallback Input</p>
            <h2 id="manual-import-title">Paste public snapshot</h2>
          </div>
          <button className="icon-button" type="button" onClick={props.onClose} aria-label="Close manual import">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <textarea
          aria-label="Snapshot JSON"
          value={rawJson}
          onChange={(event) => setRawJson(event.target.value)}
          rows={12}
          spellCheck={false}
          placeholder='{"profile": {"handle": "caseymcdougal"}, "posts": [...]}'
        />
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={submit}
            disabled={importing || !rawJson.trim()}
            aria-busy={importing || undefined}
          >
            {importing ? "Importing" : "Import public snapshot"}
          </button>
        </div>
      </section>
    </div>
  );
}
