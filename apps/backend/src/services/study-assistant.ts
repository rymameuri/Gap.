import type {
  AIServiceClient,
  StudyResponse,
} from "../agents/python-service.js";
import { flagIfConcerning } from "./wellbeing.js";
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
  if (!isMember(store, classId, studentId))
    throw new NotFoundError("Class not found.");

  const course = findClass(store, classId);
  if (course === undefined) throw new NotFoundError("Class not found.");

  const { message, conversationId } = studyAssistantBody.parse(input);
  const history = conversationId
    ? conversationHistory(store, studentId, classId, conversationId)
    : [];

  flagIfConcerning(store, classId, studentId, "assistant", message);

  if (!course.syllabus.trim())
    throw new ConflictError(
      "Your instructor needs to add course material before you can ask the Study Assistant.",
    );

  if (aiService === null)
    throw new ServiceUnavailableError(
      "The Study Assistant is not available right now.",
    );

  try {
    const response = await aiService.study({
      userId: studentId,
      courseId: course.id,
      message,
      courseTitle: course.name,
      syllabus: course.syllabus,
      materialVersion: course.material_version,
      history,
    });
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
        conversationId,
        message,
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
  } catch (error) {
    if (error instanceof AIServiceRequestError)
      throw new ServiceUnavailableError(
        "The Study Assistant is not available right now.",
      );
    throw error;
  }
}
