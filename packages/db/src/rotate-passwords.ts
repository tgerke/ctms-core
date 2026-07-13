/**
 * Rotate the dev-grade passwords that migrations create (docs/05-deployment.md):
 * ctms_app from CTMS_APP_PASSWORD, ctms_readonly from CTMS_READONLY_PASSWORD.
 * Idempotent; roles whose variable is unset are left unchanged. Runs with the
 * owning-role DATABASE_URL, so deployments chain it after migrate.
 */
import postgres from "postgres";
import { databaseUrl, loadEnv } from "./env.js";

loadEnv();

const rotations: Array<[role: string, envVar: string]> = [
  ["ctms_app", "CTMS_APP_PASSWORD"],
  ["ctms_readonly", "CTMS_READONLY_PASSWORD"],
];

const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
for (const [role, envVar] of rotations) {
  const password = process.env[envVar];
  if (!password) {
    console.log(`${envVar} not set; ${role} password unchanged`);
    continue;
  }
  await sql.unsafe(
    `ALTER ROLE ${role} LOGIN PASSWORD '${password.replaceAll("'", "''")}'`,
  );
  console.log(`${role} password set from ${envVar}`);
}
await sql.end();
