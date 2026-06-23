import { createServerApp } from "./routes";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 4174);
const dataDir = process.env.SOCIAL_AUDIT_DATA_DIR ?? "data";

const app = createServerApp({ dataDir });

app.listen(port, host, () => {
  console.log(`social-audit api listening on http://${host}:${port}`);
});
