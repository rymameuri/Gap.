import type { Store } from "./db.js";
import { backfillJoinCodes } from "./join-codes.js";
import {
  MIGRATIONS,
  baseline,
  classJoinCode,
  type Migration,
} from "./migrations/index.js";
import { JOIN_CODE_INDEX } from "./migrations/0002-class-join-code.js";

const LEDGER = "schema_migrations";

/** The database and the migration list disagree; starting would corrupt data. */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

function tableExists(store: Store, name: string): boolean {
  return (
    store.one("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [
      name,
    ]) !== undefined
  );
}

function indexExists(store: Store, name: string): boolean {
  return (
    store.one("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", [
      name,
    ]) !== undefined
  );
}

function columnExists(store: Store, table: string, column: string): boolean {
  return store
    .all<{ name: string }>(`PRAGMA table_info(${table})`)
    .some((entry) => entry.name === column);
}

function record(store: Store, id: string): void {
  store.run(`INSERT INTO ${LEDGER}(id,applied_at) VALUES(?,?)`, [
    id,
    new Date().toISOString(),
  ]);
}

/** Ids of applied migrations, oldest first. Empty when the ledger does not exist. */
export function appliedMigrations(store: Store): string[] {
  if (!tableExists(store, LEDGER)) return [];
  return store
    .all<{ id: string }>(`SELECT id FROM ${LEDGER} ORDER BY id`)
    .map((row) => row.id);
}

function assertOrdered(migrations: readonly Migration[]): void {
  const ids = migrations.map((migration) => migration.id);
  const ordered = [...new Set(ids)].sort();
  if (ids.join("\n") !== ordered.join("\n"))
    throw new MigrationError(
      `Migration ids must be unique and increasing: ${ids.join(", ")}`,
    );
}

function assertKnownPrefix(
  applied: readonly string[],
  migrations: readonly Migration[],
): void {
  applied.forEach((id, index) => {
    if (migrations[index]?.id !== id)
      throw new MigrationError(
        `Database migration ${id} does not match this code (expected ${migrations[index]?.id ?? "none"}). Update the code or restore a matching database.`,
      );
  });
}

// Databases created before migrations existed had data/schema.sql applied at
// startup, then join_code added in place. Record what they already contain so
// those migrations are not run again.
function adoptLegacySchema(store: Store): string[] {
  if (appliedMigrations(store).length > 0 || !tableExists(store, "users"))
    return [];
  const adopted = [baseline.id];
  record(store, baseline.id);
  if (
    columnExists(store, "classes", "join_code") &&
    indexExists(store, JOIN_CODE_INDEX)
  ) {
    backfillJoinCodes(store);
    record(store, classJoinCode.id);
    adopted.push(classJoinCode.id);
  }
  return adopted;
}

export interface MigrationResult {
  /** Migrations recorded for a database created before migrations existed. */
  readonly adopted: readonly string[];
  /** Migrations run by this call. */
  readonly applied: readonly string[];
}

/**
 * Applies every pending migration, each in its own transaction.
 * @throws MigrationError when the database has migrations this code does not know.
 */
export function migrate(
  store: Store,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationResult {
  assertOrdered(migrations);
  const adopted = store.transaction(() => {
    store.run(
      `CREATE TABLE IF NOT EXISTS ${LEDGER}(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL)`,
    );
    return adoptLegacySchema(store);
  });
  const done = appliedMigrations(store);
  assertKnownPrefix(done, migrations);
  const pending = migrations.slice(done.length);
  for (const migration of pending)
    store.transaction(() => {
      migration.up(store);
      record(store, migration.id);
    });
  return { adopted, applied: pending.map((migration) => migration.id) };
}

/**
 * Reverts the last `steps` applied migrations, newest first, each in its own
 * transaction. Reverting the baseline drops every table and its data.
 * @throws MigrationError when fewer migrations are applied or they are unknown.
 */
export function rollback(
  store: Store,
  steps: number,
  migrations: readonly Migration[] = MIGRATIONS,
): string[] {
  const done = appliedMigrations(store);
  assertKnownPrefix(done, migrations);
  if (!Number.isInteger(steps) || steps < 1 || steps > done.length)
    throw new MigrationError(
      `Cannot roll back ${String(steps)} migrations; ${String(done.length)} applied.`,
    );
  const reverted = migrations.slice(done.length - steps, done.length).reverse();
  for (const migration of reverted)
    store.transaction(() => {
      migration.down(store);
      store.run(`DELETE FROM ${LEDGER} WHERE id=?`, [migration.id]);
    });
  return reverted.map((migration) => migration.id);
}

/** CREATE statements for every table and index, in a stable order. */
export function schemaSnapshot(store: Store): string {
  return store
    .all<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name",
    )
    .map((row) => row.sql + ";\n")
    .join("\n");
}
