import type { Express } from "express";
import {
  authenticated,
  checkPassword,
  deleteSession,
  sessionToken,
  setSession,
} from "../auth.js";
import { engineName } from "../agents/provider.js";
import { LOGIN_ATTEMPTS_PER_WINDOW, SESSION_COOKIE } from "../constants.js";
import { UnauthenticatedError } from "../errors.js";
import { asyncRoute, attemptLimit } from "../http/middleware.js";
import { findUserByEmail } from "../repositories/classes.js";
import { loginBody } from "../validation.js";
import type { RouteContext } from "./context.js";

/** Health and sign-in, which need no session, then the session guard for every later /api route. */
export function registerSessionRoutes(
  app: Express,
  { store, config }: RouteContext,
): void {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, engine: engineName(), database: "sqlite" });
  });

  app.post(
    "/api/auth/login",
    attemptLimit(LOGIN_ATTEMPTS_PER_WINDOW),
    asyncRoute((req, res) => {
      const body = loginBody.parse(req.body);
      const user = findUserByEmail(store, body.email.trim().toLowerCase());
      if (!user || !checkPassword(body.password, user.password))
        throw new UnauthenticatedError(
          "Email or password is incorrect.",
          "invalid_credentials",
        );
      setSession(store, res, user.id, config.secureCookies);
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    }),
  );

  app.use("/api", authenticated(store));

  app.get("/api/auth/me", (req, res) => {
    res.json(req.user);
  });

  app.post("/api/auth/logout", (req, res) => {
    deleteSession(store, sessionToken(req.headers.cookie));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });
}
