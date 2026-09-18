import { randomUUID } from "node:crypto";
import type {
  ErrorRequestHandler,
  Request,
  RequestHandler,
  Response,
} from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { RATE_LIMIT_WINDOW_MS } from "../constants.js";
import {
  BadRequestError,
  ForbiddenError,
  HttpError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitedError,
  type ErrorBody,
} from "../errors.js";
import type { Logger } from "../logger.js";

const REQUEST_ID_HEADER = "X-Request-Id";
const REQUEST_ID_FORMAT = /^[A-Za-z0-9._-]{1,128}$/;
const READ_ONLY_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);
const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const PAYLOAD_TOO_LARGE = 413;

const INTERNAL_ERROR: ErrorBody = {
  error: "The operation failed. Please retry.",
  code: "internal_error",
};

// Errors raised by express.json() carry a `type` and an HTTP `status`.
const bodyParserError = z.object({
  type: z.string(),
  status: z.number().int().min(400).max(499),
});

/**
 * Assigns a request id (reusing a well-formed incoming X-Request-Id), attaches
 * a child logger to `req.log`, and logs one line per completed request.
 */
export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get(REQUEST_ID_HEADER);
    req.id =
      incoming !== undefined && REQUEST_ID_FORMAT.test(incoming)
        ? incoming
        : randomUUID();
    req.log = logger.child({ requestId: req.id });
    res.setHeader(REQUEST_ID_HEADER, req.id);
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      req.log.info(
        {
          method: req.method,
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          durationMs:
            Number(process.hrtime.bigint() - started) /
            NANOSECONDS_PER_MILLISECOND,
        },
        "request completed",
      );
    });
    next();
  };
}

/**
 * Logs one warning when a proxy header arrives while TRUST_PROXY is 0, since
 * rate limits and the origin check would then see the proxy, not the client.
 */
export function proxyHeaderWarning(logger: Logger): RequestHandler {
  let warned = false;
  return (req, _res, next) => {
    if (!warned && req.get("X-Forwarded-For") !== undefined) {
      warned = true;
      logger.warn(
        "X-Forwarded-For received but TRUST_PROXY is 0; set TRUST_PROXY to the number of proxies in front of the app",
      );
    }
    next();
  };
}

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

/** Rejects state-changing requests whose Origin header is not this host or an allowed origin. */
export function originGuard(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (
      READ_ONLY_METHODS.has(req.method) ||
      origin === undefined ||
      origin === ""
    ) {
      next();
      return;
    }
    const ownOrigin = `${req.protocol}://${req.get("host") ?? ""}`;
    next(
      origin === ownOrigin || allowedOrigins.includes(origin)
        ? undefined
        : new ForbiddenError(
            "This request origin is not permitted.",
            "origin_not_allowed",
          ),
    );
  };
}

/** Per-client attempt limit that fails with the standard JSON error body. */
export function attemptLimit(attemptsPerWindow: number): RequestHandler {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: attemptsPerWindow,
    standardHeaders: true,
    legacyHeaders: false,
    // proxyHeaderWarning reports a missing TRUST_PROXY through the app logger.
    validate: { xForwardedForHeader: false },
    handler: (_req, _res, next) => {
      next(
        new RateLimitedError(
          "Too many attempts. Please wait a minute and try again.",
        ),
      );
    },
  });
}

/** Runs a sync or async route and forwards any thrown error to the error handler. */
export function asyncRoute(
  handler: (req: Request, res: Response) => unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(next);
  };
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError("Endpoint not found."));
};

function toHttpError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  if (error instanceof z.ZodError)
    return new BadRequestError(
      error.issues.map((issue) => issue.message).join(" "),
      "validation_failed",
    );
  const parserError = bodyParserError.safeParse(error);
  if (!parserError.success) return null;
  if (parserError.data.type === "entity.parse.failed")
    return new BadRequestError(
      "Request body must be valid JSON.",
      "invalid_json",
    );
  if (parserError.data.status === PAYLOAD_TOO_LARGE)
    return new PayloadTooLargeError("Request body is too large.");
  return new HttpError(
    parserError.data.status,
    "bad_request",
    "The request could not be processed.",
  );
}

/**
 * Converts errors to the documented `{ error, code }` body. Expected errors
 * return their own message; anything else is logged with its stack and
 * returned as a generic 500 so internals never reach the client.
 */
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const known = toHttpError(error);
  if (known !== null) {
    res.status(known.status).json(known.toBody());
    return;
  }
  req.log.error({ err: error }, "request failed");
  res.status(500).json(INTERNAL_ERROR);
};
