import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { openStore } from "./db.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";
const store = await openStore();
seed(store);
const app = createApp(store);
if (existsSync(resolve("dist/index.html"))) {
  app.use(express.static(resolve("dist")));
  app.get("*", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
const port = Number(process.env.API_PORT || 3001);
const server = app.listen(port, process.env.API_HOST || "127.0.0.1", () =>
  console.log(
    "Gap API ready on port " +
      port +
      " · persistent SQLite · " +
      (process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_MODEL
        ? "live AI"
        : "local teaching engine"),
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.save();
      process.exit(0);
    }),
  );
