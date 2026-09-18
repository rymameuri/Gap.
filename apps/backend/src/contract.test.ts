import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword } from "./db.js";
import {
  Contract,
  HTTP_METHODS,
  operationKey,
  stringField,
} from "../test/openapi.js";
import { startTestServer, type TestServer } from "../test/support.js";

// The contract runs against the local engine. src/agents reads these directly
// and treats empty values as unset.
for (const key of [
  "QB_CLIENT_ID",
  "QB_CLIENT_SECRET",
  "AZURE_OPENAI_API_KEY",
  "QB_GATEWAY_TOKEN",
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_MODEL",
])
  process.env[key] = "";

const contract = new Contract();

const TEACHER = "teacher@gap.demo";
const SARA = "student@gap.demo";
const OMAR = "omar@gap.demo";
const SEED_CLASS = "physics";
const SEED_QUIZ = "quiz-1";
const SEED_PENDING_SUBMISSION = "submission-1";
const SEED_APPROVED_INTERVENTION = "welcome-explainer";
const MISSING = "does-not-exist";
const JOB_POLL_ATTEMPTS = 50;
const JOB_POLL_INTERVAL_MS = 20;

interface Question {
  id: string;
  kind: string;
  options: string[];
  correctAnswer?: string;
}
interface TeacherQuiz {
  id: string;
  status: string;
  title: string;
  questions: Question[];
}
interface Review {
  id: string;
  student_name: string;
}
interface Intervention {
  id: string;
  status: string;
}
interface StudentGap {
  id: string;
  topic: string;
  probe: { options: string[] } | null;
}

function list<T>(body: unknown, key: string): T[] {
  if (body === null || typeof body !== "object") assert.fail("expected object");
  const value = (body as Record<string, unknown>)[key];
  if (!Array.isArray(value)) assert.fail(`expected array ${key}`);
  return value as T[];
}

function concretePath(template: string): string {
  return template.replaceAll("{id}", MISSING);
}

