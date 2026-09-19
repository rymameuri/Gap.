import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "./db.js";
import { seed } from "./seed.js";
import { uploadCourseFile } from "./services/materials.js";
import { startTestServer, ALLOWED_ORIGIN } from "../test/support.js";

test("course file upload is owned, listed without bytes, and downloadable by members", async () => {
  const server = await startTestServer();
  try {
    const teacher = await server.login("teacher@gap.demo");
    const student = await server.login("student@gap.demo");
    const upload = (cookie: string, filename: string, bytes: Uint8Array) =>
      fetch(
        `${server.baseUrl}/api/teacher/classes/physics/files?filename=${encodeURIComponent(filename)}`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: ALLOWED_ORIGIN,
            "Content-Type": "application/octet-stream",
          },
          body: new Uint8Array(bytes),
        },
      );
    assert.equal(
      (await upload(student, "notes.txt", Buffer.from("A lesson"))).status,
      403,
    );
    assert.equal(
      (await upload(teacher, "bad.pdf", Buffer.from("not a pdf"))).status,
      400,
    );
    const saved = await upload(
      teacher,
      "notes.txt",
      Buffer.from("Forces and motion"),
    );
    assert.equal(saved.status, 201);
    const file = (await saved.json()) as {
      id: string;
      status: string;
      filename: string;
    };
    assert.equal(file.status, "stored");
    assert.equal(file.filename, "notes.txt");
    assert.ok(!JSON.stringify(file).includes("Forces and motion"));
    const list = await server.request("/api/classes/physics/files", {
      cookie: student,
    });
    assert.equal(list.status, 200);
    assert.equal(
      (list.body as { files: { id: string }[] }).files[0]?.id,
      file.id,
    );
    const download = await fetch(
      `${server.baseUrl}/api/classes/physics/files/${file.id}`,
      { headers: { Cookie: student } },
    );
    assert.equal(download.status, 200);
    assert.equal(await download.text(), "Forces and motion");
    assert.match(
      download.headers.get("content-disposition") ?? "",
      /attachment/,
    );
    assert.equal(
      (
        await server.request(`/api/teacher/classes/physics/files/${file.id}`, {
          method: "DELETE",
          cookie: student,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await server.request(`/api/teacher/classes/physics/files/${file.id}`, {
          method: "DELETE",
          cookie: teacher,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await server.request(`/api/classes/physics/files/${file.id}`, {
          cookie: student,
        })
      ).status,
      404,
    );
  } finally {
    await server.close();
  }
});

test("stored course-file bytes survive reopening SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "course-files-"));
  const path = join(directory, "app.sqlite");
  try {
    const first = await openStore(path);
    seed(first, "demo-password");
    const file = uploadCourseFile(
      first,
      "teacher",
      "physics",
      "lesson.txt",
      Buffer.from("Independent evidence"),
    );
    first.db.close();
    const reopened = await openStore(path);
    const row = reopened.one<{ content: Uint8Array; status: string }>(
      "SELECT content,status FROM course_files WHERE id=?",
      [file.id],
    );
    assert.equal(
      Buffer.from(row?.content ?? []).toString(),
      "Independent evidence",
    );
    assert.equal(row?.status, "stored");
    reopened.db.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
