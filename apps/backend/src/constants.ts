export const SESSION_COOKIE = "gap_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const JSON_BODY_LIMIT = "250kb";
export const DOCUMENT_UPLOAD_LIMIT = 25 * 1024 * 1024;
export const ROSTER_UPLOAD_LIMIT = 2 * 1024 * 1024;

export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const LOGIN_ATTEMPTS_PER_WINDOW = 20;
export const JOIN_ATTEMPTS_PER_WINDOW = 15;

// Submissions whose lowest per-question grading confidence falls below this
// value are held for teacher review instead of being published.
export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;