describe("API contract", () => {
  let app: TestServer;
  let teacher: string;
  let sara: string;
  let omar: string;

  const call = async (
    operation: string,
    path: string,
    init: { cookie?: string; body?: unknown } = {},
  ): Promise<unknown> => {
    const method = operation.split(" ")[0] ?? "GET";
    return contract.check(
      operation,
      await app.request(path, { method, ...init }),
    );
  };

  const teacherWorkspace = () =>
    call("GET /api/teacher/workspace", "/api/teacher/workspace", {
      cookie: teacher,
    });

  async function finishedJob(jobId: string): Promise<unknown> {
    for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt++) {
      const job = await call(
        "GET /api/teacher/jobs/{id}",
        `/api/teacher/jobs/${jobId}`,
        {
          cookie: teacher,
        },
      );
      const status = stringField(job, "status");
      if (status === "failed") assert.fail(JSON.stringify(job));
      if (status === "succeeded") return job;
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    }
    assert.fail(`job ${jobId} did not finish`);
  }

  before(async () => {
    app = await startTestServer();
    teacher = await app.login(TEACHER);
    sara = await app.login(SARA);
    omar = await app.login(OMAR);
  });
  after(() => app.close());

  describe("session", () => {
    test("health", async () => {
      await call("GET /api/health", "/api/health");
    });

    test("login succeeds, rejects invalid bodies and wrong passwords", async () => {
      const user = await call("POST /api/auth/login", "/api/auth/login", {
        body: { email: TEACHER, password: app.config.demoPassword },
      });
      assert.equal(stringField(user, "role"), "teacher");
      await call("POST /api/auth/login", "/api/auth/login", {
        body: { email: "not-an-email", password: "x" },
      });
      await call("POST /api/auth/login", "/api/auth/login", {
        body: { email: TEACHER, password: "wrong-password" },
      });
    });

    test("me returns the signed-in user", async () => {
      const user = await call("GET /api/auth/me", "/api/auth/me", {
        cookie: sara,
      });
      assert.equal(stringField(user, "email"), SARA);
    });

    test("logout ends only that session", async () => {
      const session = await app.login(OMAR);
      await call("POST /api/auth/logout", "/api/auth/logout", {
        cookie: session,
      });
      await call("GET /api/auth/me", "/api/auth/me", { cookie: session });
      await call("GET /api/auth/me", "/api/auth/me", { cookie: omar });
    });
  });

  describe("classes and enrollment", () => {
    let classId = "";
    let joinCode = "";

    test("class cards differ by role", async () => {
      const teacherCards = list<{ id: string }>(
        await call("GET /api/classes", "/api/classes", { cookie: teacher }),
        "courses",
      );
      assert.ok(teacherCards.some((card) => card.id === SEED_CLASS));
      await call("GET /api/classes", "/api/classes", { cookie: sara });
    });

    test("teacher workspace for the default, a chosen and a missing class", async () => {
      await teacherWorkspace();
      await call(
        "GET /api/teacher/workspace",
        `/api/teacher/workspace?classId=${SEED_CLASS}`,
        { cookie: teacher },
      );
      await call(
        "GET /api/teacher/workspace",
        `/api/teacher/workspace?classId=${MISSING}`,
        { cookie: teacher },
      );
    });

    test("teacher workspace for a teacher without classes", async () => {
      app.store.run("INSERT INTO users VALUES(?,?,?,?,?)", [
        "new-teacher",
        "New Teacher",
        "new-teacher@gap.demo",
        "teacher",
        hashPassword(app.config.demoPassword),
      ]);
      const cookie = await app.login("new-teacher@gap.demo");
      const body = await call(
        "GET /api/teacher/workspace",
        "/api/teacher/workspace",
        {
          cookie,
        },
      );
      assert.deepEqual(body, { classes: [], course: null });
    });

    test("create class", async () => {
      const created = await call(
        "POST /api/teacher/classes",
        "/api/teacher/classes",
        {
          cookie: teacher,
          body: { name: "Chemistry lab" },
        },
      );
      classId = stringField(created, "id");
      joinCode = stringField(created, "join_code");
      await call("POST /api/teacher/classes", "/api/teacher/classes", {
        cookie: teacher,
        body: { name: "ab" },
      });
    });

    test("update class", async () => {
      const path = `/api/teacher/classes/${classId}`;
      await call("PUT /api/teacher/classes/{id}", path, {
        cookie: teacher,
        body: { name: "Chemistry lab", syllabus: "Unit 1: Reactions" },
      });
      await call("PUT /api/teacher/classes/{id}", path, {
        cookie: teacher,
        body: { name: "Chemistry lab", syllabus: "short" },
      });
      await call(
        "PUT /api/teacher/classes/{id}",
        `/api/teacher/classes/${MISSING}`,
        {
          cookie: teacher,
          body: { name: "Chemistry lab", syllabus: "Unit 1: Reactions" },
        },
      );
    });

    test("enroll by email", async () => {
      const path = `/api/teacher/classes/${classId}/enroll`;
      await call("POST /api/teacher/classes/{id}/enroll", path, {
        cookie: teacher,
        body: { email: OMAR },
      });
      await call("POST /api/teacher/classes/{id}/enroll", path, {
        cookie: teacher,
        body: { email: "not-an-email" },
      });
      await call("POST /api/teacher/classes/{id}/enroll", path, {
        cookie: teacher,
        body: { email: "nobody@gap.demo" },
      });
    });

    test("join by code", async () => {
      const join = (code: string) =>
        call("POST /api/student/classes/join", "/api/student/classes/join", {
          cookie: sara,
          body: { code },
        });
      const joined = await join(joinCode.toLowerCase());
      assert.equal(stringField(joined, "id"), classId);
      await join(joinCode);
      await join("bad");
      await join("ZZZZZZZZ");
    });

    test("student workspace for all, one and a foreign class", async () => {
      await call("GET /api/student/workspace", "/api/student/workspace", {
        cookie: sara,
      });
      const scoped = await call(
        "GET /api/student/workspace",
        `/api/student/workspace?classId=${classId}`,
        { cookie: sara },
      );
      assert.deepEqual(list(scoped, "quizzes"), []);
      await call(
        "GET /api/student/workspace",
        `/api/student/workspace?classId=${MISSING}`,
        { cookie: sara },
      );
    });
  });

  describe("assessments and review", () => {
    let quizId = "";

    test("draft an assessment through a job", async () => {
      const path = `/api/teacher/classes/${SEED_CLASS}/assessments`;
      const accepted = await call(
        "POST /api/teacher/classes/{id}/assessments",
        path,
        {
          cookie: teacher,
          body: { topic: "Force and motion" },
        },
      );
      const job = await finishedJob(stringField(accepted, "jobId"));
      const result = (job as { result: unknown }).result;
      quizId = stringField(result, "quizId");
      await call("POST /api/teacher/classes/{id}/assessments", path, {
        cookie: teacher,
        body: { topic: "ab" },
      });
      await call(
        "POST /api/teacher/classes/{id}/assessments",
        `/api/teacher/classes/${MISSING}/assessments`,
        { cookie: teacher, body: { topic: "Force and motion" } },
      );
      await call("GET /api/teacher/jobs/{id}", `/api/teacher/jobs/${MISSING}`, {
        cookie: teacher,
      });
    });

    test("edit the draft, reject invalid and published edits", async () => {
      const quizzes = list<TeacherQuiz>(await teacherWorkspace(), "quizzes");
      const draft = quizzes.find((quiz) => quiz.id === quizId);
      assert.ok(draft);
      assert.equal(draft.status, "draft");
      const path = `/api/teacher/quizzes/${quizId}`;
      await call("PUT /api/teacher/quizzes/{id}", path, {
        cookie: teacher,
        body: {
          title: draft.title,
          questions: draft.questions.filter(
            (question) => question.kind === "choice",
          ),
        },
      });
      await call("PUT /api/teacher/quizzes/{id}", path, {
        cookie: teacher,
        body: { title: draft.title, questions: [] },
      });
      await call(
        "PUT /api/teacher/quizzes/{id}",
        `/api/teacher/quizzes/${MISSING}`,
        {
          cookie: teacher,
          body: { title: draft.title, questions: draft.questions },
        },
      );
      await call(
        "PUT /api/teacher/quizzes/{id}",
        `/api/teacher/quizzes/${SEED_QUIZ}`,
        {
          cookie: teacher,
          body: { title: draft.title, questions: draft.questions },
        },
      );
    });

    test("publish", async () => {
      await call(
        "POST /api/teacher/quizzes/{id}/publish",
        `/api/teacher/quizzes/${quizId}/publish`,
        { cookie: teacher },
      );
      await call(
        "POST /api/teacher/quizzes/{id}/publish",
        `/api/teacher/quizzes/${MISSING}/publish`,
        { cookie: teacher },
      );
    });

    test("submit graded, pending, invalid, missing and duplicate answers", async () => {
      const quizzes = list<TeacherQuiz>(await teacherWorkspace(), "quizzes");
      const published = quizzes.find((quiz) => quiz.id === quizId);
      const question = published?.questions[0];
      assert.ok(question?.correctAnswer !== undefined);
      const path = `/api/student/quizzes/${quizId}/submit`;
      const graded = await call("POST /api/student/quizzes/{id}/submit", path, {
        cookie: sara,
        body: { answers: { [question.id]: question.correctAnswer } },
      });
      assert.equal(stringField(graded, "status"), "graded");
      await call("POST /api/student/quizzes/{id}/submit", path, {
        cookie: sara,
        body: { answers: { [question.id]: question.correctAnswer } },
      });
      await call("POST /api/student/quizzes/{id}/submit", path, {
        cookie: omar,
        body: { answers: { [question.id]: "not an option" } },
      });
      const pending = await call(
        "POST /api/student/quizzes/{id}/submit",
        `/api/student/quizzes/${SEED_QUIZ}/submit`,
        {
          cookie: omar,
          body: {
            answers: {
              q1: "Thermal energy",
              q2: "The kinetic energy becomes thermal energy in the brakes.",
            },
          },
        },
      );
      assert.equal(stringField(pending, "status"), "pending");
      await call(
        "POST /api/student/quizzes/{id}/submit",
        `/api/student/quizzes/${MISSING}/submit`,
        { cookie: omar, body: { answers: {} } },
      );
    });

    test("students never see answer keys or pending scores", async () => {
      await call("GET /api/student/workspace", "/api/student/workspace", {
        cookie: omar,
      });
    });

    test("approve reviews, reject incomplete, repeated and missing reviews", async () => {
      const reviews = list<Review>(await teacherWorkspace(), "reviews");
      const omarReview = reviews.find(
        (review) => review.student_name === "Omar Ali",
      );
      assert.ok(omarReview);
      await call(
        "POST /api/teacher/reviews/{id}",
        `/api/teacher/reviews/${omarReview.id}`,
        {
          cookie: teacher,
          body: { scores: {} },
        },
      );
      const path = `/api/teacher/reviews/${SEED_PENDING_SUBMISSION}`;
      await call("POST /api/teacher/reviews/{id}", path, {
        cookie: teacher,
        body: { scores: { q1: 0, q2: 1 }, feedback: "Name the energy form." },
      });
      await call("POST /api/teacher/reviews/{id}", path, {
        cookie: teacher,
        body: { scores: { q1: 0, q2: 1 } },
      });
      await call(
        "POST /api/teacher/reviews/{id}",
        `/api/teacher/reviews/${MISSING}`,
        {
          cookie: teacher,
          body: { scores: {} },
        },
      );
      const grades = list<{ id: string }>(
        await call("GET /api/student/workspace", "/api/student/workspace", {
          cookie: sara,
        }),
        "grades",
      );
      assert.ok(grades.some((grade) => grade.id === SEED_PENDING_SUBMISSION));
    });
  });

  describe("explanations and follow-up", () => {
    let interventionId = "";

    test("prepare an explanation through a job", async () => {
      const gaps = list<{ id: string; class_id: string }>(
        await teacherWorkspace(),
        "gaps",
      );
      const gap = gaps.find((item) => item.class_id === SEED_CLASS);
      assert.ok(gap);
      const accepted = await call(
        "POST /api/teacher/gaps/{id}/explainer",
        `/api/teacher/gaps/${gap.id}/explainer`,
        { cookie: teacher },
      );
      const job = await finishedJob(stringField(accepted, "jobId"));
      interventionId = stringField(
        (job as { result: unknown }).result,
        "interventionId",
      );
      await call(
        "POST /api/teacher/gaps/{id}/explainer",
        `/api/teacher/gaps/${MISSING}/explainer`,
        { cookie: teacher },
      );
    });

    test("edit a draft explanation, reject short, missing and shared ones", async () => {
      const content =
        "Energy is transferred to the surroundings as heat; it is not destroyed.";
      await call(
        "PUT /api/teacher/interventions/{id}",
        `/api/teacher/interventions/${interventionId}`,
        { cookie: teacher, body: { content } },
      );
      await call(
        "PUT /api/teacher/interventions/{id}",
        `/api/teacher/interventions/${interventionId}`,
        { cookie: teacher, body: { content: "too short" } },
      );
      await call(
        "PUT /api/teacher/interventions/{id}",
        `/api/teacher/interventions/${MISSING}`,
        { cookie: teacher, body: { content } },
      );
      await call(
        "PUT /api/teacher/interventions/{id}",
        `/api/teacher/interventions/${SEED_APPROVED_INTERVENTION}`,
        { cookie: teacher, body: { content } },
      );
    });

    test("approve once", async () => {
      const path = `/api/teacher/interventions/${interventionId}/approve`;
      await call("POST /api/teacher/interventions/{id}/approve", path, {
        cookie: teacher,
      });
      await call("POST /api/teacher/interventions/{id}/approve", path, {
        cookie: teacher,
      });
      await call(
        "POST /api/teacher/interventions/{id}/approve",
        `/api/teacher/interventions/${MISSING}/approve`,
        { cookie: teacher },
      );
      const interventions = list<Intervention>(
        await teacherWorkspace(),
        "interventions",
      );
      assert.equal(
        interventions.find((item) => item.id === interventionId)?.status,
        "approved",
      );
    });

    test("recheck with an option, a non-option and someone else's gap", async () => {
      const gaps = list<StudentGap>(
        await call("GET /api/student/workspace", "/api/student/workspace", {
          cookie: sara,
        }),
        "gaps",
      );
      const ready = gaps.find((gap) => gap.probe !== null);
      const option = ready?.probe?.options[0];
      assert.ok(ready && option !== undefined);
      const path = `/api/student/gaps/${ready.id}/recheck`;
      await call("POST /api/student/gaps/{id}/recheck", path, {
        cookie: sara,
        body: { answer: "not an option" },
      });
      await call("POST /api/student/gaps/{id}/recheck", path, {
        cookie: sara,
        body: { answer: option },
      });
      await call("POST /api/student/gaps/{id}/recheck", path, {
        cookie: omar,
        body: { answer: option },
      });
    });

    test("ask a question in a joined class only", async () => {
      await call("POST /api/student/questions", "/api/student/questions", {
        cookie: sara,
        body: { classId: SEED_CLASS, text: "Why does a puck keep moving?" },
      });
      await call("POST /api/student/questions", "/api/student/questions", {
        cookie: sara,
        body: { classId: SEED_CLASS, text: "hi" },
      });
      await call("POST /api/student/questions", "/api/student/questions", {
        cookie: sara,
        body: { classId: MISSING, text: "Why does a puck keep moving?" },
      });
    });
  });

  describe("access control", () => {
    const bodyFor = (method: string) => (method === "GET" ? undefined : {});

    test("every session-protected operation rejects missing sessions", async () => {
      for (const operation of contract.operations.filter(
        (op) => op.requiresSession,
      ))
        await call(operation.key, concretePath(operation.path), {
          body: bodyFor(operation.method),
        });
    });

    test("every role-restricted operation rejects the other role", async () => {
      for (const operation of contract.operations.filter((op) =>
        op.statuses.includes("403"),
      )) {
        const cookie = operation.path.startsWith("/api/teacher/")
          ? sara
          : teacher;
        await call(operation.key, concretePath(operation.path), {
          cookie,
          body: bodyFor(operation.method),
        });
      }
    });
  });
});

