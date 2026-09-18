import "dotenv/config";
import { writeFileSync } from "node:fs";
import { openStore } from "./db.js";
import { ConfigError, loadConfig } from "./config.js";
import {
  MigrationError,
  appliedMigrations,
  migrate,
  rollback,
} from "./migrate.js";
import { MIGRATIONS } from "./migrations/index.js";
import { SCHEMA_SNAPSHOT_FILE, renderSchemaSnapshot } from "./schema-file.js";

const USAGE = [
  "Usage: npm run db -- <command>",
  "  status               list applied and pending migrations",
  "  migrate              apply pending migrations",
  "  rollback [steps]     revert the newest migrations (default 1)",
  "  schema               regenerate data/schema.sql from the migrations",
].join("\n");

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

class UsageError extends Error {}

function print(line: string): void {
  process.stdout.write(line + "\n");
}

function parseSteps(value: string | undefined): number {
  if (value === undefined) return 1;
  const steps = Number(value);
  if (!Number.isInteger(steps) || steps < 1)
    throw new UsageError("steps must be a positive integer");
  return steps;
}

async function run(args: readonly string[]): Promise<void> {
  const command = args.at(0);
  if (command === undefined) throw new UsageError("Missing command");
  if (command === "schema") {
    writeFileSync(SCHEMA_SNAPSHOT_FILE, await renderSchemaSnapshot());
    print("Wrote data/schema.sql");
    return;
  }
  const config = loadConfig(process.env);
  const store = await openStore(config.databasePath, { migrate: false });
  try {
    switch (command) {
      case "status": {
        const applied = appliedMigrations(store);
        for (const migration of MIGRATIONS)
          print(
            `${applied.includes(migration.id) ? "applied" : "pending"}  ${migration.id}`,
          );
        return;
      }
      case "migrate": {
        const { adopted, applied } = migrate(store);
        for (const id of adopted) print(`adopted  ${id}`);
        for (const id of applied) print(`applied  ${id}`);
        if (adopted.length + applied.length === 0) print("Up to date.");
        return;
      }
      case "rollback":
        for (const id of rollback(store, parseSteps(args.at(1))))
          print(`reverted ${id}`);
        return;
      default:
        throw new UsageError(`Unknown command ${command}`);
    }
  } finally {
    store.db.close();
  }
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    process.stderr.write(error.message + "\n" + USAGE + "\n");
    process.exitCode = EXIT_USAGE;
  } else if (error instanceof MigrationError || error instanceof ConfigError) {
    process.stderr.write(error.message + "\n");
    process.exitCode = EXIT_FAILURE;
  } else throw error;
}
