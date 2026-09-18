import assert from "node:assert/strict";
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { afterEach, describe, test } from "node:test";
import {
  AIServiceRequestError,
  PythonAIServiceClient,
} from "./python-service.js";
import { modelJSON } from "./provider.js";
import { z } from "zod";

const servers: Server[] = [];

async function readBody(request: IncomingMessage): Promise<string> {
  let result = "";
  for await (const chunk of request) result += String(chunk);
  return result;
}

async function listen(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void>,
): Promise<string> {
  const server = createServer((request, response) => {
    void handler(request, response).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error("failed"));
    });
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Test server did not bind to a port");
  return `http://127.0.0.1:${String(address.port)}`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.close();
    await once(server, "close");
  }
});

describe("PythonAIServiceClient", () => {
  test("authenticates and maps a grounded study response", async () => {
    let receivedToken = "";
    let receivedBody: unknown;
    const url = await listen(async (request, response) => {
      receivedToken = String(request.headers["x-manara-ai-token"] ?? "");
      receivedBody = JSON.parse(await readBody(request)) as unknown;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          content: "Momentum is mass times velocity [S1].",
          sources: [
            {
              document_id: "syllabus",
              title: "Physics syllabus",
              page: null,
              slide: null,
              chunk_id: "chunk-1",
            },
          ],
          grounded: true,
          requires_human_review: false,
        }),
      );
    });
    const client = new PythonAIServiceClient({
      url,
      token: "private-token",
    });

    const result = await client.study({
      userId: "sara",
      courseId: "physics",
      message: "Explain momentum",
      courseTitle: "Physics",
      syllabus: "Momentum is mass times velocity.",
      materialVersion: 2,
      history: [],
    });

    assert.equal(receivedToken, "private-token");
    assert.deepEqual(receivedBody, {
      user_id: "sara",
      course_id: "physics",
      message: "Explain momentum",
      course_title: "Physics",
      syllabus: "Momentum is mass times velocity.",
      material_version: 2,
      history: [],
    });
    assert.equal(result.sources[0]?.documentId, "syllabus");
    assert.equal(result.grounded, true);
  });

  test("returns model JSON and rejects sidecar failures", async () => {
    const successUrl = await listen(async (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ result: { title: "Quiz" } }));
    });
    const successClient = new PythonAIServiceClient({
      url: successUrl,
      token: "private-token",
    });
    assert.deepEqual(await successClient.modelJSON("Create a quiz", {}), {
      title: "Quiz",
    });

    const failureUrl = await listen(async (_request, response) => {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ detail: "private detail" }));
    });
    const failureClient = new PythonAIServiceClient({
      url: failureUrl,
      token: "private-token",
    });
    await assert.rejects(
      failureClient.modelJSON("Create a quiz", {}),
      AIServiceRequestError,
    );
  });

  test("the existing agent provider prefers the Python sidecar", async () => {
    const url = await listen(async (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ result: { title: "Sidecar quiz" } }));
    });
    const previousUrl = process.env.AI_SERVICE_URL;
    const previousToken = process.env.AI_INTERNAL_TOKEN;
    process.env.AI_SERVICE_URL = url;
    process.env.AI_INTERNAL_TOKEN = "private-token";

    try {
      const result = await modelJSON(
        "Create a quiz",
        {},
        z.object({ title: z.string() }),
      );
      assert.deepEqual(result, { title: "Sidecar quiz" });
    } finally {
      if (previousUrl === undefined) delete process.env.AI_SERVICE_URL;
      else process.env.AI_SERVICE_URL = previousUrl;
      if (previousToken === undefined) delete process.env.AI_INTERNAL_TOKEN;
      else process.env.AI_INTERNAL_TOKEN = previousToken;
    }
  });
});
