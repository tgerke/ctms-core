import { serve } from "@hono/node-server";
import { appDatabaseUrl, createDb, loadEnv } from "@ctms/db";
import { buildApp } from "./app.js";
import { assertAuthConfig } from "./auth.js";

loadEnv();
assertAuthConfig();
// The API always runs as the least-privilege ctms_app role — dev included,
// so privilege bugs surface before production.
const { db, sql } = createDb(appDatabaseUrl());
const app = buildApp(db, sql);
const port = Number(process.env.API_PORT ?? 8787);

serve({ fetch: app.fetch, port }, () => {
  console.log(`ctms-core api on http://localhost:${port} (docs at /docs)`);
});
