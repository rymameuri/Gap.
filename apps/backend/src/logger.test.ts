import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "./logger.js";

function capture(level: Parameters<typeof createLogger>[0]) {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger(level, {
    write: (line: string) => {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  return { logger, lines };
}

test("writes JSON records with service name and ISO time", () => {
  const { logger, lines } = capture("info");
  logger.info({ jobId: "j1" }, "agent task succeeded");
  const [line] = lines;
  assert.ok(line);
  assert.equal(line.service, "backend");
  assert.equal(line.msg, "agent task succeeded");
  assert.equal(line.jobId, "j1");
  assert.match(String(line.time), /^\d{4}-\d{2}-\d{2}T/);
});

test("redacts credential fields at the top level and one level down", () => {
  const { logger, lines } = capture("info");
  logger.info({
    password: "p",
    token: "t",
    body: { password: "p", cookie: "c" },
    headers: { authorization: "a" },
  });
  const serialized = JSON.stringify(lines);
  assert.ok(!/"(p|t|c|a)"/.test(serialized), serialized);
  assert.equal(lines[0]?.password, "[redacted]");
});

test("drops records below the configured level", () => {
  const { logger, lines } = capture("warn");
  logger.info("hidden");
  logger.warn("shown");
  assert.deepEqual(
    lines.map((line) => line.msg),
    ["shown"],
  );
});
