import type { ReactNode } from "react";
import type { WorkflowPhase } from "../../shared/workflow-phase";

export function PhaseLayout({
  phase,
  hero,
  commandCenter,
  auditBanner,
  scoreStrip,
  scannedPreview,
  auditedCoach,
  auditedInsightGrid,
  draftedWorkspace,
  referenceShelf,
  recoveryNotices
}: {
  phase: WorkflowPhase;
  hero: ReactNode;
  commandCenter: ReactNode | null;
  auditBanner: ReactNode | null;
  scoreStrip: ReactNode | null;
  scannedPreview: ReactNode | null;
  auditedCoach: ReactNode | null;
  auditedInsightGrid: ReactNode | null;
  draftedWorkspace: ReactNode | null;
  referenceShelf: ReactNode | null;
  recoveryNotices: ReactNode;
}) {
  return (
    <>
      {phase === "drafted" ? commandCenter : hero}
      {recoveryNotices}

      {phase === "scanned" && scannedPreview}

      {phase === "audited" && (
        <div className="audited-phase-layout">
          {auditBanner}
          {scoreStrip}
          {auditedCoach}
          {auditedInsightGrid}
        </div>
      )}

      {phase === "drafted" && draftedWorkspace}
      {referenceShelf}
    </>
  );
}