describe("rate limits", () => {
  // Each limit gets its own server: limiters count per client for the
  // lifetime of the app, and logging in counts toward the login limit.
  async function statusesOf(
    operation: string,
    attempts: number,
    send: (server: TestServer) => Promise<{
      status: number;
      headers: Headers;
      body: unknown;
    }>,
    prepare?: (server: TestServer) => Promise<void>,
  ): Promise<number[]> {
    const server = await startTestServer();
    try {
      await prepare?.(server);
      const statuses: number[] = [];
      for (let i = 0; i < attempts; i++) {
        const response = await send(server);
        contract.check(operation, response);
        statuses.push(response.status);
      }
      return statuses;
    } finally {
      await server.close();
    }
  }

  test("login allows 20 attempts per minute", async () => {
    const statuses = await statusesOf("POST /api/auth/login", 21, (server) =>
      server.request("/api/auth/login", {
        method: "POST",
        body: { email: TEACHER, password: "wrong-password" },
      }),
    );
    assert.deepEqual(statuses, [...Array<number>(20).fill(401), 429]);
  });

  test("joining allows 15 attempts per minute", async () => {
    let student = "";
    const statuses = await statusesOf(
      "POST /api/student/classes/join",
      16,
      (server) =>
        server.request("/api/student/classes/join", {
          method: "POST",
          cookie: student,
          body: { code: "ZZZZZZZZ" },
        }),
      async (server) => {
        student = await server.login(OMAR);
      },
    );
    assert.deepEqual(statuses, [...Array<number>(15).fill(404), 429]);
  });
});

describe("contract completeness", () => {
  test("every Express route is documented and every documented path exists", async () => {
    const server = await startTestServer();
    try {
      // Express 4 keeps registered routes on the private _router stack.
      const internals = server.app as unknown as {
        _router: {
          stack: {
            route?: { path: string; methods: Record<string, boolean> };
          }[];
        };
      };
      const routes = internals._router.stack.flatMap((layer) =>
        layer.route === undefined
          ? []
          : Object.keys(layer.route.methods)
              .filter((method) =>
                (HTTP_METHODS as readonly string[]).includes(method),
              )
              .map((method) =>
                operationKey(
                  method,
                  (layer.route?.path ?? "").replaceAll(/:(\w+)/g, "{$1}"),
                ),
              ),
      );
      assert.deepEqual(
        [...routes].sort(),
        contract.operations.map((operation) => operation.key).sort(),
      );
    } finally {
      await server.close();
    }
  });

  test("operation ids are unique", () => {
    const ids = contract.operations.map((operation) => operation.operationId);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every documented response is exercised", () => {
    assert.deepEqual(contract.unexercised(), []);
  });
});
