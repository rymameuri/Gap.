import type {
  AIServiceClient,
  AIStudyResponse,
  StudyRequest,
  StudyResponse,
  StudyStreamUpdate,
} from "../agents/python-service.js";
import type { Store } from "../db.js";
import { AIServiceRequestError } from "../agents/python-service.js";
import { recordAgentReview } from "./agent-reviews.js";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from "../errors.js";
import { findClass, isMember } from "../repositories/classes.js";
import {
  appendConversationTurn,
  conversationHistory,
} from "./conversations.js";
import { studyAssistantBody } from "../validation.js";

interface PreparedStudyRequest {
  aiService: AIServiceClient;
  request: StudyRequest;
  message: string;
  conversationId?: string;
}

function prepareStudyRequest(
  store: Store,
  aiService: AIServiceClient | null,
  studentId: string,
  classId: string,
  input: unknown,
): PreparedStudyRequest {
  if (!isMember(store, classId, studentId))
    throw new NotFoundError("Class not found.");

  const course = findClass(store, classId);
  if (course === undefined) throw new NotFoundError("Class not found.");

  const { message, conversationId } = studyAssistantBody.parse(input);
  const history = conversationId
    ? conversationHistory(store, studentId, classId, conversationId)
    : [];

  if (!course.syllabus.trim())
    throw new ConflictError(
      "Your instructor needs to add course material before you can ask the Study Assistant.",
    );

  if (aiService === null)
    throw new ServiceUnavailableError(
      "The Study Assistant is not available right now.",
    );

  return {
    aiService,
    message,
    ...(conversationId === undefined ? {} : { conversationId }),
    request: {
      userId: studentId,
      courseId: course.id,
      message,
      courseTitle: course.name,
      syllabus: course.syllabus,
      materialVersion: course.material_version,
      history,
    },
  };
}

function persistStudyResponse(
  store: Store,
  studentId: string,
  classId: string,
  prepared: PreparedStudyRequest,
  response: AIStudyResponse,
): StudyResponse & { conversationId: string } {
  const { pendingReview, ...safeResponse } = response;

  if (safeResponse.requiresHumanReview && !pendingReview)
    throw new ServiceUnavailableError(
      "The Study Assistant could not save this item for instructor review.",
    );

  return store.transaction(() => {
    const saved = appendConversationTurn(
      store,
      studentId,
      classId,
      prepared.conversationId,
      prepared.message,
      safeResponse,
    );

    if (pendingReview)
      recordAgentReview(
        store,
        classId,
        studentId,
        saved.conversationId,
        saved.assistantMessageId,
        pendingReview,
      );

    return { ...safeResponse, conversationId: saved.conversationId };
  });
}

function unavailable(error: unknown): never {
  if (error instanceof AIServiceRequestError)
    throw new ServiceUnavailableError(
      "The Study Assistant is not available right now.",
    );
  throw error;
}

/**
 * Ask the private course-grounded Study Agent as an enrolled student.
 * Authentication identity and course material always come from trusted data.
 */
export async function askStudyAssistant(
  store: Store,
  aiService: AIServiceClient | null,
  studentId: string,
  classId: string,
  input: unknown,
): Promise<StudyResponse & { conversationId: string }> {
  const prepared = prepareStudyRequest(
    store,
    aiService,
    studentId,
    classId,
    input,
  );

  try {
    const response = await prepared.aiService.study(prepared.request);
    return persistStudyResponse(store, studentId, classId, prepared, response);
  } catch (error) {
    unavailable(error);
  }
}

/**
 * Stream only Study Assistant progress/content. Validation and persistence are
 * identical to the normal request path, and the existing endpoint remains a
 * JSON fallback for clients that do not request streaming.
 */
export async function streamStudyAssistant(
  store: Store,
  aiService: AIServiceClient | null,
  studentId: string,
  classId: string,
  input: unknown,
  onUpdate: (update: StudyStreamUpdate) => void | Promise<void>,
): Promise<StudyResponse & { conversationId: string }> {
  const prepared = prepareStudyRequest(
    store,
    aiService,
    studentId,
    classId,
    input,
  );

  try {
    const response = prepared.aiService.studyStream
      ? await prepared.aiService.studyStream(prepared.request, onUpdate)
      : await prepared.aiService.study(prepared.request);

    return persistStudyResponse(store, studentId, classId, prepared, response);
  } catch (error) {
    unavailable(error);
  }
}
