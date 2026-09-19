import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openStore } from "./db.js";
import { MigrationError, migrate } from "./migrate.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";
import { ConfigError, loadConfig, type Config } from "./config.js";
import { createLogger } from "./logger.js";
import { engineName } from "./agents/provider.js";

const WEB_ROOT = resolve("dist");
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

function configOrExit(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    createLogger("info").fatal(
      { issues: error.issues },
      "invalid configuration",
    );
    process.exit(1);
  }
}

const config = configOrExit();
const logger = createLogger(config.logLevel);

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  process.exit(1);
});

const store = await openStore(config.databasePath, { migrate: false });
try {
  const { adopted, applied } = migrate(store);
  logger.info({ adopted, applied }, "database migrated");
} catch (error) {
  if (!(error instanceof MigrationError)) throw error;
  logger.fatal({ err: error }, "database migration refused");
  process.exit(1);
}
seed(store, config.demoPassword, { showcase: true });
const app = createApp({
  store,
  config,
  logger,
  ...(existsSync(resolve(WEB_ROOT, "index.html")) ? { webRoot: WEB_ROOT } : {}),
});
const server = app.listen(config.port, config.host, () => {
  logger.info(
    {
      host: config.host,
      port: config.port,
      environment: config.environment,
      engine: engineName(),
    },
    "API ready",
  );
});
for (const signal of SHUTDOWN_SIGNALS)
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => {
      store.save();
      process.exit(0);
    });
  });
