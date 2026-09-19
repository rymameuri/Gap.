import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, type Store } from "./db.js";
import { stringField } from "../test/openapi.js";
import { startTestServer, type TestServer } from "../test/support.js";

// The loop runs on the local engine. src/agents reads these directly and
// treats empty values as unset.
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

const JOB_POLL_ATTEMPTS = 40;
const JOB_POLL_INTERVAL_MS = 50;
const UNTRUSTED_ORIGIN = "https://untrusted.invalid";

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    assert.fail(`expected an object, got ${JSON.stringify(value)}`);
  return value as Json;
}

function objects(body: unknown, key: string): Json[] {
  const value = object(body)[key];
  if (!Array.isArray(value)) assert.fail(`expected array ${key}`);
  return value.map(object);
}

function column(store: Store, sql: string, params: string[]): unknown {
  return store.one<{ value: unknown }>(sql, params)?.value;
}

test("Durable teacher/student loop enforces review, approval, isolation and verified outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gap-workflow-"));
  const file = join(directory, "test.sqlite");
  let app: TestServer | undefined;
  try {
    app = await startTestServer({ DATABASE_PATH: file });
    const { store } = app;
    const server = app;
    const call = async (
      path: string,
      method = "GET",
      body?: unknown,
      cookie?: string,
      origin?: string,
    ) =>
      server.request("/api" + path, {
        method,
        body,
        ...(cookie === undefined ? {} : { cookie }),
        ...(origin === undefined ? {} : { headers: { Origin: origin } }),
      });

    assert.equal((await call("/teacher/workspace")).status, 401);
    const teacher = await app.login("teacher@gap.demo");
    const student = await app.login("student@gap.demo");

    const created = object(
      (
        await call(
          "/teacher/classes",
          "POST",
          { name: "Chemistry lab" },
          teacher,
        )
      ).body,
    );
    const classId = stringField(created, "id");
    const joinCode = stringField(created, "join_code");
    assert.match(joinCode, /^[A-Z2-9]{8}$/);
    const secondClass = await call(
      "/teacher/classes",
      "POST",
      { name: "Biology lab" },
      teacher,
    );
    assert.equal(secondClass.status, 201);
    assert.notEqual(joinCode, stringField(secondClass.body, "join_code"));
    assert.equal(
      (
        await call(
          "/teacher/classes",
          "POST",
          { name: "Forbidden class" },
          student,
        )
      ).status,
      403,
    );
    assert.equal(
      (await call("/student/classes/join", "POST", { code: joinCode }, teacher))
        .status,
      403,
    );
    assert.equal(
      (
        await call(
          "/student/classes/join",
          "POST",
          { code: "INVALID!" },
          student,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/student/classes/join",
          "POST",
          { code: "ZZZZZZZZ" },
          student,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          "/student/workspace?classId=" + classId,
          "GET",
          undefined,
          student,
        )
      ).status,
      404,
    );
    const joined = await call(
      "/student/classes/join",
      "POST",
      { code: joinCode.toLowerCase() },
      student,
    );
    assert.equal(joined.status, 201);
    const again = await call(
      "/student/classes/join",
      "POST",
      { code: joinCode },
      student,
    );
    assert.equal(object(again.body).alreadyJoined, true);
    assert.equal(
      column(
        store,
        "SELECT COUNT(*) AS value FROM memberships WHERE class_id=? AND student_id=?",
        [classId, "sara"],
      ),
      1,
    );
    const filtered = await call(
      "/student/workspace?classId=" + classId,
      "GET",
      undefined,
      student,
    );
    assert.equal(filtered.status, 200);
    for (const field of ["gaps", "quizzes", "grades", "progress"])
      assert.equal(objects(filtered.body, field).length, 0);
    const cards = objects(
      (await call("/classes", "GET", undefined, student)).body,
      "courses",
    );
    assert.ok(cards.some((course) => course.id === classId));
    assert.ok(cards.every((course) => !("join_code" in course)));

    assert.equal(
      (await call("/teacher/workspace", "GET", undefined, student)).status,
      403,
    );
    assert.equal(
      (await call("/student/workspace", "GET", undefined, teacher)).status,
      403,
    );
    assert.equal(
      (await call("/auth/logout", "POST", {}, student, UNTRUSTED_ORIGIN))
        .status,
      403,
    );

    const initial = (
      await call("/student/workspace", "GET", undefined, student)
    ).body;
    assert.ok(
      objects(initial, "gaps").every(
        (gap) => gap.probe === null || !("correctAnswer" in object(gap.probe)),
      ),
    );
    assert.ok(
      objects(initial, "quizzes").every((quiz) =>
        objects(quiz, "questions").every(
          (item) => !("correctAnswer" in item) && !("keywords" in item),
        ),
      ),
    );
    const otherGap = column(
      store,
      "SELECT id AS value FROM gaps WHERE student_id=?",
      ["omar"],
    );
    assert.equal(typeof otherGap, "string");
    assert.equal(
      (
        await call(
          `/student/gaps/${String(otherGap)}/recheck`,
          "POST",
          { answer: "No net force is required" },
          student,
        )
      ).status,
      404,
    );

    async function jobResult(jobId: string): Promise<Json> {
      for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt++) {
        const job = object(
          (await call("/teacher/jobs/" + jobId, "GET", undefined, teacher))
            .body,
        );
        if (job.status === "failed") assert.fail(String(job.error));
        if (job.status === "succeeded") return object(job.result);
        await new Promise((resolve) =>
          setTimeout(resolve, JOB_POLL_INTERVAL_MS),
        );
      }
      assert.fail("Agent task did not finish");
    }

    const draft = await call(
      "/teacher/classes/physics/assessments",
      "POST",
      { topic: "Force and motion" },
      teacher,
    );
    assert.equal(draft.status, 202);
    const draftJobId = stringField(draft.body, "jobId");
    const quizId = stringField(await jobResult(draftJobId), "quizId");
    const draftedTrace = objects(
      (
        await call(
          "/teacher/workspace?classId=physics",
          "GET",
          undefined,
          teacher,
        )
      ).body,
      "workflows",
    ).find((run) => run.id === draftJobId);
    assert.equal(draftedTrace?.status, "awaiting_review");
    assert.deepEqual(
      objects(draftedTrace, "steps").map((step) => step.actor),
      ["Teacher", "Assessment", "Assessment"],
    );
    const beforePublish = (
      await call("/student/workspace", "GET", undefined, student)
    ).body;
    assert.ok(!objects(beforePublish, "quizzes").some((q) => q.id === quizId));
    assert.equal(
      (await call(`/teacher/quizzes/${quizId}/publish`, "POST", {}, teacher))
        .status,
      200,
    );
    assert.equal(
      objects(
        (
          await call(
            "/teacher/workspace?classId=physics",
            "GET",
            undefined,
            teacher,
          )
        ).body,
        "workflows",
      ).find((run) => run.id === draftJobId)?.status,
      "complete",
    );
    const submitted = await call(
      `/student/quizzes/${quizId}/submit`,
      "POST",
      {
        answers: {
          q1: "A force in the direction of motion",
          q2: "The force changes velocity; zero force can maintain constant velocity.",
        },
      },
      student,
    );
    assert.equal(submitted.status, 201);
    assert.equal(stringField(submitted.body, "status"), "pending");
    assert.ok(!("score" in object(submitted.body)));
    const submissionId = stringField(submitted.body, "id");
    const pendingTrace = objects(
      (
        await call(
          "/teacher/workspace?classId=physics",
          "GET",
          undefined,
          teacher,
        )
      ).body,
      "workflows",
    ).find((run) => run.id === submissionId);
    assert.equal(pendingTrace?.status, "awaiting_review");
    assert.ok(
      !objects(pendingTrace, "steps").some(
        (step) => step.actor === "Diagnostic",
      ),
    );
    assert.equal(
      (
        await call(
          `/student/quizzes/${quizId}/submit`,
          "POST",
          { answers: { q1: "Zero", q2: "force velocity zero" } },
          student,
        )
      ).status,
      409,
    );
    const pending = objects(
      (await call("/student/workspace", "GET", undefined, student)).body,
      "quizzes",
    ).find((quiz) => quiz.id === quizId);
    assert.ok(pending);
    assert.ok(!("score" in object(pending.submission)));
    assert.equal(
      (
        await call(
          "/teacher/reviews/" + submissionId,
          "POST",
          {
            scores: { q1: 0, q2: 1 },
            feedback: "Partial concept; explanation still needs work.",
          },
          teacher,
        )
      ).status,
      200,
    );
    const published = objects(
      (await call("/student/workspace", "GET", undefined, student)).body,
      "grades",
    );
    assert.ok(
      published.some((grade) => grade.id === submissionId && grade.score === 1),
    );
    const reviewedTrace = objects(
      (
        await call(
          "/teacher/workspace?classId=physics",
          "GET",
          undefined,
          teacher,
        )
      ).body,
      "workflows",
    ).find((run) => run.id === submissionId);
    assert.equal(reviewedTrace?.status, "complete");
    assert.ok(
      objects(reviewedTrace, "steps").some(
        (step) => step.actor === "Diagnostic",
      ),
    );

    const saraGap = column(
      store,
      "SELECT id AS value FROM gaps WHERE student_id=? AND topic=?",
      ["sara", "Force and motion"],
    );
    if (typeof saraGap !== "string") assert.fail("seeded gap missing");
    const prepared = await call(
      `/teacher/gaps/${saraGap}/explainer`,
      "POST",
      {},
      teacher,
    );
    const explainerJob = stringField(prepared.body, "jobId");
    const interventionId = stringField(
      await jobResult(explainerJob),
      "interventionId",
    );
    assert.equal(
      objects(
        (
          await call(
            "/teacher/workspace?classId=physics",
            "GET",
            undefined,
            teacher,
          )
        ).body,
        "workflows",
      ).find((run) => run.id === explainerJob)?.status,
      "awaiting_review",
    );
    assert.equal(
      (
        await call(
          `/teacher/interventions/${interventionId}/approve`,
          "POST",
          {},
          teacher,
        )
      ).status,
      200,
    );
    assert.equal(
      objects(
        (
          await call(
            "/teacher/workspace?classId=physics",
            "GET",
            undefined,
            teacher,
          )
        ).body,
        "workflows",
      ).find((run) => run.id === explainerJob)?.status,
      "complete",
    );
    const status = () =>
      column(store, "SELECT status AS value FROM gaps WHERE id=?", [saraGap]);
    const wrong = await call(
      `/student/gaps/${saraGap}/recheck`,
      "POST",
      { answer: "A constant forward force" },
      student,
    );
    assert.equal(object(wrong.body).correct, false);
    assert.equal(status(), "struggling");
    const retry = await call(
      `/student/gaps/${saraGap}/recheck`,
      "POST",
      { answer: "No net force is required" },
      student,
    );
    assert.equal(retry.status, 409);
    assert.equal(status(), "struggling");
    const secondExplanation = stringField(
      await jobResult(
        stringField(
          (
            await call(
              `/teacher/gaps/${saraGap}/explainer`,
              "POST",
              {},
              teacher,
            )
          ).body,
          "jobId",
        ),
      ),
      "interventionId",
    );
    assert.equal(
      (
        await call(
          `/teacher/interventions/${secondExplanation}/approve`,
          "POST",
          {},
          teacher,
        )
      ).status,
      200,
    );
    assert.equal(status(), "ready");
    const correct = await call(
      `/student/gaps/${saraGap}/recheck`,
      "POST",
      { answer: "No net force is required" },
      student,
    );
    assert.equal(object(correct.body).correct, true);
    assert.equal(status(), "resolved");
    const finalRuns = objects(
      (
        await call(
          "/teacher/workspace?classId=physics",
          "GET",
          undefined,
          teacher,
        )
      ).body,
      "workflows",
    );
    const recheckTrace = finalRuns.find(
      (run) =>
        run.kind === "follow_up" &&
        objects(run, "steps").some((step) =>
          String(step.detail).includes("resolved"),
        ),
    );
    assert.ok(recheckTrace);
    assert.deepEqual(
      objects(recheckTrace, "steps").map((step) => step.actor),
      ["Student", "Content", "Diagnostic"],
    );
    assert.equal(
      objects(
        (
          await call(
            `/teacher/workspace?classId=${classId}`,
            "GET",
            undefined,
            teacher,
          )
        ).body,
        "workflows",
      ).length,
      0,
    );
    assert.ok(
      Number(
        column(
          store,
          "SELECT COUNT(*) AS value FROM gaps WHERE topic=? AND status!='resolved'",
          ["Force and motion"],
        ),
      ) > 0,
    );
    assert.ok(
      Number(
        column(
          store,
          "SELECT COUNT(*) AS value FROM events WHERE agent='Diagnostic'",
          [],
        ),
      ) > 0,
    );

    const reopened = await openStore(file);
    try {
      assert.equal(
        column(reopened, "SELECT join_code AS value FROM classes WHERE id=?", [
          classId,
        ]),
        joinCode,
      );
      assert.equal(
        column(
          reopened,
          "SELECT COUNT(*) AS value FROM memberships WHERE class_id=? AND student_id=?",
          [classId, "sara"],
        ),
        1,
      );
      assert.equal(
        column(reopened, "SELECT status AS value FROM gaps WHERE id=?", [
          saraGap,
        ]),
        "resolved",
      );
      assert.equal(
        column(reopened, "SELECT status AS value FROM jobs WHERE id=?", [
          explainerJob,
        ]),
        "succeeded",
      );
      assert.equal(
        column(reopened, "SELECT id AS value FROM submissions WHERE id=?", [
          submissionId,
        ]),
        submissionId,
      );
    } finally {
      reopened.db.close();
    }

    await call("/auth/logout", "POST", {}, student);
    assert.equal(
      (await call("/student/workspace", "GET", undefined, student)).status,
      401,
    );
  } finally {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
