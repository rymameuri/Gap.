import express from "express";
import { resolve } from "node:path";
import type { Config } from "./config.js";
import type { Store } from "./db.js";
import { AgentQueue } from "./jobs.js";
import {
  createAIServiceClient,
  type AIServiceClient,
} from "./agents/python-service.js";
import type { Logger } from "./logger.js";
import { JSON_BODY_LIMIT } from "./constants.js";
import {
  errorHandler,
  noStore,
  notFound,
  originGuard,
  proxyHeaderWarning,
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
  /** Test seam; production creates this from validated configuration. */
  readonly aiService?: AIServiceClient | null;
}

/** Builds the Express app. Routes are documented in apps/backend/openapi.yaml. */
export function createApp({
  store,
  config,
  logger,
  webRoot,
  aiService,
}: AppDependencies): express.Express {
  const app = express();
  app.disable("x-powered-by");
  // Behind a proxy, req.ip and req.protocol must come from X-Forwarded-* so
  // rate limits apply per client and the origin check sees https.
  if (config.trustProxyHops > 0) app.set("trust proxy", config.trustProxyHops);
  else app.use(proxyHeaderWarning(logger));
  const context = {
    store,
    config,
    queue: new AgentQueue(store, logger),
    aiService:
      aiService === undefined
        ? createAIServiceClient(config.aiService)
        : aiService,
  };
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
