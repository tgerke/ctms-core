import type { Db } from "@ctms/db";
import { sql } from "drizzle-orm";

/** The acting identity recorded on every audit event in the transaction. */
export interface Actor {
  personId?: string;
  label: string;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run `fn` in a transaction with the actor bound via set_config, so the
 * database audit triggers (ADR-0003) attribute every write in it.
 */
export async function withActor<T>(
  db: Db,
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT set_config('ctms.actor_id', ${actor.personId ?? ""}, true),
             set_config('ctms.actor_label', ${actor.label}, true)`);
    return fn(tx);
  });
}
