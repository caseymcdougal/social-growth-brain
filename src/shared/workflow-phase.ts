import type { AnalysisSummary } from "./analysis-schema";
import type { GenerationOutput } from "./generation-schema";
import type { CapturedAccountSnapshot } from "./types";

export type WorkflowPhase = "empty" | "scanned" | "audited" | "drafted";

export function getWorkflowPhase(
  snapshot: CapturedAccountSnapshot | null,
  analysis: AnalysisSummary | null,
  generation: GenerationOutput | null
): WorkflowPhase {
  if (generation) return "drafted";
  if (analysis) return "audited";
  if (snapshot) return "scanned";
  return "empty";
}