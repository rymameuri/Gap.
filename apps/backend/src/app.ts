import express from "express";
import { resolve } from "node:path";
import type { Config } from "./config.js";
import type { Store } from "./db.js";
import { AgentQueue } from "./jobs.js";
import type { Logger } from "./logger.js";
import { JSON_BODY_LIMIT } from "./constants.js";
import {
  errorHandler,
  noStore,
  notFound,
  originGuard,
  requestContext,
} from "./http/middleware.js";
import { registerClassRoutes } from "./routes/classes.js";
import { registerSessionRoutes } from "./routes/session.js";
import { registerStudentRoutes } from "./routes/student.js";
import { registerTeacherRoutes } from "./routes/teacher.js";

export interface AppDependencies {
  readonly store: Store;
  readonly config: Config;
  readonly logger: Logger;
  /** Directory holding the built frontend; served with an index.html fallback when set. */
  readonly webRoot?: string;
}

/** Builds the Express app. Routes are documented in apps/backend/openapi.yaml. */
export function createApp({
  store,
  config,
  logger,
  webRoot,
}: AppDependencies): express.Express {
  const app = express();
  app.disable("x-powered-by");
  const context = { store, config, queue: new AgentQueue(store, logger) };
  app.use(requestContext(logger));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use("/api", noStore, originGuard(config.allowedOrigins));
  // Session routes install the session guard, so they register first.
  registerSessionRoutes(app, context);
  registerTeacherRoutes(app, context);
  registerClassRoutes(app, context);
  registerStudentRoutes(app, context);
  app.use("/api", notFound);
  if (webRoot !== undefined) {
    const indexFile = resolve(webRoot, "index.html");
    app.use(express.static(webRoot));
    app.get("*", (_req, res) => {
      res.sendFile(indexFile);
    });
  }
  app.use(errorHandler);
  return app;
}
