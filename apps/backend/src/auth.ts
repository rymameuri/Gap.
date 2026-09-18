import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { RequestHandler, Response } from "express";
import type { Store } from "./db.js";
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
    }
  }
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function sessionToken(header: string | undefined) {
  return (
    header
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("gap_session="))
      ?.slice("gap_session=".length) || ""
  );
}
export function checkPassword(input: string, stored: string) {
  try {
    const [salt, hash] = stored.split(":");
    const expected = Buffer.from(hash, "hex"),
      actual = scryptSync(input, salt, 64);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export function setSession(store: Store, response: Response, userId: string) {
  const token = randomBytes(32).toString("hex");
  store.run("INSERT INTO sessions VALUES(?,?,?)", [
    tokenHash(token),
    userId,
    Date.now() + 8 * 60 * 60 * 1000,
  ]);
  response.cookie("gap_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}
export const authenticated =
  (store: Store): RequestHandler =>
  (req, res, next) => {
    const token = sessionToken(req.headers.cookie);
    const user = store.one<AuthUser>(
      "SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      [tokenHash(token), Date.now()],
    );
    if (!user) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    req.user = user;
    next();
  };
export const teacherOnly: RequestHandler = (req, res, next) => {
  if (req.user.role !== "teacher") {
    res.status(403).json({ error: "Teacher access is required." });
    return;
  }
  next();
};
