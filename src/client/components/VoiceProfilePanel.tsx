import { AudioLines, Check, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { getVoiceProfile, refreshVoiceProfile, saveVoiceOverrides, type VoiceProfileState } from "../api";

function RuleList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="memory-block">
      <span>{title}</span>
      <ul className="voice-rule-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function VoiceProfilePanel({ hasSnapshot }: { hasSnapshot: boolean }) {
  const [state, setState] = useState<VoiceProfileState | null>(null);
  const [overridesDraft, setOverridesDraft] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVoiceProfile()
      .then((loaded) => {
        if (cancelled) return;
        setState(loaded);
        setOverridesDraft(loaded.overrides);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load voice profile");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const next = await refreshVoiceProfile();
      setState(next);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Voice derivation failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSaveOverrides() {
    setSaving(true);
    setError(null);
    try {
      const overrides = await saveVoiceOverrides(overridesDraft);
      setState((current) => (current ? { ...current, overrides } : current));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save voice notes");
    } finally {
      setSaving(false);
    }
  }

  const profile = state?.profile ?? null;

  return (
    <section className="panel memory-panel voice-panel" aria-labelledby="voice-profile-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Voice Profile</p>
          <h2 id="voice-profile-title">{profile ? "How you write" : "No voice profile yet"}</h2>
        </div>
        <span className="status-chip">
          {profile && state?.derivedAt ? `Derived ${new Date(state.derivedAt).toLocaleDateString()}` : hasSnapshot ? "Ready" : "Locked"}
        </span>
      </div>

      <div className="memory-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={!hasSnapshot || refreshing}
          onClick={() => void handleRefresh()}
          aria-busy={refreshing || undefined}
        >
          <RotateCcw size={16} aria-hidden="true" /> {refreshing ? "Reading your posts" : profile ? "Re-derive from posts" : "Derive from my posts"}
        </button>
      </div>

      {error && <p className="voice-error" role="alert">{error}</p>}

      {!hasSnapshot && (
        <div className="memory-empty">
          <AudioLines size={18} aria-hidden="true" />
          <p>Scan your posts first — the voice profile is read from what you actually publish.</p>
        </div>
      )}

      {hasSnapshot && !profile && !refreshing && (
        <div className="memory-empty">
          <AudioLines size={18} aria-hidden="true" />
          <p>
            Derive a style card from your published posts. Every generated draft and rewrite follows it, so posts sound
            like you instead of generic AI commentary. It re-derives automatically after each new scan.
          </p>
        </div>
      )}

      {profile && (
        <>
          <p className="voice-summary">{profile.summary}</p>
          <RuleList title="Casing & punctuation" items={profile.casing_and_punctuation} />
          <RuleList title="Sentence rhythm" items={profile.sentence_rhythm} />
          <RuleList title="Vocabulary & phrases" items={profile.vocabulary} />
          <RuleList title="Hook moves" items={profile.hook_moves} />
          <RuleList title="Never do" items={profile.banned_moves} />
          <RuleList title="Style reference excerpts" items={profile.style_excerpts} />
        </>
      )}

      <div className="voice-overrides">
        <label htmlFor="voice-overrides-input">
          <span>Your voice notes</span>
          <small>Always applied, and they win over the derived rules. Survive re-derives.</small>
        </label>
        <textarea
          id="voice-overrides-input"
          placeholder="e.g. never use em dashes. keep everything lowercase except product names."
          rows={3}
          value={overridesDraft}
          onChange={(event) => setOverridesDraft(event.target.value)}
        />
        <button
          className="secondary-button"
          type="button"
          disabled={saving || (state !== null && overridesDraft === state.overrides)}
          onClick={() => void handleSaveOverrides()}
          aria-busy={saving || undefined}
        >
          {saved ? <Check size={16} aria-hidden="true" /> : null}
          {saved ? "Saved" : saving ? "Saving" : "Save voice notes"}
        </button>
      </div>
    </section>
  );
}
