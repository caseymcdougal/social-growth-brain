import type { AnalysisOutput } from "../shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../shared/types";

export async function getLatestSnapshot(): Promise<CapturedAccountSnapshot | null> {
  const response = await fetch("/api/latest");
  if (!response.ok) throw new Error("Failed to load latest snapshot");
  const data = await response.json();
  return data.snapshot ?? null;
}

export async function importSnapshot(snapshot: unknown): Promise<void> {
  const response = await fetch("/api/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.errorMessage ?? "Import failed");
  }
}

export async function captureSnapshot(handle = "caseymcdougal"): Promise<CapturedAccountSnapshot> {
  const response = await fetch("/api/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Capture failed");
  }
  return data.snapshot;
}

export async function analyzeLatestSnapshot(): Promise<AnalysisOutput> {
  const response = await fetch("/api/analyze", { method: "POST" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Analysis failed");
  }
  return data.output;
}
