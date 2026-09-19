import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "../test/support.js";

// The seeded welcome explanation targets Sara's Force and motion gap. Its
// follow-up question has three options; the first is correct.
const CORRECT = "No net force is required";
const WRONG = "A constant forward force";
const ALREADY_ANSWERED = {
  error:
    "You already answered this follow-up. Your teacher will share another explanation.",
  code: "conflict",
};

describe("one answer per follow-up question", () => {
  let app: TestServer | undefined;
  let student = "";
  let gapId = "";

  const server = (): TestServer => {
    if (app === undefined) assert.fail("server not started");
    return app;
  };
  const answer = (value: string) =>
    server().request(`/api/student/gaps/${gapId}/recheck`, {
      method: "POST",
      cookie: student,
      body: { answer: value },
    });
  const gap = () =>
    server().store.one<{ status: string }>(
      "SELECT status FROM gaps WHERE id=?",
      [gapId],
    );
  const probeCount = () =>
    server().store.one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM probes WHERE gap_id=?",
      [gapId],
    )?.count;

  beforeEach(async () => {
    await app?.close();
    app = await startTestServer();
    student = await app.login("student@gap.demo");
    const row = app.store.one<{ id: string }>(
      "SELECT id FROM gaps WHERE intervention_id='welcome-explainer'",
    );
    assert.ok(row);
    gapId = row.id;
  });
  after(() => app?.close());

  test("a wrong answer cannot be followed by a guess on the same question", async () => {
    assert.equal((await answer(WRONG)).status, 200);
    assert.equal(gap()?.status, "struggling");
    const retry = await answer(CORRECT);
    assert.equal(retry.status, 409);
    assert.deepEqual(retry.body, ALREADY_ANSWERED);
    assert.equal(gap()?.status, "struggling");
    assert.equal(probeCount(), 1);
  });

  test("a gap reopened by a later quiz can still answer an unanswered follow-up", async () => {
    server().store.run("UPDATE gaps SET status='open' WHERE id=?", [gapId]);
    const response = await answer(CORRECT);
    assert.equal(response.status, 200);
    assert.equal(gap()?.status, "resolved");
  });

  test("a newly approved explanation allows exactly one new answer", async () => {
    assert.equal((await answer(WRONG)).status, 200);
    // Simulate a re-approval: the earlier answer predates the new approval,
    // which predates the next answer, so exactly one attempt is open.
    const at = (offsetMs: number) =>
      new Date(Date.now() + offsetMs).toISOString();
    server().store.run("UPDATE probes SET created_at=? WHERE gap_id=?", [
      at(-2000),
      gapId,
    ]);
    server().store.run(
      "UPDATE interventions SET approved_at=? WHERE id='welcome-explainer'",
      [at(-1000)],
    );
    server().store.run("UPDATE gaps SET status='ready' WHERE id=?", [gapId]);
    assert.equal((await answer(WRONG)).status, 200);
    assert.deepEqual((await answer(CORRECT)).body, ALREADY_ANSWERED);
    assert.equal(probeCount(), 2);
  });
});
