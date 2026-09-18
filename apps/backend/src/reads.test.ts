import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "../test/support.js";

function totalChanges(app: TestServer): number {
  const row = app.store.one<{ changes: number }>(
    "SELECT total_changes() AS changes",
  );
  assert.ok(row);
  return row.changes;
}

describe("reads do not write", () => {
  let app: TestServer;
  let teacher: string;
  let student: string;
  before(async () => {
    app = await startTestServer();
    teacher = await app.login("teacher@gap.demo");
    student = await app.login("student@gap.demo");
  });
  after(() => app.close());

  for (const [role, path] of [
    ["teacher", "/api/classes"],
    ["student", "/api/classes"],
    ["teacher", "/api/teacher/workspace"],
    ["student", "/api/student/workspace"],
  ] as const)
    test(`GET ${path} as ${role} changes no rows`, async () => {
      const before = totalChanges(app);
      const response = await app.request(path, {
        cookie: role === "teacher" ? teacher : student,
      });
      assert.equal(response.status, 200);
      assert.equal(totalChanges(app), before);
    });
});
