import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "../../test/support.js";

const TEACHER = "teacher@gap.demo";
const STUDENT = "student@gap.demo";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("error responses", () => {
  let app: TestServer;
  let teacher: string;
  let student: string;
  before(async () => {
    app = await startTestServer();
    teacher = await app.login(TEACHER);
    student = await app.login(STUDENT);
  });
  after(() => app.close());

  test("unknown API routes return not_found", async () => {
    const response = await app.request("/api/nothing-here", {
      cookie: teacher,
    });
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
      error: "Endpoint not found.",
      code: "not_found",
    });
  });

  test("missing session returns unauthenticated", async () => {
    const response = await app.request("/api/classes");
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      error: "Please sign in to continue.",
      code: "unauthenticated",
    });
  });

  test("wrong password returns invalid_credentials", async () => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: { email: TEACHER, password: "not-the-password" },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      error: "Email or password is incorrect.",
      code: "invalid_credentials",
    });
  });

  test("schema violations return validation_failed with the zod messages", async () => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: { email: "not-an-email", password: "x" },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: "Invalid email",
      code: "validation_failed",
    });
  });

  test("malformed JSON returns invalid_json without parser details", async () => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      rawBody: '{"email":',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: "Request body must be valid JSON.",
      code: "invalid_json",
    });
  });

  test("oversized bodies return payload_too_large", async () => {
    const response = await app.request("/api/student/questions", {
      method: "POST",
      cookie: student,
      body: { classId: "physics", text: "x".repeat(300 * 1024) },
    });
    assert.equal(response.status, 413);
    assert.deepEqual(response.body, {
      error: "Request body is too large.",
      code: "payload_too_large",
    });
  });

  test("students are refused teacher routes", async () => {
    const response = await app.request("/api/teacher/workspace", {
      cookie: student,
    });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, {
      error: "Teacher access is required.",
      code: "forbidden",
    });
  });

  test("teachers are refused student routes", async () => {
    for (const [method, path] of [
      ["GET", "/api/student/workspace"],
      ["POST", "/api/student/classes/join"],
      ["POST", "/api/student/quizzes/quiz-1/submit"],
      ["POST", "/api/student/gaps/any/recheck"],
      ["POST", "/api/student/questions"],
    ] as const) {
      const response = await app.request(path, {
        method,
        cookie: teacher,
        body: method === "POST" ? {} : undefined,
      });
      assert.equal(response.status, 403, path);
      assert.deepEqual(
        response.body,
        { error: "Student access is required.", code: "forbidden" },
        path,
      );
    }
  });

  test("missing resources keep their specific message", async () => {
    const response = await app.request("/api/teacher/quizzes/missing", {
      method: "PUT",
      cookie: teacher,
      body: {},
    });
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
      error: "Quiz not found.",
      code: "not_found",
    });
  });

  test("state conflicts return conflict", async () => {
    const response = await app.request("/api/teacher/quizzes/quiz-1", {
      method: "PUT",
      cookie: teacher,
      body: {},
    });
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, {
      error: "Published quizzes cannot be edited.",
      code: "conflict",
    });
  });

  test("API responses are not cacheable", async () => {
    const response = await app.request("/api/health");
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

describe("origin guard", () => {
  let app: TestServer;
  let student: string;
  before(async () => {
    app = await startTestServer({ APP_ORIGIN: "https://app.example.com" });
    student = await app.login(STUDENT);
  });
  after(() => app.close());

  const ask = (origin: string) =>
    app.request("/api/student/questions", {
      method: "POST",
      cookie: student,
      headers: { Origin: origin },
      body: { classId: "physics", text: "Why is the net force zero?" },
    });

  test("rejects unknown origins on state-changing requests", async () => {
    const response = await ask("https://evil.example.com");
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, {
      error: "This request origin is not permitted.",
      code: "origin_not_allowed",
    });
  });

  test("accepts the configured APP_ORIGIN", async () => {
    assert.equal((await ask("https://app.example.com")).status, 201);
  });

  test("does not check read-only requests", async () => {
    const response = await app.request("/api/classes", {
      cookie: student,
      headers: { Origin: "https://evil.example.com" },
    });
    assert.equal(response.status, 200);
  });
});

describe("rate limiting", () => {
  let app: TestServer;
  before(async () => {
    app = await startTestServer();
  });
  after(() => app.close());

  test("returns a JSON rate_limited error after 20 login attempts", async () => {
    const attempt = () =>
      app.request("/api/auth/login", {
        method: "POST",
        body: { email: TEACHER, password: "wrong-password" },
      });
    for (let i = 0; i < 20; i++) assert.equal((await attempt()).status, 401);
    const limited = await attempt();
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.body, {
      error: "Too many attempts. Please wait a minute and try again.",
      code: "rate_limited",
    });
  });
});

describe("unexpected errors", () => {
  let app: TestServer;
  before(async () => {
    app = await startTestServer();
  });
  after(() => app.close());

  test("return a generic 500 and log the cause with the request id", async () => {
    const secret = "disk failure at /var/secret/path";
    app.store.one = () => {
      throw new Error(secret);
    };
    const response = await app.request("/api/classes", {
      cookie: "gap_session=anything",
    });
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: "The operation failed. Please retry.",
      code: "internal_error",
    });
    assert.ok(!JSON.stringify(response.body).includes("secret"));
    const requestId = response.headers.get("x-request-id");
    const record = app.logs.find((log) => log.msg === "request failed");
    assert.ok(record);
    assert.equal(record.requestId, requestId);
    assert.equal(record.level, 50);
    assert.match(JSON.stringify(record.err), /disk failure/);
  });
});

describe("request context", () => {
  let app: TestServer;
  let student: string;
  before(async () => {
    app = await startTestServer();
    student = await app.login(STUDENT);
  });
  after(() => app.close());

  test("generates a request id when none is sent", async () => {
    const response = await app.request("/api/health");
    assert.match(response.headers.get("x-request-id") ?? "", UUID);
  });

  test("reuses a well-formed incoming request id", async () => {
    const response = await app.request("/api/health", {
      headers: { "X-Request-Id": "trace-123.abc_DEF" },
    });
    assert.equal(response.headers.get("x-request-id"), "trace-123.abc_DEF");
  });

  test("replaces a malformed incoming request id", async () => {
    const response = await app.request("/api/health", {
      headers: { "X-Request-Id": "bad id with spaces" },
    });
    assert.match(response.headers.get("x-request-id") ?? "", UUID);
  });

  test("logs one access line with the user and without credentials", async () => {
    const response = await app.request("/api/classes?classId=physics", {
      cookie: student,
    });
    const requestId = response.headers.get("x-request-id");
    const lines = app.logs.filter(
      (log) => log.requestId === requestId && log.msg === "request completed",
    );
    assert.equal(lines.length, 1);
    const [line] = lines;
    assert.ok(line);
    assert.equal(line.method, "GET");
    assert.equal(line.path, "/api/classes");
    assert.equal(line.status, 200);
    assert.equal(line.userId, "sara");
    assert.equal(typeof line.durationMs, "number");
    assert.ok(!JSON.stringify(app.logs).includes(student.split("=")[1] ?? ""));
  });
});
