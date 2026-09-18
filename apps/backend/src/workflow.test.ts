import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "./db.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";
for (const key of [
  "QB_CLIENT_ID",
  "QB_CLIENT_SECRET",
  "AZURE_OPENAI_API_KEY",
  "QB_GATEWAY_TOKEN",
])
  delete process.env[key];
process.env.AI_GATEWAY_API_KEY = "";
process.env.AI_GATEWAY_MODEL = "";

test("Durable teacher/student loop enforces review, approval, isolation and verified outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gap-workflow-"));
  const file = join(directory, "test.sqlite"),
    store = await openStore(file);
  seed(store);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    origin = "http://localhost:3000",
  ) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: origin,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: (await response.json()) as any,
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
  }
  try {
    assert.equal((await request("/teacher/workspace")).status, 401);
    const teacher = await request("/auth/login", "POST", {
      email: "teacher@gap.demo",
      password: process.env.DEMO_PASSWORD || "GapDemo!2026",
    });
    const student = await request("/auth/login", "POST", {
      email: "student@gap.demo",
      password: process.env.DEMO_PASSWORD || "GapDemo!2026",
    });
    assert.equal(teacher.status, 200);
    assert.equal(student.status, 200);
    const created = await request(
      "/teacher/classes",
      "POST",
      { name: "Chemistry lab" },
      teacher.cookie,
    );
    assert.equal(created.status, 201);
    assert.match(created.data.join_code, /^[A-Z2-9]{8}$/);
    const secondClass = await request(
      "/teacher/classes",
      "POST",
      { name: "Biology lab" },
      teacher.cookie,
    );
    assert.notEqual(created.data.join_code, secondClass.data.join_code);
    assert.equal(
      (
        await request(
          "/teacher/classes",
          "POST",
          { name: "Forbidden class" },
          student.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/student/classes/join",
          "POST",
          { code: created.data.join_code },
          teacher.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/student/classes/join",
          "POST",
          { code: "INVALID!" },
          student.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/student/classes/join",
          "POST",
          { code: "ZZZZZZZZ" },
          student.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "/student/workspace?classId=" + created.data.id,
          "GET",
          undefined,
          student.cookie,
        )
      ).status,
      404,
    );
    const joined = await request(
      "/student/classes/join",
      "POST",
      { code: created.data.join_code.toLowerCase() },
      student.cookie,
    );
    assert.equal(joined.status, 201);
    assert.equal(
      (
        await request(
          "/student/classes/join",
          "POST",
          { code: created.data.join_code },
          student.cookie,
        )
      ).data.alreadyJoined,
      true,
    );
    assert.equal(
      store.one(
        "SELECT COUNT(*) AS count FROM memberships WHERE class_id=? AND student_id=?",
        [created.data.id, "sara"],
      )?.count,
      1,
    );
    const filtered = await request(
      "/student/workspace?classId=" + created.data.id,
      "GET",
      undefined,
      student.cookie,
    );
    assert.equal(filtered.status, 200);
    for (const field of ["gaps", "quizzes", "grades", "progress"])
      assert.equal(filtered.data[field].length, 0);
    const cards = await request("/classes", "GET", undefined, student.cookie);
    assert.ok(
      cards.data.courses.some((course: any) => course.id === created.data.id),
    );
    assert.ok(cards.data.courses.every((course: any) => !course.join_code));

    assert.equal(
      (await request("/teacher/workspace", "GET", undefined, student.cookie))
        .status,
      403,
    );
    assert.equal(
      (await request("/student/workspace", "GET", undefined, teacher.cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          "/auth/logout",
          "POST",
          {},
          student.cookie,
          "https://untrusted.invalid",
        )
      ).status,
      403,
    );
    const initial = await request(
      "/student/workspace",
      "GET",
      undefined,
      student.cookie,
    );
    assert.ok(
      initial.data.gaps.every(
        (g: any) => !g.probe || !("correctAnswer" in g.probe),
      ),
    );
    assert.ok(
      initial.data.quizzes.every((q: any) =>
        q.questions.every(
          (item: any) => !("correctAnswer" in item) && !("keywords" in item),
        ),
      ),
    );
    const otherGap = store.one("SELECT id FROM gaps WHERE student_id=?", [
      "omar",
    ])!;
    assert.equal(
      (
        await request(
          "/student/gaps/" + otherGap.id + "/recheck",
          "POST",
          { answer: "No net force is required" },
          student.cookie,
        )
      ).status,
      404,
    );
    const draft = await request(
      "/teacher/classes/physics/assessments",
      "POST",
      { topic: "Force and motion" },
      teacher.cookie,
    );
    assert.equal(draft.status, 202);
    async function job(id: string) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const r = await request(
          "/teacher/jobs/" + id,
          "GET",
          undefined,
          teacher.cookie,
        );
        if (r.data.status === "failed") assert.fail(r.data.error);
        if (r.data.status === "succeeded") return r.data.result;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.fail("Agent task did not finish");
    }
    const quizId = (await job(draft.data.jobId)).quizId;
    const beforePublish = await request(
      "/student/workspace",
      "GET",
      undefined,
      student.cookie,
    );
    assert.ok(!beforePublish.data.quizzes.some((q: any) => q.id === quizId));
    assert.equal(
      (
        await request(
          "/teacher/quizzes/" + quizId + "/publish",
          "POST",
          {},
          teacher.cookie,
        )
      ).status,
      200,
    );
    const submitted = await request(
      "/student/quizzes/" + quizId + "/submit",
      "POST",
      {
        answers: {
          q1: "A force in the direction of motion",
          q2: "The force changes velocity; zero force can maintain constant velocity.",
        },
      },
      student.cookie,
    );
    assert.equal(submitted.status, 201);
    assert.equal(submitted.data.status, "pending");
    assert.ok(!("score" in submitted.data));
    assert.equal(
      (
        await request(
          "/student/quizzes/" + quizId + "/submit",
          "POST",
          { answers: { q1: "Zero", q2: "force velocity zero" } },
          student.cookie,
        )
      ).status,
      409,
    );
    const pending = await request(
      "/student/workspace",
      "GET",
      undefined,
      student.cookie,
    );
    assert.ok(
      !(
        "score" in
        pending.data.quizzes.find((q: any) => q.id === quizId).submission
      ),
    );
    assert.equal(
      (
        await request(
          "/teacher/reviews/" + submitted.data.id,
          "POST",
          {
            scores: { q1: 0, q2: 1 },
            feedback: "Partial concept; explanation still needs work.",
          },
          teacher.cookie,
        )
      ).status,
      200,
    );
    const published = await request(
      "/student/workspace",
      "GET",
      undefined,
      student.cookie,
    );
    assert.ok(
      published.data.grades.some(
        (g: any) => g.id === submitted.data.id && g.score === 1,
      ),
    );
    const saraGap = store.one(
      "SELECT * FROM gaps WHERE student_id=? AND topic=?",
      ["sara", "Force and motion"],
    )!;
    const prepared = await request(
      "/teacher/gaps/" + saraGap.id + "/explainer",
      "POST",
      {},
      teacher.cookie,
    );
    const interventionId = (await job(prepared.data.jobId)).interventionId;
    assert.equal(
      (
        await request(
          "/teacher/interventions/" + interventionId + "/approve",
          "POST",
          {},
          teacher.cookie,
        )
      ).status,
      200,
    );
    const wrong = await request(
      "/student/gaps/" + saraGap.id + "/recheck",
      "POST",
      { answer: "A constant forward force" },
      student.cookie,
    );
    assert.equal(wrong.data.correct, false);
    assert.equal(
      store.one("SELECT status FROM gaps WHERE id=?", [saraGap.id])!.status,
      "struggling",
    );
    const correct = await request(
      "/student/gaps/" + saraGap.id + "/recheck",
      "POST",
      { answer: "No net force is required" },
      student.cookie,
    );
    assert.equal(correct.data.correct, true);
    assert.equal(
      store.one("SELECT status FROM gaps WHERE id=?", [saraGap.id])!.status,
      "resolved",
    );
    assert.ok(
      store.one(
        "SELECT COUNT(*) AS n FROM gaps WHERE topic=? AND status!='resolved'",
        ["Force and motion"],
      )!.n > 0,
    );
    assert.ok(
      store.one("SELECT COUNT(*) AS n FROM events WHERE agent='Diagnostic'")!
        .n > 0,
    );
    const reopened = await openStore(file);
    assert.equal(
      reopened.one("SELECT join_code FROM classes WHERE id=?", [
        created.data.id,
      ])?.join_code,
      created.data.join_code,
    );
    assert.equal(
      reopened.one(
        "SELECT COUNT(*) AS count FROM memberships WHERE class_id=? AND student_id=?",
        [created.data.id, "sara"],
      )?.count,
      1,
    );
    assert.equal(
      reopened.one("SELECT status FROM gaps WHERE id=?", [saraGap.id])!.status,
      "resolved",
    );
    assert.equal(
      reopened.one("SELECT status FROM jobs WHERE id=?", [prepared.data.jobId])!
        .status,
      "succeeded",
    );
    assert.ok(
      reopened.one("SELECT id FROM submissions WHERE id=?", [
        submitted.data.id,
      ]),
    );
    reopened.db.close();
    await request("/auth/logout", "POST", {}, student.cookie);
    assert.equal(
      (await request("/student/workspace", "GET", undefined, student.cookie))
        .status,
      401,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
