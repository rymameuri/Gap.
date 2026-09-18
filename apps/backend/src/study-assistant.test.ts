import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AIServiceRequestError,
  type AIServiceClient,
  type StudyRequest,
} from "./agents/python-service.js";
import { startTestServer } from "../test/support.js";

class FakeAIService implements AIServiceClient {
  readonly requests: StudyRequest[] = [];
  fail = false;

  study(request: StudyRequest) {
    this.requests.push(request);
    if (this.fail)
      return Promise.reject(new AIServiceRequestError("sidecar unavailable"));
    return Promise.resolve({
      content: "Momentum equals mass times velocity [S1].",
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
  }

  modelJSON(): Promise<unknown> {
    return Promise.resolve({});
  }
}

describe("student Study Assistant", () => {
  test("passes trusted identity and course data to the AI sidecar", async () => {
    const ai = new FakeAIService();
    const server = await startTestServer({}, ai);
    try {
      const cookie = await server.login("student@gap.demo");
      const response = await server.request(
        "/api/student/classes/physics/assistant",
        {
          method: "POST",
          cookie,
          body: {
            message: "Explain momentum",
            history: [{ role: "user", content: "What is mass?" }],
          },
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        content: "Momentum equals mass times velocity [S1].",
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
      assert.equal(ai.requests.length, 1);
      const request = ai.requests[0];
      assert.ok(request);
      assert.equal(request.userId, "sara");
      assert.equal(request.courseId, "physics");
      assert.equal(request.materialVersion, 1);
      assert.match(request.syllabus, /Newton's laws/);
    } finally {
      await server.close();
    }
  });

  test("checks role and enrolment before accepting a prompt", async () => {
    const ai = new FakeAIService();
    const server = await startTestServer({}, ai);
    try {
      const teacher = await server.login("teacher@gap.demo");
      const teacherResponse = await server.request(
        "/api/student/classes/physics/assistant",
        { method: "POST", cookie: teacher, body: { message: "Explain" } },
      );
      assert.equal(teacherResponse.status, 403);

      const student = await server.login("student@gap.demo");
      const missingResponse = await server.request(
        "/api/student/classes/missing/assistant",
        { method: "POST", cookie: student, body: {} },
      );
      assert.equal(missingResponse.status, 404);
      assert.equal(ai.requests.length, 0);
    } finally {
      await server.close();
    }
  });

  test("returns safe errors for invalid input and unavailable AI", async () => {
    const ai = new FakeAIService();
    const server = await startTestServer({}, ai);
    try {
      const cookie = await server.login("student@gap.demo");
      const invalid = await server.request(
        "/api/student/classes/physics/assistant",
        { method: "POST", cookie, body: { message: "" } },
      );
      assert.equal(invalid.status, 400);

      ai.fail = true;
      const unavailable = await server.request(
        "/api/student/classes/physics/assistant",
        { method: "POST", cookie, body: { message: "Explain momentum" } },
      );
      assert.equal(unavailable.status, 503);
      assert.deepEqual(unavailable.body, {
        error: "The Study Assistant is not available right now.",
        code: "service_unavailable",
      });
    } finally {
      await server.close();
    }
  });

  test("returns 503 when the AI sidecar is not configured", async () => {
    const server = await startTestServer({}, null);
    try {
      const cookie = await server.login("student@gap.demo");
      const response = await server.request(
        "/api/student/classes/physics/assistant",
        { method: "POST", cookie, body: { message: "Explain momentum" } },
      );
      assert.equal(response.status, 503);
    } finally {
      await server.close();
    }
  });
});
