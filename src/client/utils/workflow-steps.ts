import type { AnalysisSummary } from "../../shared/analysis-schema";
import type { GenerationOutput } from "../../shared/generation-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";
import { type AuditStepKey, auditSteps } from "../../shared/ux-copy";

export type StepState = "idle" | "current" | "complete";

const stepOrder: AuditStepKey[] = auditSteps.map((step) => step.key);

export function getCurrentStep(
  snapshot: CapturedAccountSnapshot | null,
  analysis: AnalysisSummary | null,
  generation: GenerationOutput | null
): AuditStepKey {
  if (generation) return "write";
  if (analysis) return "write";
  if (snapshot) return "rank";
  return "scan";
}

export function getStepState(
  step: AuditStepKey,
  currentStep: AuditStepKey,
  generation: GenerationOutput | null
): StepState {
  if (generation) return "complete";
  const stepIndex = stepOrder.indexOf(step);
  const currentIndex = stepOrder.indexOf(currentStep);
  if (stepIndex < currentIndex) return "complete";
  if (stepIndex === currentIndex) return "current";
  return "idle";
}