import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword } from "./db.js";
import { stringField } from "../test/openapi.js";
import { startTestServer, type TestServer } from "../test/support.js";
import { rosterXlsx } from "../test/xlsx.js";

const TEACHER = "teacher@gap.demo";
const SARA = "student@gap.demo";
const OMAR = "omar@gap.demo";
const NEWCOMER = "newcomer@university.edu";

type Json = Record<string, unknown>;

function rowsOf(body: unknown): Json[] {
  return (body as { rows: Json[] }).rows;
}

describe("class invitations", () => {
  let app: TestServer;
  let teacher: string;
  let sara: string;
  let omar: string;
  let classId: string;
  let joinCode: string;

  const call = (
    path: string,
    method = "GET",
    cookie?: string,
    body?: unknown,
  ) =>
    app.request("/api" + path, {
      method,
      ...(cookie === undefined ? {} : { cookie }),
      ...(body === undefined ? {} : { body }),
    });

  const upload = (filename: string, content: string | Uint8Array) =>
    app.request(
      `/api/teacher/classes/${classId}/roster/preview?filename=${encodeURIComponent(filename)}`,
      {
        method: "POST",
        cookie: teacher,
        rawBody: content,
        headers: { "Content-Type": "application/octet-stream" },
      },
    );

  const invitationsFor = async (cookie: string) =>
    (await call("/student/invitations", "GET", cookie)).body as {
      invitations: Json[];
    };

  const teacherInvitations = async () =>
    (
      (await call(`/teacher/workspace?classId=${classId}`, "GET", teacher))
        .body as { invitations: Json[] }
    ).invitations;

  before(async () => {
    app = await startTestServer();
    teacher = await app.login(TEACHER);
    sara = await app.login(SARA);
    omar = await app.login(OMAR);
    const created = await call("/teacher/classes", "POST", teacher, {
      name: "Waves and optics",
    });
    classId = stringField(created.body, "id");
    joinCode = stringField(created.body, "join_code");
  });

  after(() => app.close());

  test("previews an Excel roster without saving anything", async () => {
    const response = await upload(
      "Section A.xlsx",
      rosterXlsx([
        ["First name", "Last name", "Email"],
        ["Sara", "Ahmed", "Student@GAP.demo"],
        ["New", "Comer", NEWCOMER],
        ["Dr.", "Hassan", TEACHER],
        ["Sara", "Again", SARA],
        ["No", "Address", ""],
        ["Typo", "Mail", "typo@"],
      ]),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      rowsOf(response.body).map((row) => [
        row.row,
        row.email,
        row.status,
        row.hasAccount,
      ]),
      [
        [2, SARA, "new", true],
        [3, NEWCOMER, "new", false],
        [4, TEACHER, "invalid", false],
        [5, SARA, "duplicate", true],
        [6, "", "invalid", false],
        [7, "typo@", "invalid", false],
      ],
    );
    assert.deepEqual((response.body as Json).summary, {
      new: 2,
      invited: 0,
      enrolled: 0,
      duplicate: 1,
      invalid: 3,
    });
    assert.deepEqual(await teacherInvitations(), []);
  });

  test("rejects unusable files with a clear message", async () => {
    const cases: [string, string | Uint8Array, number, RegExp][] = [
      ["roster.xls", "x", 400, /\.xlsx\) or CSV/],
      ["roster.csv", "", 400, /non-empty/],
      ["roster.csv", "Name,Phone\nA,1", 400, /Email column/],
      ["roster.xlsx", "Name,Email", 400, /not a valid Excel/],
      ["roster.csv", "x".repeat(2 * 1024 * 1024 + 1), 413, /too large/],
    ];
    for (const [filename, content, status, message] of cases) {
      const response = await upload(filename, content);
      assert.equal(response.status, status, filename);
      assert.match(stringField(response.body, "error"), message);
    }
    const missing = await app.request(
      "/api/teacher/classes/physics/roster/preview",
      {
        method: "POST",
        cookie: teacher,
        rawBody: "Email\na@b.co",
        headers: { "Content-Type": "application/octet-stream" },
      },
    );
    assert.equal(missing.status, 400);
  });

  test("invites new students, skips the rest and reports counts", async () => {
    const response = await call(
      `/teacher/classes/${classId}/invitations`,
      "POST",
      teacher,
      {
        students: [
          { email: " Student@gap.demo ", name: "Sara Ahmed" },
          { email: NEWCOMER, name: "New Comer" },
          { email: OMAR },
          { email: TEACHER },
          { email: SARA },
        ],
      },
    );
    assert.deepEqual(response.body, { invited: 3, skipped: 2 });
    const pending = await teacherInvitations();
    assert.deepEqual(pending.map((row) => row.email).sort(), [
      NEWCOMER,
      OMAR,
      SARA,
    ]);
    assert.ok(pending.every((row) => row.status === "pending"));
    const again = await call(
      `/teacher/classes/${classId}/invitations`,
      "POST",
      teacher,
      { students: [{ email: SARA }] },
    );
    assert.deepEqual(again.body, { invited: 0, skipped: 1 });
    const preview = await upload("again.csv", `Email\n${SARA}`);
    assert.equal(rowsOf(preview.body)[0]?.status, "invited");
  });

  test("the student sees the invitation and the class is usable once accepted", async () => {
    const [invitation] = (await invitationsFor(sara)).invitations;
    assert.ok(invitation);
    assert.equal(invitation.class_name, "Waves and optics");
    assert.equal(invitation.teacher_name, "Dr. Amal Hassan");
    const id = stringField(invitation, "id");
    assert.equal(
      (await call(`/student/invitations/${id}/accept`, "POST", omar)).status,
      404,
    );
    assert.equal(
      (await call(`/student/workspace?classId=${classId}`, "GET", sara)).status,
      404,
    );

    const accepted = await call(
      `/student/invitations/${id}/accept`,
      "POST",
      sara,
    );
    assert.deepEqual(accepted.body, { id: classId, name: "Waves and optics" });
    const cards = (await call("/classes", "GET", sara)).body as {
      courses: Json[];
    };
    assert.ok(cards.courses.some((course) => course.id === classId));
    assert.equal(
      (await call(`/student/workspace?classId=${classId}`, "GET", sara)).status,
      200,
    );
    assert.equal(
      (
        await call("/student/questions", "POST", sara, {
          classId,
          text: "What is a standing wave?",
        })
      ).status,
      201,
    );
    assert.deepEqual((await invitationsFor(sara)).invitations, []);
    assert.equal(
      (await call(`/student/invitations/${id}/accept`, "POST", sara)).status,
      409,
    );
    const roster = (
      (await call(`/teacher/workspace?classId=${classId}`, "GET", teacher))
        .body as { roster: Json[] }
    ).roster;
    assert.ok(roster.some((row) => row.email === SARA));
    assert.ok(!(await teacherInvitations()).some((row) => row.email === SARA));
    const preview = await upload("again.csv", `Email\n${SARA}`);
    assert.equal(rowsOf(preview.body)[0]?.status, "enrolled");
  });

  test("a declined invitation stays visible to the teacher and can be reopened", async () => {
    const id = stringField((await invitationsFor(omar)).invitations[0], "id");
    assert.deepEqual(
      (await call(`/student/invitations/${id}/decline`, "POST", omar)).body,
      { ok: true },
    );
    assert.equal(
      (await call(`/student/invitations/${id}/decline`, "POST", omar)).status,
      409,
    );
    const declined = (await teacherInvitations()).find(
      (row) => row.email === OMAR,
    );
    assert.equal(declined?.status, "declined");
    assert.equal(typeof declined.responded_at, "string");
    const reinvite = await call(
      `/teacher/classes/${classId}/invitations`,
      "POST",
      teacher,
      { students: [{ email: OMAR, name: "Omar" }] },
    );
    assert.deepEqual(reinvite.body, { invited: 1, skipped: 0 });
    const reopened = (await invitationsFor(omar)).invitations;
    assert.equal(reopened.length, 1);
    assert.equal(reopened[0]?.id, id);
  });

  test("joining by code answers a pending invitation", async () => {
    await call("/student/classes/join", "POST", omar, { code: joinCode });
    assert.deepEqual((await invitationsFor(omar)).invitations, []);
    assert.ok(!(await teacherInvitations()).some((row) => row.email === OMAR));
  });

  test("teachers revoke pending invitations of their own classes only", async () => {
    const invitation = (await teacherInvitations()).find(
      (row) => row.email === NEWCOMER,
    );
    const id = stringField(invitation, "id");
    app.store.run("INSERT INTO users VALUES(?,?,?,?,?)", [
      "other-teacher",
      "Other Teacher",
      "other@gap.demo",
      "teacher",
      hashPassword(app.config.demoPassword),
    ]);
    const otherTeacher = await app.login("other@gap.demo");
    assert.equal(
      (await call(`/teacher/invitations/${id}/revoke`, "POST", otherTeacher))
        .status,
      404,
    );
    assert.deepEqual(
      (await call(`/teacher/invitations/${id}/revoke`, "POST", teacher)).body,
      { ok: true },
    );
    assert.equal(
      (await call(`/teacher/invitations/${id}/revoke`, "POST", teacher)).status,
      409,
    );
    assert.ok(!(await teacherInvitations()).some((row) => row.id === id));
  });

  test("teacher enrollment by email also answers the invitation", async () => {
    const student = "student2@gap.demo";
    const cookie = await app.login(student);
    await call(`/teacher/classes/${classId}/invitations`, "POST", teacher, {
      students: [{ email: student }],
    });
    assert.equal((await invitationsFor(cookie)).invitations.length, 1);
    await call(`/teacher/classes/${classId}/enroll`, "POST", teacher, {
      email: student,
    });
    assert.deepEqual((await invitationsFor(cookie)).invitations, []);
  });

  test("activity records invitations and answers", () => {
    const actions = app.store
      .all<{ action: string }>(
        "SELECT action FROM events WHERE class_id=? ORDER BY created_at",
        [classId],
      )
      .map((row) => row.action);
    for (const action of [
      "Students invited",
      "Accepted invitation",
      "Declined invitation",
      "Joined class",
      "Invitation revoked",
    ])
      assert.ok(actions.includes(action), action);
  });
});
