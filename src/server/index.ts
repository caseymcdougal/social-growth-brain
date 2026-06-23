import express from "express";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 4174);
const app = express();

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "social-audit" });
});

app.listen(port, host, () => {
  console.log(`Social audit API listening on http://${host}:${port}`);
});
