import type { AnalysisOutput } from "../shared/analysis-schema";
import type { GenerationOutput } from "../shared/generation-schema";
import type { CapturedAccountSnapshot } from "../shared/types";

export async function getLatestSnapshot(): Promise<CapturedAccountSnapshot | null> {
  const response = await fetch("/api/latest");
  if (!response.ok) throw new Error("Failed to load latest snapshot");
  const data = await response.json();
  return data.snapshot ?? null;
}

export async function getLatestAnalysis(): Promise<AnalysisOutput | null> {
  const response = await fetch("/api/analysis/latest");
  if (!response.ok) throw new Error("Failed to load latest analysis");
  const data = await response.json();
  return data.analysis ?? null;
}

export async function getLatestGeneration(): Promise<GenerationOutput | null> {
  const response = await fetch("/api/generation/latest");
  if (!response.ok) throw new Error("Failed to load latest generated posts");
  const data = await response.json();
  return data.generation ?? null;
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

export async function generateTodaysIdeas(): Promise<GenerationOutput> {
  const response = await fetch("/api/generate/today", { method: "POST" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Generation failed");
  }
  return data.generation;
}
