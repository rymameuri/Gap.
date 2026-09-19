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
import { strToU8, zipSync } from "fflate";
import { rosterXlsx } from "../test/xlsx.js";
import type { AIServiceClient } from "./agents/python-service.js";

// The contract runs against the local engine. src/agents reads these directly
// and treats empty values as unset.
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

const contract = new Contract();

const TEACHER = "teacher@gap.demo";
const MISSING_UUID = "00000000-0000-4000-8000-000000000000";
const SARA = "student@gap.demo";
const OMAR = "omar@gap.demo";
const SEED_CLASS = "physics";
const SEED_QUIZ = "quiz-1";
const SEED_PENDING_SUBMISSION = "submission-1";
const SEED_APPROVED_INTERVENTION = "welcome-explainer";
const MISSING = "does-not-exist";
const JOB_POLL_ATTEMPTS = 50;
const JOB_POLL_INTERVAL_MS = 20;
let contractReviewMode = false;

const contractAI: AIServiceClient = {
  extractDocument() {
    return Promise.resolve({
      text: "Imported physics course material.",
      sectionCount: 1,
    });
  },
  study() {
    if (contractReviewMode) {
      contractReviewMode = false;
      return Promise.resolve({
        content:
          "This response needs instructor review before it can be shown.",
        sources: [],
        grounded: false,
        requiresHumanReview: true,
        pendingReview: {
          id: "contract-agent-review",
          content: "A draft explanation for teacher review.",
          sources: [],
          issues: ["Needs review"],
        },
      });
    }
    return Promise.resolve({
      content: "A net force changes an object's velocity [S1].",
      sources: [
        {
          documentId: "syllabus",
          title: "Introduction to Physics syllabus",
          page: null,
          slide: null,
          chunkId: "physics-1",
        },
      ],
      grounded: true,
      requiresHumanReview: false,
    });
  },
  modelJSON(): Promise<unknown> {
    return Promise.resolve({});
  },
};

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
  status: string;
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
    init: {
      cookie?: string;
      body?: unknown;
      rawBody?: string | Uint8Array;
      headers?: Record<string, string>;
    } = {},
  ): Promise<unknown> => {
    const method = operation.split(" ")[0] ?? "GET";
    return contract.check(
      operation,
      await app.request(path, { method, ...init }),
    );
  };

  const binaryCall = async (
    operation: string,
    path: string,
    cookie: string,
    content: Uint8Array,
  ): Promise<unknown> => {
    const response = await fetch(app.baseUrl + path, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:3000",
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(content),
    });
    return contract.check(operation, {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    });
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
    app = await startTestServer({}, contractAI, () =>
      Promise.resolve({ title: "Forces", text: "Newton's laws." }),
    );
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
      const renamed = await app.request(path, {
        method: "PUT",
        cookie: teacher,
        body: { name: "Renamed Chemistry lab", syllabus: "" },
      });
      assert.equal(renamed.status, 200);
      assert.deepEqual(
        app.store.one("SELECT name,syllabus FROM classes WHERE id=?", [
          classId,
        ]),
        { name: "Renamed Chemistry lab", syllabus: "" },
      );
      await call("PUT /api/teacher/classes/{id}", path, {
        cookie: teacher,
        body: { name: "Chemistry lab", syllabus: "Unit 1: Reactions" },
      });
      await call("PUT /api/teacher/classes/{id}", path, {
        cookie: teacher,
        body: { name: "Chemistry lab", syllabus: "x".repeat(50001) },
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

    test("stores, lists, downloads, and deletes course files with validation", async () => {
      const uploadOperation = "POST /api/teacher/classes/{id}/files";
      const uploadPath = `/api/teacher/classes/${classId}/files?filename=notes.txt`;
      const uploaded = await binaryCall(
        uploadOperation,
        uploadPath,
        teacher,
        Buffer.from("Course notes for this class."),
      );
      const fileId = stringField(uploaded, "id");
      await binaryCall(
        uploadOperation,
        uploadPath.replace("notes.txt", "bad.pdf"),
        teacher,
        Buffer.from("not a PDF"),
      );
      await binaryCall(
        uploadOperation,
        uploadPath.replace(`/${classId}/`, "/missing/"),
        teacher,
        Buffer.from("Course notes"),
      );
      await binaryCall(
        uploadOperation,
        uploadPath,
        teacher,
        Buffer.alloc(5 * 1024 * 1024 + 1, 65),
      );
      const listed = await call(
        "GET /api/classes/{id}/files",
        `/api/classes/${classId}/files`,
        { cookie: sara },
      );
      assert.equal(list<{ id: string }>(listed, "files")[0]?.id, fileId);
      await call("GET /api/classes/{id}/files", "/api/classes/missing/files", {
        cookie: sara,
      });
      const downloaded = await fetch(
        `${app.baseUrl}/api/classes/${classId}/files/${fileId}`,
        { headers: { Cookie: sara } },
      );
      assert.equal(await downloaded.text(), "Course notes for this class.");
      contract.check("GET /api/classes/{id}/files/{fileId}", {
        status: downloaded.status,
        headers: downloaded.headers,
        body: null,
      });
      await call(
        "GET /api/classes/{id}/files/{fileId}",
        `/api/classes/${classId}/files/missing`,
        { cookie: sara },
      );
      await call(
        "DELETE /api/teacher/classes/{id}/files/{fileId}",
        `/api/teacher/classes/${classId}/files/${fileId}`,
        { cookie: teacher },
      );
      await call(
        "DELETE /api/teacher/classes/{id}/files/{fileId}",
        `/api/teacher/classes/${classId}/files/missing`,
        { cookie: teacher },
      );
      app.store.transaction(() => {
        for (let index = 0; index < 20; index++)
          app.store.run(
            "INSERT INTO course_files(id,class_id,uploaded_by,filename,mime_type,size_bytes,sha256,content,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            [
              `quota-${String(index)}`,
              classId,
              "teacher",
              `quota-${String(index)}.txt`,
              "text/plain",
              1,
              "a".repeat(64),
              new Uint8Array([65]),
              "stored",
              new Date().toISOString(),
            ],
          );
      });
      await binaryCall(
        uploadOperation,
        uploadPath,
        teacher,
        Buffer.from("More notes"),
      );
    });
  });

  describe("material import", () => {
    const operation = "POST /api/teacher/classes/{id}/materials/import";
    const path =
      "/api/teacher/classes/physics/materials/import?filename=lecture.pdf";
    const upload = {
      rawBody: "%PDF-document",
      headers: { "Content-Type": "application/octet-stream" },
    };

    test("documents previews, validation, ownership and upload limits", async () => {
      await call(operation, path, { cookie: teacher, ...upload });
      await call(operation, path.replace("lecture.pdf", "old.doc"), {
        cookie: teacher,
        ...upload,
      });
      await call(operation, path.replace("/physics/", "/missing/"), {
        cookie: teacher,
        ...upload,
      });
      await call(operation, path, {
        cookie: teacher,
        ...upload,
        rawBody: "x".repeat(25 * 1024 * 1024 + 1),
      });
    });

    test("documents an unavailable document reader", async () => {
      const server = await startTestServer({}, null);
      try {
        const cookie = await server.login(TEACHER);
        contract.check(
          operation,
          await server.request(path, { method: "POST", cookie, ...upload }),
        );
      } finally {
        await server.close();
      }
    });
  });

  describe("roster invitations", () => {
    const preview = "POST /api/teacher/classes/{id}/roster/preview";
    const invite = "POST /api/teacher/classes/{id}/invitations";
    const revoke = "POST /api/teacher/invitations/{id}/revoke";
    const listInvitations = "GET /api/student/invitations";
    const accept = "POST /api/student/invitations/{id}/accept";
    const decline = "POST /api/student/invitations/{id}/decline";
    const octet = { "Content-Type": "application/octet-stream" };
    let rosterClass = "";

    const pendingFor = async (cookie: string) =>
      list<{ id: string; class_id: string }>(
        await call(listInvitations, "/api/student/invitations", { cookie }),
        "invitations",
      ).filter((invitation) => invitation.class_id === rosterClass);

    before(async () => {
      rosterClass = stringField(
        await call("POST /api/teacher/classes", "/api/teacher/classes", {
          cookie: teacher,
          body: { name: "Roster import" },
        }),
        "id",
      );
    });

    test("previews Excel and CSV rosters and rejects unusable uploads", async () => {
      const path = (filename: string, classId = rosterClass) =>
        `/api/teacher/classes/${classId}/roster/preview?filename=${filename}`;
      const workbook = rosterXlsx([
        ["Name", "Email"],
        ["Sara Ahmed", SARA],
        ["No address", ""],
      ]);
      const body = await call(preview, path("roster.xlsx"), {
        cookie: teacher,
        rawBody: workbook,
        headers: octet,
      });
      assert.deepEqual(
        list<{ status: string }>(body, "rows").map((row) => row.status),
        ["new", "invalid"],
      );
      await call(preview, path("roster.xls"), {
        cookie: teacher,
        rawBody: "Email",
        headers: octet,
      });
      await call(preview, path("roster.csv", MISSING), {
        cookie: teacher,
        rawBody: "Email",
        headers: octet,
      });
      await call(preview, path("roster.csv"), {
        cookie: teacher,
        rawBody: "x".repeat(2 * 1024 * 1024 + 1),
        headers: octet,
      });
    });

    test("invites, lists, accepts, declines and revokes", async () => {
      const path = (classId: string) =>
        `/api/teacher/classes/${classId}/invitations`;
      assert.deepEqual(
        await call(invite, path(rosterClass), {
          cookie: teacher,
          body: {
            students: [
              { email: SARA, name: "Sara Ahmed" },
              { email: OMAR },
              { email: "future.student@university.edu" },
            ],
          },
        }),
        { invited: 3, skipped: 0 },
      );
      await call(invite, path(rosterClass), {
        cookie: teacher,
        body: { students: [] },
      });
      await call(invite, path(MISSING), {
        cookie: teacher,
        body: { students: [{ email: SARA }] },
      });

      const [forSara] = await pendingFor(sara);
      assert.ok(forSara);
      await call(accept, `/api/student/invitations/${forSara.id}/accept`, {
        cookie: omar,
      });
      await call(accept, `/api/student/invitations/${forSara.id}/accept`, {
        cookie: sara,
      });
      await call(accept, `/api/student/invitations/${forSara.id}/accept`, {
        cookie: sara,
      });

      const [forOmar] = await pendingFor(omar);
      assert.ok(forOmar);
      await call(decline, `/api/student/invitations/${forOmar.id}/decline`, {
        cookie: sara,
      });
      await call(decline, `/api/student/invitations/${forOmar.id}/decline`, {
        cookie: omar,
      });
      await call(decline, `/api/student/invitations/${forOmar.id}/decline`, {
        cookie: omar,
      });

      const invitations = list<{ id: string; status: string }>(
        await call(
          "GET /api/teacher/workspace",
          `/api/teacher/workspace?classId=${rosterClass}`,
          { cookie: teacher },
        ),
        "invitations",
      );
      assert.deepEqual(
        invitations.map((invitation) => invitation.status),
        ["pending", "declined"],
      );
      const waiting = invitations[0]?.id ?? "";
      await call(revoke, `/api/teacher/invitations/${waiting}/revoke`, {
        cookie: teacher,
      });
      await call(revoke, `/api/teacher/invitations/${waiting}/revoke`, {
        cookie: teacher,
      });
      await call(revoke, `/api/teacher/invitations/${MISSING}/revoke`, {
        cookie: teacher,
      });
    });
  });

  describe("study assistant", () => {
    const operation = "POST /api/student/classes/{id}/assistant";

    test("answers from a joined course and validates safe failure cases", async () => {
      const path = `/api/student/classes/${SEED_CLASS}/assistant`;
      const response = await call(operation, path, {
        cookie: sara,
        body: { message: "Explain net force" },
      });
      assert.equal((response as { grounded: boolean }).grounded, true);

      await call(operation, path, {
        cookie: sara,
        body: { message: "" },
      });
      await call(operation, `/api/student/classes/${MISSING}/assistant`, {
        cookie: sara,
        body: { message: "Explain net force" },
      });

      const course = app.store.one<{ syllabus: string }>(
        "SELECT syllabus FROM classes WHERE id=?",
        [SEED_CLASS],
      );
      assert.ok(course);
      app.store.run("UPDATE classes SET syllabus='' WHERE id=?", [SEED_CLASS]);
      try {
        await call(operation, path, {
          cookie: sara,
          body: { message: "Explain net force" },
        });
      } finally {
        app.store.run("UPDATE classes SET syllabus=? WHERE id=?", [
          course.syllabus,
          SEED_CLASS,
        ]);
      }
    });

    test("documents an unavailable AI sidecar", async () => {
      const server = await startTestServer({}, null);
      try {
        const cookie = await server.login(SARA);
        contract.check(
          operation,
          await server.request(`/api/student/classes/${SEED_CLASS}/assistant`, {
            method: "POST",
            cookie,
            body: { message: "Explain net force" },
          }),
        );
      } finally {
        await server.close();
      }
    });
  });

  describe("teacher companion", () => {
    const operation = "POST /api/teacher/classes/{id}/companion";
    const stub = {
      extractDocument: () => Promise.reject(new Error("unused")),
      study: () => Promise.reject(new Error("unused")),
      modelJSON: () =>
        Promise.resolve({
          answer: "Run a small-group session on your top gap.",
          usedNotes: ["kb-small-group"],
          usedClassData: true,
        }),
    };

    test("answers, cites its sources, and rejects bad requests", async () => {
      const server = await startTestServer({}, stub);
      try {
        const cookie = await server.login(TEACHER);
        const ask = async (id: string, body: unknown) =>
          contract.check(
            operation,
            await server.request(`/api/teacher/classes/${id}/companion`, {
              method: "POST",
              cookie,
              body,
            }),
          );
        const ok = await ask(SEED_CLASS, {
          message: "How do I run a small-group intervention?",
        });
        const reply = ok as { sources?: { kind: string }[] };
        assert.deepEqual(reply.sources?.map((s) => s.kind).sort(), [
          "class",
          "pedagogy",
        ]);
        await ask(SEED_CLASS, { message: "" });
        await ask(MISSING, { message: "Hello" });

        const base = `/api/teacher/classes/${SEED_CLASS}/companion`;
        const listOp = "GET /api/teacher/classes/{id}/companion/chats";
        const chatOp = "GET /api/teacher/classes/{id}/companion/chats/{chatId}";
        const delOp =
          "DELETE /api/teacher/classes/{id}/companion/chats/{chatId}";
        const get = (path: string) => server.request(path, { cookie });
        const chatId = (ok as { chatId: string }).chatId;

        // A follow-up stays in the same chat; a fresh message starts another.
        const again = await ask(SEED_CLASS, {
          message: "And for the whole class?",
          chatId,
        });
        assert.equal((again as { chatId: string }).chatId, chatId);
        const other = await ask(SEED_CLASS, { message: "Plan a warm-up" });
        const otherId = (other as { chatId: string }).chatId;
        assert.notEqual(otherId, chatId);
        await ask(SEED_CLASS, { message: "Hi", chatId: MISSING_UUID });

        const chats = contract.check(listOp, await get(`${base}/chats`)) as {
          chats: { id: string }[];
        };
        assert.deepEqual(
          chats.chats.map((c) => c.id),
          [otherId, chatId],
        );
        contract.check(
          listOp,
          await get(`/api/teacher/classes/${MISSING}/companion/chats`),
        );
        const saved = contract.check(
          chatOp,
          await get(`${base}/chats/${chatId}`),
        ) as { messages: { role: string }[] };
        assert.deepEqual(
          saved.messages.map((m) => m.role),
          ["user", "assistant", "user", "assistant"],
        );
        contract.check(chatOp, await get(`${base}/chats/${MISSING_UUID}`));
        const del = (path: string) =>
          server.request(path, { method: "DELETE", cookie });
        contract.check(delOp, await del(`${base}/chats/${otherId}`));
        contract.check(delOp, await del(`${base}/chats/${otherId}`));
        const left = contract.check(listOp, await get(`${base}/chats`)) as {
          chats: unknown[];
        };
        assert.equal(left.chats.length, 1);
      } finally {
        await server.close();
      }
    });

    test("documents an unavailable AI sidecar", async () => {
      const server = await startTestServer({}, null);
      try {
        const cookie = await server.login(TEACHER);
        contract.check(
          operation,
          await server.request(`/api/teacher/classes/${SEED_CLASS}/companion`, {
            method: "POST",
            cookie,
            body: { message: "Hello" },
          }),
        );
      } finally {
        await server.close();
      }
    });
  });

  describe("saved conversations and AI review", () => {
    test("lists, reads, and deletes student-owned conversations", async () => {
      const asked = await call(
        "POST /api/student/classes/{id}/assistant",
        "/api/student/classes/physics/assistant",
        { cookie: sara, body: { message: "Explain acceleration" } },
      );
      const conversationId = stringField(asked, "conversationId");
      await call(
        "GET /api/student/classes/{id}/conversations",
        "/api/student/classes/physics/conversations",
        { cookie: sara },
      );
      await call(
        "GET /api/student/classes/{id}/conversations",
        "/api/student/classes/missing/conversations",
        { cookie: sara },
      );
      await call(
        "GET /api/student/conversations/{id}",
        `/api/student/conversations/${conversationId}`,
        { cookie: sara },
      );
      await call(
        "GET /api/student/conversations/{id}",
        "/api/student/conversations/missing",
        { cookie: sara },
      );
      await call(
        "DELETE /api/student/conversations/{id}",
        `/api/student/conversations/${conversationId}`,
        { cookie: sara },
      );
      await call(
        "DELETE /api/student/conversations/{id}",
        `/api/student/conversations/${conversationId}`,
        { cookie: sara },
      );
    });

    test("teacher reviews a held AI response through the durable queue", async () => {
      contractReviewMode = true;
      const asked = await call(
        "POST /api/student/classes/{id}/assistant",
        "/api/student/classes/physics/assistant",
        { cookie: sara, body: { message: "Help with motion" } },
      );
      assert.ok(!JSON.stringify(asked).includes("draft explanation"));
      const workspace = await teacherWorkspace();
      assert.ok(
        list<{ id: string }>(workspace, "agentReviews").some(
          (item) => item.id === "contract-agent-review",
        ),
      );
      const operation = "POST /api/teacher/agent-reviews/{id}";
      const path = "/api/teacher/agent-reviews/contract-agent-review";
      await call(operation, path, {
        cookie: teacher,
        body: { action: "invalid" },
      });
      await call(operation, "/api/teacher/agent-reviews/missing", {
        cookie: teacher,
        body: { action: "publish" },
      });
      await call(operation, path, {
        cookie: teacher,
        body: { action: "publish" },
      });
      await call(operation, path, {
        cookie: teacher,
        body: { action: "publish" },
      });
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
      await call(
        "POST /api/teacher/quizzes/{id}/publish",
        `/api/teacher/quizzes/${SEED_QUIZ}/publish`,
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

    test("recheck with a non-option and someone else's gap", async () => {
      // Later quiz evidence can resolve a gap first, so use whichever
      // student still has an open follow-up.
      let owner = "";
      let ready: StudentGap | undefined;
      for (const cookie of [sara, omar]) {
        ready = list<StudentGap>(
          await call("GET /api/student/workspace", "/api/student/workspace", {
            cookie,
          }),
          "gaps",
        ).find((gap) => gap.probe !== null && gap.status !== "resolved");
        owner = cookie;
        if (ready) break;
      }
      const option = ready?.probe?.options[0];
      assert.ok(ready && option !== undefined);
      app.store.run("UPDATE gaps SET status='ready' WHERE id=?", [ready.id]);
      const path = `/api/student/gaps/${ready.id}/recheck`;
      await call("POST /api/student/gaps/{id}/recheck", path, {
        cookie: owner,
        body: { answer: "not an option" },
      });
      // The accepted answer is exercised by the next test, which needs the
      // student's single attempt.
      await call("POST /api/student/gaps/{id}/recheck", path, {
        cookie: owner === sara ? omar : sara,
        body: { answer: option },
      });
    });

    test("a resolved gap cannot be rechecked again", async () => {
      const gaps = list<StudentGap>(
        await call("GET /api/student/workspace", "/api/student/workspace", {
          cookie: omar,
        }),
        "gaps",
      );
      const gap = gaps.find(
        (item) => item.topic === "Force and motion" && item.probe !== null,
      );
      assert.ok(gap);
      const path = `/api/student/gaps/${gap.id}/recheck`;
      const answer = { answer: "No net force is required" };
      const first = await call("POST /api/student/gaps/{id}/recheck", path, {
        cookie: omar,
        body: answer,
      });
      assert.equal(stringField(first, "status"), "resolved");
      const again = await call("POST /api/student/gaps/{id}/recheck", path, {
        cookie: omar,
        body: answer,
      });
      assert.deepEqual(again, {
        error: "This gap is already resolved.",
        code: "conflict",
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
  describe("sources, presentations and wellbeing flags", () => {
    const classPath = `/api/teacher/classes/${SEED_CLASS}`;
    const deck = Buffer.from(
      zipSync({
        "ppt/slides/slide1.xml": strToU8(
          "<p:sld><a:t>Forces and motion</a:t></p:sld>",
        ),
      }),
    );
    const slides = [
      {
        title: "Intro",
        bullets: ["Force", "Mass"],
        notes: "Private teacher notes",
      },
    ];

    test("sources", async () => {
      const op = "POST /api/teacher/classes/{id}/sources/decks";
      await binaryCall(
        op,
        `${classPath}/sources/decks?name=forces.pptx`,
        teacher,
        deck,
      );
      await binaryCall(
        op,
        `${classPath}/sources/decks?name=forces.txt`,
        teacher,
        Buffer.from("x"),
      );
      await binaryCall(
        op,
        `/api/teacher/classes/${MISSING}/sources/decks?name=forces.pptx`,
        teacher,
        deck,
      );
      const link = "POST /api/teacher/classes/{id}/sources/links";
      await call(link, `${classPath}/sources/links`, {
        cookie: teacher,
        body: { url: "https://example.com/forces" },
      });
      await call(link, `${classPath}/sources/links`, {
        cookie: teacher,
        body: { url: "https://example.com/forces" },
      });
      await call(link, `${classPath}/sources/links`, {
        cookie: teacher,
        body: { url: "ftp://example.com" },
      });
      await call(link, `/api/teacher/classes/${MISSING}/sources/links`, {
        cookie: teacher,
        body: { url: "https://example.com/other" },
      });
      const listSources = "GET /api/teacher/classes/{id}/sources";
      const listed = await call(listSources, `${classPath}/sources`, {
        cookie: teacher,
      });
      assert.equal(list(listed, "sources").length, 2);
      await call(listSources, `/api/teacher/classes/${MISSING}/sources`, {
        cookie: teacher,
      });
    });

    test("presentations from draft to students", async () => {
      const create = "POST /api/teacher/classes/{id}/presentations";
      const created = await call(create, `${classPath}/presentations`, {
        cookie: teacher,
        body: { title: "Forces", slides },
      });
      const id = stringField(created, "id");
      await call(create, `${classPath}/presentations`, {
        cookie: teacher,
        body: { title: "", slides: [] },
      });
      await call(create, `/api/teacher/classes/${MISSING}/presentations`, {
        cookie: teacher,
        body: { title: "Forces", slides },
      });
      const listOp = "GET /api/teacher/classes/{id}/presentations";
      assert.equal(
        list(
          await call(listOp, `${classPath}/presentations`, {
            cookie: teacher,
          }),
          "presentations",
        ).length,
        1,
      );
      await call(listOp, `/api/teacher/classes/${MISSING}/presentations`, {
        cookie: teacher,
      });

      const studentOp = "GET /api/student/classes/{id}/presentations";
      const studentPath = `/api/student/classes/${SEED_CLASS}/presentations`;
      assert.equal(
        list(
          await call(studentOp, studentPath, { cookie: sara }),
          "presentations",
        ).length,
        0,
        "drafts stay hidden",
      );
      await call(studentOp, "/api/student/classes/missing/presentations", {
        cookie: sara,
      });

      const put = "PUT /api/teacher/presentations/{id}";
      await call(put, `/api/teacher/presentations/${id}`, {
        cookie: teacher,
        body: { title: "Forces 2", slides },
      });
      await call(put, `/api/teacher/presentations/${id}`, {
        cookie: teacher,
        body: { title: "", slides },
      });
      await call(put, `/api/teacher/presentations/${MISSING}`, {
        cookie: teacher,
        body: { title: "Forces", slides },
      });

      const publish = "POST /api/teacher/presentations/{id}/publish";
      await call(publish, `/api/teacher/presentations/${id}/publish`, {
        cookie: teacher,
        body: { published: true },
      });
      const published = await call(studentOp, studentPath, { cookie: sara });
      assert.ok(!JSON.stringify(published).includes("Private teacher notes"));
      await call(publish, `/api/teacher/presentations/${id}/publish`, {
        cookie: teacher,
        body: { published: "yes" },
      });
      await call(publish, `/api/teacher/presentations/${MISSING}/publish`, {
        cookie: teacher,
        body: { published: true },
      });
      assert.equal(
        list(
          await call(studentOp, studentPath, { cookie: sara }),
          "presentations",
        ).length,
        1,
      );

      const del = "DELETE /api/teacher/presentations/{id}";
      await call(del, `/api/teacher/presentations/${id}`, {
        cookie: teacher,
      });
      await call(del, `/api/teacher/presentations/${MISSING}`, {
        cookie: teacher,
      });
    });

    test("generating a deck", async () => {
      const op = "POST /api/teacher/classes/{id}/presentations/generate";
      const made = await call(op, `${classPath}/presentations/generate`, {
        cookie: teacher,
        body: { title: "Forces", focus: "Newton's laws" },
      });
      assert.ok(list(made, "slides").length > 1);
      await call(op, `${classPath}/presentations/generate`, {
        cookie: teacher,
        body: { title: "" },
      });
      await call(op, `/api/teacher/classes/${MISSING}/presentations/generate`, {
        cookie: teacher,
        body: { title: "Forces" },
      });
    });

    test("a worrying question raises a flag the teacher can follow up", async () => {
      await call("POST /api/student/questions", "/api/student/questions", {
        cookie: sara,
        body: { classId: SEED_CLASS, text: "i don't want to live anymore" },
      });
      const workspace = await teacherWorkspace();
      const flags = list<{ id: string; student_name: string }>(
        workspace,
        "flags",
      );
      assert.equal(flags.length, 1);
      const id = flags[0]?.id ?? "";
      const op = "PUT /api/teacher/flags/{id}";
      await call(op, `/api/teacher/flags/${id}`, {
        cookie: teacher,
        body: { status: "reached_out", note: "Spoke after class." },
      });
      await call(op, `/api/teacher/flags/${id}`, {
        cookie: teacher,
        body: { status: "nonsense" },
      });
      await call(op, `/api/teacher/flags/${MISSING}`, {
        cookie: teacher,
        body: { status: "resolved" },
      });
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
