import express from "express";
import { join } from "node:path";
import { parseManualImportJson } from "../shared/manual-import";
import { BrowserHarnessXCaptureRunner } from "./capture/browser-harness-x";
import { CaptureError } from "./capture/capture-runner";
import { openDatabase } from "./db";
import { createRepositories } from "./repositories";

export function createServerApp(options: { dataDir: string }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const db = openDatabase(join(options.dataDir, "social-audit.sqlite"));
  const repos = createRepositories(db);
  const captureRunner = new BrowserHarnessXCaptureRunner();

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

  return app;
}
