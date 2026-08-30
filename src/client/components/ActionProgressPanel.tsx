export type ActionProgressState = "locked" | "ready" | "running" | "complete" | "issue";

export type ActionProgressItem = {
  label: string;
  detail: string;
  state: ActionProgressState;
};

const actionProgressValue: Record<ActionProgressState, number> = {
  locked: 8,
  ready: 28,
  running: 68,
  complete: 100,
  issue: 100
};

const actionProgressLabel: Record<ActionProgressState, string> = {
  locked: "Waiting",
  ready: "Ready",
  running: "Working",
  complete: "Done",
  issue: "Needs a retry"
};

export function getActionState({
  blocked,
  complete,
  error,
  ready,
  running
}: {
  blocked?: boolean;
  complete?: boolean;
  error?: boolean;
  ready?: boolean;
  running?: boolean;
}): ActionProgressState {
  if (running) return "running";
  if (error) return "issue";
  if (complete) return "complete";
  if (blocked) return "locked";
  if (ready) return "ready";
  return "locked";
}

export function ActionProgressPanel({ actions }: { actions: ActionProgressItem[] }) {
  const runningCount = actions.filter((action) => action.state === "running").length;
  const issueCount = actions.filter((action) => action.state === "issue").length;
  const completeCount = actions.filter((action) => action.state === "complete").length;
  const readyCount = actions.filter((action) => action.state === "ready").length;
  const lockedCount = actions.filter((action) => action.state === "locked").length;
  const runningAction = actions.find((action) => action.state === "running") ?? null;
  const issueAction = actions.find((action) => action.state === "issue") ?? null;

  const statusLine = runningAction
    ? `${runningAction.label}…`
    : issueAction
      ? `${issueAction.label} needs a retry`
      : issueCount
        ? "One step needs a retry"
        : completeCount && !readyCount && !lockedCount
          ? "All caught up"
          : "Nothing running right now";
  const statusLabel = runningCount
    ? `${runningCount} step running`
    : issueCount
      ? `${issueCount} needs a retry`
      : "Idle";
  const stepsOpen = Boolean(runningCount || issueCount);
  const stepsSummary = `${completeCount} done · ${readyCount} ready · ${lockedCount} waiting`;

  return (
    <section className="action-progress-panel" data-steps-open={stepsOpen ? "true" : "false"} aria-label="What's happening" aria-live="polite">
      <div className="action-progress-head">
        <div>
          <p className="eyebrow">Behind the scenes</p>
          <h2>What's happening</h2>
          <p className="action-progress-statusline">{statusLine}</p>
        </div>
        <span className="status-chip">{statusLabel}</span>
      </div>
      <details className="disclosure disclosure-compact action-progress-details" aria-label="Step-by-step progress" open={stepsOpen}>
        <summary>
          <span>See each step</span>
          <strong>{stepsSummary}</strong>
          <small>Open to watch every step load.</small>
        </summary>
        <ol className="action-progress-list">
          {actions.map((action) => {
            const value = actionProgressValue[action.state];
            return (
              <li className="action-progress-row" data-state={action.state} key={action.label}>
                <div>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                </div>
                <span className="action-state-label">{actionProgressLabel[action.state]}</span>
                <span
                  aria-label={`${action.label} progress`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={value}
                  className="action-meter"
                  role="progressbar"
                >
                  <span style={{ width: `${value}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}