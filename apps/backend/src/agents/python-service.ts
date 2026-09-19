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

export interface AIServiceClient {
  extractDocument(
    filename: string,
    content: Uint8Array,
  ): Promise<DocumentImportResult>;
  study(request: StudyRequest): Promise<StudyResponse>;
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
});

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

  async study(request: StudyRequest): Promise<StudyResponse> {
    const response = internalStudyResponse.parse(
      await this.#post("/v1/study", {
        user_id: request.userId,
        course_id: request.courseId,
        message: request.message,
        course_title: request.courseTitle,
        syllabus: request.syllabus,
        material_version: request.materialVersion,
        history: request.history,
      }),
    );

    return {
      content: response.content,
      sources: response.sources.map((source) => ({
        documentId: source.document_id,
        title: source.title,
        page: source.page,
        slide: source.slide,
        chunkId: source.chunk_id,
      })),
      grounded: response.grounded,
      requiresHumanReview: response.requires_human_review,
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
