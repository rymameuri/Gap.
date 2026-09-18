import { pino, type DestinationStream, type Logger } from "pino";
import type { LogLevel } from "./config.js";

export type { Logger };

const REDACTED_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "cookie",
  "*.cookie",
  "authorization",
  "*.authorization",
];

/** Creates the structured JSON logger. Writes to stdout unless `destination` is given. */
export function createLogger(
  level: LogLevel,
  destination?: DestinationStream,
): Logger {
  const options = {
    level,
    base: { service: "backend" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
