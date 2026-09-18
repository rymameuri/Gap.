import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import "dotenv/config";
const root = fileURLToPath(new URL("./", import.meta.url));
const children = [
  spawn(
    process.execPath,
    [
      root + "node_modules/tsx/dist/cli.mjs",
      "watch",
      root + "apps/backend/src/index.ts",
    ],
    { cwd: root, stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      root + "node_modules/vite/bin/vite.js",
      "--config",
      root + "apps/frontend/vite.config.ts",
    ],
    { cwd: root, stdio: "inherit" },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children)
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code || 0;
      stop();
    }
  });
