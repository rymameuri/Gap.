import type { Request } from "express";
import type { Config } from "../config.js";
import type { Store } from "../db.js";
import type { AgentQueue } from "../jobs.js";
import type { AIServiceClient } from "../agents/python-service.js";

export interface RouteContext {
  readonly store: Store;
  readonly config: Config;
  readonly queue: AgentQueue;
  readonly aiService: AIServiceClient | null;
}

/** Route parameter that Express guarantees for the matched path. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (value === undefined) throw new Error(`Route has no :${name} parameter`);
  return value;
}

/** A single string query parameter, or undefined when absent or repeated. */
export function queryString(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === "string" ? value : undefined;
}
