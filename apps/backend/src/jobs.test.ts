import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "../test/support.js";

// Jobs run on the local engine. src/agents reads these directly and treats
// empty values as unset.
for (const key of [
  "QB_CLIENT_ID",
  "QB_CLIENT_SECRET",
  "AZURE_OPENAI_API_KEY",
  "QB_GATEWAY_TOKEN",
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_MODEL",
  "AI_SERVICE_URL",
  "AI_INTERNAL_TOKEN",
])
  process.env[key] = "";

const POLL_ATTEMPTS = 50;
const POLL_INTERVAL_MS = 20;

let app: TestServer;
let teacher: string;
const successWrites: string[] = [];

before(async () => {
  app = await startTestServer();
  teacher = await app.login("teacher@gap.demo");
  const run = app.store.run.bind(app.store);
  app.store.run = (sql, params) => {
    if (sql.includes("status='succeeded'")) successWrites.push(sql);
    run(sql, params);
  };
});
after(() => app.close());

async function finish(jobId: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const job = (
      await app.request(`/api/teacher/jobs/${jobId}`, {
        cookie: teacher,
      })
    ).body as Record<string, unknown>;
    if (job.status === "succeeded" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  assert.fail(`job ${jobId} did not finish`);
}

async function queue(path: string, body: unknown): Promise<string> {
  const response = await app.request(path, {
    method: "POST",
    cookie: teacher,
    body,
  });
  assert.equal(response.status, 202);
  const { jobId } = response.body as { jobId: string };
  return jobId;
}

test("a drafted quiz marks its job succeeded exactly once", async () => {
  successWrites.length = 0;
  const job = await finish(
    await queue("/api/teacher/classes/physics/assessments", {
      topic: "Force and motion",
    }),
  );
  assert.equal(job.status, "succeeded");
  assert.ok(typeof (job.result as { quizId?: unknown }).quizId === "string");
  assert.equal(successWrites.length, 1);
});

test("a prepared explanation marks its job succeeded exactly once", async () => {
  const gap = app.store.one<{ id: string }>(
    "SELECT id FROM gaps WHERE class_id='physics' AND status!='resolved' LIMIT 1",
  );
  assert.ok(gap);
  successWrites.length = 0;
  const job = await finish(
    await queue(`/api/teacher/gaps/${gap.id}/explainer`, {}),
  );
  assert.equal(job.status, "succeeded");
  assert.equal(successWrites.length, 1);
});

test("a failed task records its error and no success", async () => {
  successWrites.length = 0;
  const job = await finish(
    await queue("/api/teacher/classes/physics/assessments", {
      topic: "Quantum chemistry",
    }),
  );
  assert.equal(job.status, "failed");
  assert.equal(typeof job.error, "string");
  assert.equal(successWrites.length, 0);
});
