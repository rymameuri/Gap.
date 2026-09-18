import type { Express } from "express";
import { classCards } from "../services/classes.js";
import type { RouteContext } from "./context.js";

export function registerClassRoutes(
  app: Express,
  { store }: RouteContext,
): void {
  app.get("/api/classes", (req, res) => {
    res.json({ courses: classCards(store, req.user.id, req.user.role) });
  });
}
