import {
  DocumentImportError,
  type AIServiceClient,
  type DocumentImportResult,
} from "../agents/python-service.js";
import { DOCUMENT_UPLOAD_LIMIT } from "../constants.js";
import {
  BadRequestError,
  PayloadTooLargeError,
  ServiceUnavailableError,
} from "../errors.js";

/** Returns extracted text for review; saving uses the existing class update API. */
export async function importCourseMaterial(
  aiService: AIServiceClient | null,
  filename: string | undefined,
  content: unknown,
): Promise<DocumentImportResult> {
  if (
    filename === undefined ||
    filename.length > 200 ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\u0000") ||
    !/\.(pdf|docx|pptx|txt)$/i.test(filename)
  )
    throw new BadRequestError(
      "Choose a PDF, Word (.docx), PowerPoint (.pptx), or text (.txt) file.",
    );
  if (!Buffer.isBuffer(content) || content.length === 0)
    throw new BadRequestError(
      "Send a non-empty file as application/octet-stream.",
    );
  if (content.length > DOCUMENT_UPLOAD_LIMIT)
    throw new PayloadTooLargeError("The file exceeds the 25 MB upload limit.");
  if (aiService === null)
    throw new ServiceUnavailableError(
      "The document reader is not running. Start the AI service and try again.",
    );
  try {
    return await aiService.extractDocument(filename, content);
  } catch (error) {
    if (error instanceof DocumentImportError) {
      if (error.code === "document_too_large")
        throw new PayloadTooLargeError(error.message);
      throw new BadRequestError(error.message);
    }
    throw new ServiceUnavailableError(
      "The document reader is unavailable. Check the AI service and try again.",
    );
  }
}
