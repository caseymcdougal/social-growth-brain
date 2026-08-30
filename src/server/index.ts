import { createServerApp } from "./routes";

// Local development credentials live in .env. `process.loadEnvFile` is a
// Node built-in, so the dashboard does not need another runtime dependency.
process.loadEnvFile(".env");

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 4174);
const dataDir = process.env.SOCIAL_AUDIT_DATA_DIR ?? "data";

const app = createServerApp({ dataDir });

app.listen(port, host, () => {
  console.log(`social-audit api listening on http://${host}:${port}`);
});
