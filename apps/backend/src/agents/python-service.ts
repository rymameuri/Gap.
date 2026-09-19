import { z } from "zod";

export interface PythonAIConfig {
  readonly url: string;
  readonly token: string;
}

export interface StudyMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface StudyRequest {
  readonly userId: string;
  readonly courseId: string;
  readonly message: string;
  readonly courseTitle: string;
  readonly syllabus: string;
  readonly materialVersion: number;
  readonly history: readonly StudyMessage[];
}

export interface StudySource {
  readonly documentId: string;
  readonly title: string;
  readonly page: number | null;
  readonly slide: number | null;
  readonly chunkId: string | null;
}

export interface StudyResponse {
  readonly content: string;
  readonly sources: readonly StudySource[];
  readonly grounded: boolean;
  readonly requiresHumanReview: boolean;
}

export type StudyStreamUpdate =
  | { readonly type: "status"; readonly message: string }
  | { readonly type: "delta"; readonly text: string };

export type StudyWorkflowAgent =
  "orchestrator" | "study" | "assessment" | "diagnostic" | "reviewer";

export interface DocumentImportResult {
  readonly text: string;
  readonly sectionCount: number;
}

const documentErrors = {
  unsupported_type:
    "Choose a PDF, Word (.docx), PowerPoint (.pptx), or text (.txt) file.",
  empty_document:
    "No readable text was found. Scanned PDFs need OCR before importing.",
  invalid_document:
    "This document could not be read. Check the file or export it again.",
  invalid_text: "Save this text file with UTF-8 encoding and try again.",
  document_too_large:
    "The document is too large. Choose a file under 25 MB or split it into smaller files.",
  text_too_long:
    "The extracted text exceeds the 50,000-character editor limit. Split the document into smaller sections.",
  encrypted_document:
    "Password-protected PDFs cannot be imported. Upload an unlocked copy.",
} as const;

export class DocumentImportError extends Error {
  constructor(readonly code: keyof typeof documentErrors) {
    super(documentErrors[code]);
    this.name = "DocumentImportError";
  }
}

const importedDocument = z.object({
  text: z.string().min(10).max(50_000),
  section_count: z.number().int().positive(),
});
const importFailure = z.object({ detail: z.object({ code: z.string() }) });

export interface PendingStudyReview {
  readonly id: string;
  readonly content: string;
  readonly sources: readonly StudySource[];
  readonly issues: readonly string[];
}

export type AIStudyResponse = StudyResponse & {
  readonly pendingReview?: PendingStudyReview;
  readonly workflow?: {
    readonly routedTo: StudyWorkflowAgent;
    readonly producedBy: StudyWorkflowAgent;
  };
};

export interface AIServiceClient {
  extractDocument(
    filename: string,
    content: Uint8Array,
  ): Promise<DocumentImportResult>;
  study(request: StudyRequest): Promise<AIStudyResponse>;
  studyStream?(
    request: StudyRequest,
    onUpdate: (update: StudyStreamUpdate) => void | Promise<void>,
  ): Promise<AIStudyResponse>;
  modelJSON(instructions: string, data: unknown): Promise<unknown>;
}

export class AIServiceRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIServiceRequestError";
  }
}

const internalSource = z.object({
  document_id: z.string(),
  title: z.string(),
  page: z.number().int().positive().nullable(),
  slide: z.number().int().positive().nullable(),
  chunk_id: z.string().nullable(),
});

const internalStudyResponse = z.object({
  content: z.string(),
  sources: z.array(internalSource),
  grounded: z.boolean(),
  requires_human_review: z.boolean(),
  routed_to: z
    .enum(["orchestrator", "study", "assessment", "diagnostic", "reviewer"])
    .optional(),
  produced_by: z
    .enum(["orchestrator", "study", "assessment", "diagnostic", "reviewer"])
    .optional(),
  pending_review: z
    .object({
      id: z.string(),
      content: z.string(),
      sources: z.array(internalSource),
      issues: z.array(z.string()),
    })
    .nullable()
    .optional(),
});

const internalStudyStreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), message: z.string().min(1) }),
  z.object({ type: z.literal("delta"), text: z.string().min(1) }),
  z.object({ type: z.literal("complete"), response: internalStudyResponse }),
  z.object({ type: z.literal("error"), message: z.string().min(1) }),
]);

const internalModelResponse = z.object({
  result: z.record(z.unknown()),
});

export class PythonAIServiceClient implements AIServiceClient {
  readonly #baseUrl: string;
  readonly #token: string;

  constructor(config: PythonAIConfig) {
    this.#baseUrl = config.url.replace(/\/$/, "");
    this.#token = config.token;
  }

  async study(request: StudyRequest): Promise<AIStudyResponse> {
    const response = internalStudyResponse.parse(
      await this.#post("/v1/study", this.#studyBody(request)),
    );

    return this.#studyResponse(response);
  }

