import { z } from "zod";

// Published demo credential (README and the frontend demo button use it).
// Production refuses to start without an explicit DEMO_PASSWORD.
const DEFAULT_DEMO_PASSWORD = "GapDemo!2026";

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type Environment = "development" | "test" | "production";

export interface Config {
  readonly environment: Environment;
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
  readonly demoPassword: string;
  readonly logLevel: LogLevel;
  readonly secureCookies: boolean;
  /** Origins allowed to send state-changing requests, besides the API's own host. */
  readonly allowedOrigins: readonly string[];
}

const port = z.coerce.number().int().min(1).max(65535);

const origin = z
  .string()
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, {
    message: "must be an origin such as https://app.example.com",
  });

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: port.default(3001),
    WEB_PORT: port.default(3000),
    APP_ORIGIN: origin.optional(),
    DATABASE_PATH: z.string().min(1).default(".runtime/gap.sqlite"),
    DEMO_PASSWORD: z.string().min(8).max(128).optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DEMO_PASSWORD === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEMO_PASSWORD"],
        message: "is required in production",
      });
  });

/** Raised when environment variables are missing or invalid. */
export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("Invalid configuration: " + issues.join("; "));
    this.name = "ConfigError";
  }
}

// Unset and empty variables are equivalent; .env files commonly contain `KEY=`.
function withoutEmptyValues(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[1].trim() !== "",
    ),
  );
}

/**
 * Validates backend environment variables.
 * @throws ConfigError listing every invalid or missing variable.
 */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
): Config {
  const parsed = envSchema.safeParse(withoutEmptyValues(env));
  if (!parsed.success)
    throw new ConfigError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".")} ${issue.message}`,
      ),
    );
  const values = parsed.data;
  const webOrigins = [
    `http://localhost:${String(values.WEB_PORT)}`,
    `http://127.0.0.1:${String(values.WEB_PORT)}`,
  ];
  return {
    environment: values.NODE_ENV,
    host: values.API_HOST,
    port: values.API_PORT,
    databasePath: values.DATABASE_PATH,
    demoPassword: values.DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD,
    logLevel: values.LOG_LEVEL,
    secureCookies: values.NODE_ENV === "production",
    allowedOrigins:
      values.APP_ORIGIN === undefined
        ? webOrigins
        : [values.APP_ORIGIN, ...webOrigins],
  };
}
