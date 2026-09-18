/** Machine-readable error codes returned in every API error body. */
export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "invalid_json"
  | "payload_too_large"
  | "unauthenticated"
  | "invalid_credentials"
  | "forbidden"
  | "origin_not_allowed"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "service_unavailable"
  | "internal_error";

/** Shape of every API error response. `error` is safe to show to users. */
export interface ErrorBody {
  readonly error: string;
  readonly code: ErrorCode;
}

/** An expected failure whose message is safe to return to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toBody(): ErrorBody {
    return { error: this.message, code: this.code };
  }
}

export class BadRequestError extends HttpError {
  constructor(
    message: string,
    code: "bad_request" | "validation_failed" | "invalid_json" = "bad_request",
  ) {
    super(400, code, message);
  }
}

export class UnauthenticatedError extends HttpError {
  constructor(
    message: string,
    code: "unauthenticated" | "invalid_credentials" = "unauthenticated",
  ) {
    super(401, code, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(
    message: string,
    code: "forbidden" | "origin_not_allowed" = "forbidden",
  ) {
    super(403, code, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, "not_found", message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, "conflict", message);
  }
}

export class PayloadTooLargeError extends HttpError {
  constructor(message: string) {
    super(413, "payload_too_large", message);
  }
}

export class RateLimitedError extends HttpError {
  constructor(message: string) {
    super(429, "rate_limited", message);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message: string) {
    super(503, "service_unavailable", message);
  }
}
