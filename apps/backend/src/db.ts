import initSqlJs, { type Database, type SqlValue } from "sql.js";
import {
  mkdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { migrate } from "./migrate.js";

const require = createRequire(import.meta.url);

const MEMORY = ":memory:";
const DATABASE_FILE_MODE = 0o600;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;

// Default row type for callers that do not declare their columns. Only
// src/agents relies on it (owned by the agents team); backend code passes an
// explicit row type. It stays `any` because agent code reads columns by name
// and would not compile under noUncheckedIndexedAccess otherwise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export type Row = Record<string, any>;

export class Store {
  private inTransaction = false;
  constructor(
    readonly db: Database,
    readonly path: string,
  ) {}

  /**
   * Runs a query and returns every row. Rows are not checked at runtime: `T`
   * must describe the columns the SELECT returns.
   */
  all<T extends object = Row>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  one<T extends object = Row>(
    sql: string,
    params: SqlValue[] = [],
  ): T | undefined {
    return this.all<T>(sql, params).at(0);
  }

  /** Runs one statement and saves, unless inside a transaction. */
  run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
    if (!this.inTransaction) this.save();
  }

  /** Runs `fn` atomically and saves once on commit. Nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.inTransaction) return fn();
    this.db.run("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.run("COMMIT");
      this.inTransaction = false;
      this.save();
      return result;
    } catch (e) {
      this.db.run("ROLLBACK");
      this.inTransaction = false;
      throw e;
    }
  }

  /** Writes the database file atomically. No-op for in-memory databases. */
  save(): void {
    if (this.path === MEMORY) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = this.path + ".tmp";
    writeFileSync(temp, this.db.export(), { mode: DATABASE_FILE_MODE });
    renameSync(temp, this.path);
  }

  /** Appends an audit event for the class activity feed. */
  event(
    classId: string,
    agent: string,
    action: string,
    details: unknown,
    studentId: string | null = null,
    jobId: string | null = null,
  ): void {
    this.run("INSERT INTO events VALUES(?,?,?,?,?,?,?,?)", [
      randomUUID(),
      classId,
      agent,
      action,
      JSON.stringify(details),
      studentId,
      jobId,
      new Date().toISOString(),
    ]);
  }
}

export interface OpenStoreOptions {
  /** Apply pending migrations before returning. Defaults to true. */
  readonly migrate?: boolean;
}

/**
 * Opens the SQLite database at `path` (":memory:" for a throwaway one),
 * creating the file on first save.
 * @throws MigrationError when the database is ahead of or diverges from this code.
 */
export async function openStore(
  path: string,
  options: OpenStoreOptions = {},
): Promise<Store> {
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve("sql.js/dist/" + file),
  });
  const actual = path === MEMORY ? path : resolve(path);
  const db = new SQL.Database(
    actual !== MEMORY && existsSync(actual) ? readFileSync(actual) : undefined,
  );
  db.run("PRAGMA foreign_keys=ON;");
  const store = new Store(db, actual);
  if (options.migrate ?? true) migrate(store);
  return store;
}

/** Returns `salt:hash` for storage; see checkPassword in auth.ts. */
export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  return (
    salt + ":" + scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex")
  );
}
