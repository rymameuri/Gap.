import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

const aiUrl = process.env.AI_SERVICE_URL;
const aiToken = process.env.AI_INTERNAL_TOKEN;
if (aiUrl && aiToken) {
  const parsed = new URL(aiUrl);
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  const python =
    process.platform === "win32"
      ? root + "apps/backend/.venv/Scripts/python.exe"
      : root + "apps/backend/.venv/bin/python";
  if (isLocal && existsSync(python))
    children.push(
      spawn(
        python,
        [
          "-m",
          "uvicorn",
          "app.ai.http_api:app",
          "--host",
          parsed.hostname,
          "--port",
          parsed.port || "8001",
        ],
        {
          cwd: root + "apps/backend",
          env: process.env,
          stdio: "inherit",
        },
      ),
    );
  else if (isLocal)
    console.error(
      "AI_SERVICE_URL is local, but apps/backend/.venv was not found. Create the Python environment before npm run dev.",
    );
}
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
