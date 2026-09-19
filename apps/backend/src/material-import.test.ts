import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DocumentImportError,
  type AIServiceClient,
} from "./agents/python-service.js";
import { DOCUMENT_UPLOAD_LIMIT } from "./constants.js";
import { importCourseMaterial } from "./services/material-import.js";
import { startTestServer } from "../test/support.js";

const extractedText = "Momentum is mass times velocity. Momentum is a vector.";

function reader(fail?: Error): AIServiceClient {
  return {
    study: () => Promise.reject(new Error("Not used in this test")),
    modelJSON: () => Promise.resolve({}),
    extractDocument(filename, content) {
      assert.equal(filename, "lesson.pdf");
      assert.ok(content.length > 0);
      return fail === undefined
        ? Promise.resolve({ text: extractedText, sectionCount: 1 })
        : Promise.reject(fail);
    },
  };
}

describe("course material import", () => {
  test("requires ownership and returns a preview before the existing save step", async () => {
    const server = await startTestServer({}, reader());
    const path =
      "/api/teacher/classes/physics/materials/import?filename=lesson.pdf";
    const init = {
      method: "POST",
      rawBody: "%PDF-test",
      headers: { "Content-Type": "application/octet-stream" },
    };
    try {
      const teacher = await server.login("teacher@gap.demo");
      const student = await server.login("student@gap.demo");
      const original = server.store.one(
        "SELECT syllabus, material_version FROM classes WHERE id='physics'",
      );
      assert.equal((await server.request(path, init)).status, 401);
      assert.equal(
        (await server.request(path, { ...init, cookie: student })).status,
        403,
      );
      const missing = await server.request(
        path.replace("/physics/", "/missing/"),
        { ...init, cookie: teacher },
      );
      assert.equal(missing.status, 404);
      const preview = await server.request(path, { ...init, cookie: teacher });
      assert.equal(preview.status, 200);
      assert.deepEqual(preview.body, { text: extractedText, sectionCount: 1 });
      assert.deepEqual(
        server.store.one(
          "SELECT syllabus, material_version FROM classes WHERE id='physics'",
        ),
        original,
      );
      const saved = await server.request("/api/teacher/classes/physics", {
        method: "PUT",
        cookie: teacher,
        body: { name: "Physics", syllabus: extractedText },
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(
        server.store.one(
          "SELECT syllabus, material_version FROM classes WHERE id='physics'",
        ),
        {
          syllabus: extractedText,
          material_version: 2,
        },
      );
      const workspace = await server.request(
        "/api/student/workspace?classId=physics",
        { cookie: student },
      );
      assert.equal(workspace.status, 200);
      assert.ok(JSON.stringify(workspace.body).includes(extractedText));
    } finally {
      await server.close();
    }
  });

  test("validates file type, body and size before contacting the reader", async () => {
    const content = Buffer.from("course material");
    for (const name of [
      undefined,
      "bad.exe",
      "../lesson.pdf",
      "C:\\lesson.pdf",
      "a".repeat(210) + ".pdf",
    ])
      await assert.rejects(importCourseMaterial(null, name, content), {
        status: 400,
      });
    await assert.rejects(importCourseMaterial(null, "lesson.pdf", {}), {
      status: 400,
    });
    await assert.rejects(
      importCourseMaterial(null, "lesson.pdf", Buffer.alloc(0)),
      { status: 400 },
    );
    await assert.rejects(
      importCourseMaterial(
        null,
        "lesson.pdf",
        Buffer.alloc(DOCUMENT_UPLOAD_LIMIT + 1),
      ),
      { status: 413 },
    );
    await assert.rejects(importCourseMaterial(null, "lesson.pdf", content), {
      status: 503,
    });
  });

  test("returns safe document errors without exposing internal failures", async () => {
    const content = Buffer.from("course material");
    await assert.rejects(
      importCourseMaterial(
        reader(new DocumentImportError("empty_document")),
        "lesson.pdf",
        content,
      ),
      {
        status: 400,
        message:
          "No readable text was found. Scanned PDFs need OCR before importing.",
      },
    );
    await assert.rejects(
      importCourseMaterial(
        reader(new DocumentImportError("document_too_large")),
        "lesson.pdf",
        content,
      ),
      { status: 413 },
    );
    await assert.rejects(
      importCourseMaterial(
        reader(new Error("private detail")),
        "lesson.pdf",
        content,
      ),
      {
        status: 503,
        message:
          "The document reader is unavailable. Check the AI service and try again.",
      },
    );
  });
});
