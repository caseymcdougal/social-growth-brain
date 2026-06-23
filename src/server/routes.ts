import express from "express";
import { join } from "node:path";
import { parseManualImportJson } from "../shared/manual-import";
import { openDatabase } from "./db";
import { createRepositories } from "./repositories";

export function createServerApp(options: { dataDir: string }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const db = openDatabase(join(options.dataDir, "social-audit.sqlite"));
  const repos = createRepositories(db);

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

  return app;
}
