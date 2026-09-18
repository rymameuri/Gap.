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
const require = createRequire(import.meta.url);
export type Row = Record<string, any>;
export class Store {
  private inTransaction = false;
  constructor(
    readonly db: Database,
    readonly path: string,
  ) {}
  all<T extends Row = Row>(sql: string, params: SqlValue[] = []): T[] {
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
  one<T extends Row = Row>(
    sql: string,
    params: SqlValue[] = [],
  ): T | undefined {
    return this.all<T>(sql, params)[0];
  }
  run(sql: string, params: SqlValue[] = []) {
    this.db.run(sql, params);
    if (!this.inTransaction) this.save();
  }
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
  save() {
    if (this.path === ":memory:") return;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = this.path + ".tmp";
    writeFileSync(temp, this.db.export(), { mode: 0o600 });
    renameSync(temp, this.path);
  }
  event(
    classId: string,
    agent: string,
    action: string,
    details: unknown,
    studentId: string | null = null,
    jobId: string | null = null,
  ) {
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
export async function openStore(
  path = process.env.DATABASE_PATH || ".runtime/gap.sqlite",
) {
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve("sql.js/dist/" + file),
  });
  const actual = path === ":memory:" ? path : resolve(path);
  const db = new SQL.Database(
    actual !== ":memory:" && existsSync(actual)
      ? readFileSync(actual)
      : undefined,
  );
  db.run("PRAGMA foreign_keys=ON;");
  db.run(readFileSync(resolve("data/schema.sql"), "utf8"));
  const store = new Store(db, actual);
  store.save();
  return store;
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
