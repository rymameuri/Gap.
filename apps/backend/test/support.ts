import { once } from "node:events";
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { openStore, type Store } from "../src/db.js";
import { createLogger } from "../src/logger.js";
import { seed } from "../src/seed.js";
import type { AIServiceClient } from "../src/agents/python-service.js";

export const ALLOWED_ORIGIN = "http://localhost:3000";

export interface TestResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

export interface TestServer {
  readonly app: Express;
  /** Origin the test server listens on, for example http://127.0.0.1:54321. */
  readonly baseUrl: string;
  readonly config: Config;
  readonly store: Store;
  /** Parsed JSON log records written by the app logger. */
  readonly logs: Record<string, unknown>[];
  request(
    path: string,
    init?: {
      method?: string;
      body?: unknown;
      rawBody?: string;
      cookie?: string;
      headers?: Record<string, string>;
    },
  ): Promise<TestResponse>;
  login(email: string): Promise<string>;
  close(): Promise<void>;
}

function listeningPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Test server is not listening on a TCP port");
  return address.port;
}

/** Starts the app on a seeded database (in memory unless DATABASE_PATH is given) and a random local port. */
export async function startTestServer(
  env: Record<string, string> = {},
  aiService?: AIServiceClient | null,
): Promise<TestServer> {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_PATH: ":memory:",
    ...env,
  });
  const store = await openStore(config.databasePath);
  seed(store, config.demoPassword);
  const logs: Record<string, unknown>[] = [];
  const logger = createLogger("info", {
    write: (line: string) => {
      logs.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  const app = createApp({
    store,
    config,
    logger,
    ...(aiService === undefined ? {} : { aiService }),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${String(listeningPort(server))}`;

  const request: TestServer["request"] = async (path, init = {}) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: ALLOWED_ORIGIN,
      ...init.headers,
    };
    if (init.cookie !== undefined) headers.Cookie = init.cookie;
    const response = await fetch(baseUrl + path, {
      method: init.method ?? "GET",
      headers,
      body:
        init.rawBody ??
        (init.body === undefined ? null : JSON.stringify(init.body)),
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: text === "" ? null : (JSON.parse(text) as unknown),
    };
  };

  return {
    app,
    baseUrl,
    config,
    store,
    logs,
    request,
    async login(email) {
      const response = await fetch(baseUrl + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
        body: JSON.stringify({ email, password: config.demoPassword }),
      });
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      if (response.status !== 200 || cookie === undefined)
        throw new Error(
          `Login failed for ${email}: ${String(response.status)}`,
        );
      return cookie;
    },
    async close() {
      server.close();
      await once(server, "close");
      store.db.close();
    },
  };
}
