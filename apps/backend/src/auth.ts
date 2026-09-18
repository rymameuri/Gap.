import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { RequestHandler, Response } from "express";
import type { Store } from "./db.js";
import type { Logger } from "./logger.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./constants.js";
import { ForbiddenError, UnauthenticatedError } from "./errors.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
};
declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
      id: string;
      log: Logger;
    }
  }
}

const SCRYPT_KEY_LENGTH = 64;
const SESSION_TOKEN_BYTES = 32;
// Format written by hashPassword in db.ts: hex salt, colon, hex scrypt key.
const STORED_PASSWORD = new RegExp(
  `^([0-9a-f]+):([0-9a-f]{${String(SCRYPT_KEY_LENGTH * 2)}})$`,
);

export const tokenHash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export function sessionToken(header: string | undefined): string {
  return (
    header
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(SESSION_COOKIE + "="))
      ?.slice(SESSION_COOKIE.length + 1) ?? ""
  );
}

/** Compares `input` with a stored `salt:hash` value in constant time. Malformed stored values never match. */
export function checkPassword(input: string, stored: string): boolean {
  const match = STORED_PASSWORD.exec(stored);
  if (match === null) return false;
  const [, salt, hash] = match;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(input, salt, SCRYPT_KEY_LENGTH);
  return timingSafeEqual(expected, actual);
}

export function setSession(
  store: Store,
  response: Response,
  userId: string,
  secureCookie: boolean,
): void {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  store.run("INSERT INTO sessions VALUES(?,?,?)", [
    tokenHash(token),
    userId,
    Date.now() + SESSION_TTL_MS,
  ]);
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export const authenticated =
  (store: Store): RequestHandler =>
  (req, _res, next) => {
    const token = sessionToken(req.headers.cookie);
    const user = store.one<AuthUser>(
      "SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      [tokenHash(token), Date.now()],
    );
    if (!user) {
      next(new UnauthenticatedError("Please sign in to continue."));
      return;
    }
    req.user = user;
    req.log = req.log.child({ userId: user.id });
    next();
  };

export const teacherOnly: RequestHandler = (req, _res, next) => {
  next(
    req.user.role === "teacher"
      ? undefined
      : new ForbiddenError("Teacher access is required."),
  );
};

export const studentOnly: RequestHandler = (req, _res, next) => {
  next(
    req.user.role === "student"
      ? undefined
      : new ForbiddenError("Student access is required."),
  );
};