  async studyStream(
    request: StudyRequest,
    onUpdate: (update: StudyStreamUpdate) => void | Promise<void>,
  ): Promise<AIStudyResponse> {
    let response: Response;

    try {
      response = await fetch(this.#baseUrl + "/v1/study/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Manara-AI-Token": this.#token,
        },
        body: JSON.stringify(this.#studyBody(request)),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new AIServiceRequestError(
        "The AI service is unavailable. Please try again.",
      );
    }

    if (!response.ok)
      throw new AIServiceRequestError(
        `The AI service is unavailable (${String(response.status)}).`,
      );

    if (response.body === null)
      throw new AIServiceRequestError(
        "The AI service returned an empty stream.",
      );

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed: AIStudyResponse | undefined;

    const consumeLine = async (line: string): Promise<void> => {
      if (!line.trim()) return;

      let event: z.infer<typeof internalStudyStreamEvent>;
      try {
        event = internalStudyStreamEvent.parse(JSON.parse(line));
      } catch {
        throw new AIServiceRequestError(
          "The AI service returned an invalid stream event.",
        );
      }

      if (event.type === "status") {
        await onUpdate({ type: "status", message: event.message });
        return;
      }

      if (event.type === "delta") {
        await onUpdate({ type: "delta", text: event.text });
        return;
      }

      if (event.type === "error")
        throw new AIServiceRequestError(event.message);

      completed = this.#studyResponse(event.response);
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        if (buffer.length > 100_000)
          throw new AIServiceRequestError(
            "The AI service returned an oversized stream event.",
          );

        let boundary = buffer.indexOf("\n");
        while (boundary !== -1) {
          const line = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 1);
          await consumeLine(line);
          boundary = buffer.indexOf("\n");
        }

        if (done) break;
      }

      if (buffer.trim()) await consumeLine(buffer);
    } finally {
      reader.releaseLock();
    }

    if (completed === undefined)
      throw new AIServiceRequestError(
        "The AI service ended the stream before completing the answer.",
      );

    return completed;
  }

  #studyBody(request: StudyRequest): Record<string, unknown> {
    return {
      user_id: request.userId,
      course_id: request.courseId,
      message: request.message,
      course_title: request.courseTitle,
      syllabus: request.syllabus,
      material_version: request.materialVersion,
      history: request.history,
    };
  }

  #studyResponse(
    response: z.infer<typeof internalStudyResponse>,
  ): AIStudyResponse {
    const source = (item: z.infer<typeof internalSource>): StudySource => ({
      documentId: item.document_id,
      title: item.title,
      page: item.page,
      slide: item.slide,
      chunkId: item.chunk_id,
    });

    return {
      content: response.content,
      sources: response.sources.map(source),
      grounded: response.grounded,
      requiresHumanReview: response.requires_human_review,
      ...(response.routed_to && response.produced_by
        ? {
            workflow: {
              routedTo: response.routed_to,
              producedBy: response.produced_by,
            },
          }
        : {}),
      ...(response.pending_review
        ? {
            pendingReview: {
              id: response.pending_review.id,
              content: response.pending_review.content,
              sources: response.pending_review.sources.map(source),
              issues: response.pending_review.issues,
            },
          }
        : {}),
    };
  }

  async extractDocument(
    filename: string,
    content: Uint8Array,
  ): Promise<DocumentImportResult> {
    let response: Response;
    try {
      response = await fetch(
        this.#baseUrl +
          "/v1/documents/extract?filename=" +
          encodeURIComponent(filename),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Manara-AI-Token": this.#token,
          },
          body: new Uint8Array(content),
          signal: AbortSignal.timeout(45_000),
        },
      );
    } catch {
      throw new AIServiceRequestError("The document reader is unavailable.");
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = importFailure.safeParse(payload);
      if ([400, 413].includes(response.status) && failure.success) {
        const code = failure.data.detail.code;
        if (Object.hasOwn(documentErrors, code))
          throw new DocumentImportError(code as keyof typeof documentErrors);
      }
      throw new AIServiceRequestError("The document reader is unavailable.");
    }
    const result = importedDocument.safeParse(payload);
    if (!result.success)
      throw new AIServiceRequestError(
        "The document reader returned an invalid response.",
      );
    return { text: result.data.text, sectionCount: result.data.section_count };
  }

  async modelJSON(instructions: string, data: unknown): Promise<unknown> {
    return internalModelResponse.parse(
      await this.#post("/v1/model-json", { instructions, data }),
    ).result;
  }

  async #post(path: string, body: unknown): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(this.#baseUrl + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Manara-AI-Token": this.#token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      throw new AIServiceRequestError(
        "The AI service is unavailable. Please try again.",
      );
    }

    if (!response.ok)
      throw new AIServiceRequestError(
        `The AI service is unavailable (${String(response.status)}).`,
      );

    try {
      return await response.json();
    } catch (error) {
      throw new AIServiceRequestError(
        "The AI service returned an invalid response.",
      );
    }
  }
}

export function createAIServiceClient(
  config: PythonAIConfig | null,
): AIServiceClient | null {
  return config === null ? null : new PythonAIServiceClient(config);
}
