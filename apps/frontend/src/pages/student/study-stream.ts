import { ApiError } from "../../services/api";
import type { StudyAssistantResponse } from "../../services/types";

export type StudyStreamUpdate =
  | { type: "status"; message: string }
  | { type: "delta"; text: string };

type StreamEvent =
  | StudyStreamUpdate
  | { type: "complete"; response: StudyAssistantResponse }
  | { type: "error"; message: string };

function isResponse(value: unknown): value is StudyAssistantResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<StudyAssistantResponse>;
  return (
    typeof response.content === "string" &&
    Array.isArray(response.sources) &&
    typeof response.grounded === "boolean" &&
    typeof response.requiresHumanReview === "boolean"
  );
}

function parseEvent(line: string): StreamEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("The Study Assistant returned an invalid stream.");
  }

  if (typeof value !== "object" || value === null)
    throw new Error("The Study Assistant returned an invalid stream.");

  const event = value as Record<string, unknown>;

  if (event.type === "status" && typeof event.message === "string")
    return { type: "status", message: event.message };

  if (event.type === "delta" && typeof event.text === "string")
    return { type: "delta", text: event.text };

  if (event.type === "error" && typeof event.message === "string")
    return { type: "error", message: event.message };

  if (event.type === "complete" && isResponse(event.response))
    return { type: "complete", response: event.response };

  throw new Error("The Study Assistant returned an invalid stream.");
}

export async function streamStudyAssistant(
  courseId: string,
  body: unknown,
  onUpdate: (update: StudyStreamUpdate) => void,
): Promise<StudyAssistantResponse> {
  const response = await fetch(
    `/api/student/classes/${encodeURIComponent(courseId)}/assistant`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new ApiError(
      payload?.error || "The Study Assistant is not available right now.",
      response.status,
    );
  }

  if (response.body === null)
    throw new Error("The Study Assistant returned an empty stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: StudyAssistantResponse | undefined;

  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = parseEvent(line);

    if (event.type === "status" || event.type === "delta") {
      onUpdate(event);
      return;
    }

    if (event.type === "error") throw new Error(event.message);
    completed = event.response;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      if (buffer.length > 100_000)
        throw new Error("The Study Assistant returned an invalid stream.");

      let boundary = buffer.indexOf("\n");
      while (boundary !== -1) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 1);
        boundary = buffer.indexOf("\n");
      }

      if (done) break;
    }

    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }

  if (completed === undefined)
    throw new Error("The Study Assistant response ended before completion.");

  return completed;
}
