import express from "express";
import { join } from "node:path";
import { parseManualImportJson } from "../shared/manual-import";
import { CodexCliRunner } from "./ai/codex-cli-runner";
import type { AiRunner } from "./ai/ai-runner";
import { BrowserHarnessXCaptureRunner } from "./capture/browser-harness-x";
import { CaptureError, type CaptureRunner } from "./capture/capture-runner";
import { openDatabase } from "./db";
import { CodexGenerationRunner } from "./generation/codex-generation-runner";
import type { GenerationRunner } from "./generation/generation-runner";
import { createJobDir } from "./jobs";
import { createRepositories } from "./repositories";

export function createServerApp(options: {
  dataDir: string;
  aiRunner?: AiRunner;
  captureRunner?: CaptureRunner;
  generationRunner?: GenerationRunner;
}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const db = openDatabase(join(options.dataDir, "social-audit.sqlite"));
  const repos = createRepositories(db);
  const captureRunner = options.captureRunner ?? new BrowserHarnessXCaptureRunner();
  const aiRunner = options.aiRunner ?? new CodexCliRunner();
  const generationRunner = options.generationRunner ?? new CodexGenerationRunner();

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "social-audit" });
  });

  app.post("/api/import", (request, response) => {
    try {
      const snapshot = parseManualImportJson(JSON.stringify(request.body));
      const profileSnapshotId = repos.saveCapturedSnapshot(snapshot);
      response.json({ ok: true, profileSnapshotId });
    } catch (error) {
      response.status(400).json({
        ok: false,
        errorStage: "manual_import_validation",
        errorMessage: error instanceof Error ? error.message : "Manual import failed"
      });
    }
  });

  app.get("/api/latest", (_request, response) => {
    response.json({ snapshot: repos.getLatestSnapshot() });
  });

  app.get("/api/analysis/latest", (_request, response) => {
    response.json({ analysis: repos.getLatestAnalysisForLatestSnapshot() });
  });

  app.get("/api/generation/latest", (_request, response) => {
    response.json({ generation: repos.getLatestGenerationForLatestSnapshot() });
  });

  app.post("/api/capture", async (request, response) => {
    try {
      const handle = typeof request.body?.handle === "string" ? request.body.handle : "caseymcdougal";
      const snapshot = await captureRunner.captureRecentPosts(handle);
      const profileSnapshotId = repos.saveCapturedSnapshot(snapshot);
      response.json({ ok: true, profileSnapshotId, snapshot });
    } catch (error) {
      if (error instanceof CaptureError) {
        response.status(422).json({ ok: false, errorStage: error.stage, errorMessage: error.message });
        return;
      }
      response.status(500).json({
        ok: false,
        errorStage: "parser_failed",
        errorMessage: error instanceof Error ? error.message : "Capture failed"
      });
    }
  });

  app.post("/api/analyze", async (_request, response) => {
    const snapshot = repos.getLatestSnapshot();
    if (!snapshot) {
      response.status(409).json({
        ok: false,
        errorStage: "no_snapshot",
        errorMessage: "Import or capture posts before analysis"
      });
      return;
    }

    const jobDir = createJobDir(options.dataDir, "analysis");
    try {
      const output = await aiRunner.analyze(snapshot, jobDir);
      const latestProfile = db
        .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (!latestProfile) {
        response.status(409).json({
          ok: false,
          errorStage: "no_snapshot",
          errorMessage: "Import or capture posts before analysis"
        });
        return;
      }
      const analysisRunId = repos.saveAnalysis(latestProfile.id, jobDir, output);
      response.json({ ok: true, analysisRunId, output });
    } catch (error) {
      response.status(500).json({
        ok: false,
        errorStage: "ai_runner_failed",
        errorMessage: error instanceof Error ? error.message : "Analysis failed",
        jobDir
      });
    }
  });

  app.post("/api/generate/today", async (_request, response) => {
    const snapshot = repos.getLatestSnapshot();
    if (!snapshot) {
      response.status(409).json({
        ok: false,
        errorStage: "no_snapshot",
        errorMessage: "Import or capture posts before generation"
      });
      return;
    }

    const latestAnalysis = repos.getLatestAnalysisRecordForLatestSnapshot();
    if (!latestAnalysis) {
      response.status(409).json({
        ok: false,
        errorStage: "no_analysis",
        errorMessage: "Run a strategy audit before generating posts"
      });
      return;
    }

    const jobDir = createJobDir(options.dataDir, "generation");
    try {
      const generation = await generationRunner.generateToday({
        snapshot,
        analysis: latestAnalysis.analysis,
        jobDir
      });
      const generationRunId = repos.saveGeneration({
        profileSnapshotId: latestAnalysis.profileSnapshotId,
        analysisRunId: latestAnalysis.analysisRunId,
        jobDir,
        mode: "today",
        output: generation
      });
      response.json({ ok: true, generationRunId, generation });
    } catch (error) {
      response.status(500).json({
        ok: false,
        errorStage: "generation_runner_failed",
        errorMessage: error instanceof Error ? error.message : "Generation failed",
        jobDir
      });
    }
  });

  return app;
}
