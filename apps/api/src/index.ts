import { serve } from "@hono/node-server";
import { createDb, loadEnv } from "@ctms/db";
import { buildApp } from "./app.js";

loadEnv();
const { db, sql } = createDb();
const app = buildApp(db, sql);
const port = Number(process.env.API_PORT ?? 8787);

serve({ fetch: app.fetch, port }, () => {
  console.log(`ctms-core api on http://localhost:${port} (docs at /docs)`);
});
