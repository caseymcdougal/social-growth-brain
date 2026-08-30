import { FileText, LockKeyhole } from "lucide-react";
import type { GenerationOutput } from "../../shared/generation-schema";
import { auditSteps, type AuditStepKey } from "../../shared/ux-copy";
import { getStepState, type StepState } from "../utils/workflow-steps";
import { scrollToSection } from "../utils/scroll-to-section";

export function WorkspaceSidebar({
  currentStep,
  generation,
  dockSheetOpen,
  onToggleDockSheet
}: {
  currentStep: AuditStepKey;
  generation: GenerationOutput | null;
  dockSheetOpen: boolean;
  onToggleDockSheet: () => void;
}) {
  const currentStepMeta = auditSteps.find((step) => step.key === currentStep) ?? auditSteps[0];

  return (
    <aside className="sidebar" aria-label="Audit workflow">
      <div className="brand-lockup">
        <div className="brand-mark">
          <FileText size={18} aria-hidden="true" />
        </div>
        <div>
          <strong>
            Social Audit <span className="title-accent title-accent-compact">Studio</span>
          </strong>
          <span>Casey / X</span>
        </div>
      </div>

      <button className="dock-current-step" type="button" onClick={onToggleDockSheet} aria-expanded={dockSheetOpen}>
        <span className="dock-current-label">{currentStepMeta.label}</span>
        <small>{currentStepMeta.detail}</small>
      </button>

      <ol className={`step-rail${dockSheetOpen ? " is-sheet-open" : ""}`} aria-label="Audit sequence">
        {auditSteps.map((item, index) => {
          const stepState: StepState = getStepState(item.key, currentStep, generation);
          return (
            <li key={item.label}>
              <button
                type="button"
                aria-current={stepState === "current" ? "step" : undefined}
                className="step-row"
                data-state={stepState}
                onClick={() => scrollToSection(item.target, { expand: true })}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="privacy-note">
        <LockKeyhole size={16} aria-hidden="true" />
        <div>
          <strong>Runs on your Mac</strong>
          <span>Reads public X data only. Nothing gets posted for you.</span>
        </div>
      </div>
      <p className="privacy-note-mobile">Local only · reads public X data · never posts for you</p>
    </aside>
  );
}