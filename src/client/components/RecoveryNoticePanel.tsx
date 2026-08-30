export type RecoveryNoticeKind = "analysis" | "generation" | "memory" | "topic";

const recoveryNoticeCopy: Record<RecoveryNoticeKind, { title: string; nextStep: string }> = {
  analysis: {
    title: "Pattern search didn't finish",
    nextStep: "Your posts are still loaded — try finding patterns again. If it keeps failing, paste a fresh snapshot first."
  },
  generation: {
    title: "We couldn't write your drafts",
    nextStep: "Your insights are still here — try generating ideas again. If that keeps failing, use the drafts already on screen."
  },
  memory: {
    title: "Memory didn't update",
    nextStep: "Your saved context is fine — try the memory update again once patterns are stable."
  },
  topic: {
    title: "Topic search didn't finish",
    nextStep: "Your insights are fine — try finding related topics again later. Your drafts and signals still work."
  }
};

export function RecoveryNoticePanel({ kind, message }: { kind: RecoveryNoticeKind; message: string }) {
  const copy = recoveryNoticeCopy[kind];
  return (
    <section className="panel error-panel" role="alert">
      <div>
        <p className="eyebrow">Let's fix this</p>
        <h2>{copy.title}</h2>
        <p>{message}</p>
      </div>
      <div className="recovery-next-step">
        <span>What to do next</span>
        <p>{copy.nextStep}</p>
      </div>
    </section>
  );
}