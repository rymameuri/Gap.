import type {
  AIServiceClient,
  StudyResponse,
} from "../agents/python-service.js";
import type { Store } from "../db.js";
import { AIServiceRequestError } from "../agents/python-service.js";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from "../errors.js";
import { findClass, isMember } from "../repositories/classes.js";
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
): Promise<StudyResponse> {
  if (!isMember(store, classId, studentId))
    throw new NotFoundError("Class not found.");

  const course = findClass(store, classId);
  if (course === undefined) throw new NotFoundError("Class not found.");

  const { message, history } = studyAssistantBody.parse(input);

  if (!course.syllabus.trim())
    throw new ConflictError(
      "Your instructor needs to add course material before you can ask the Study Assistant.",
    );

  if (aiService === null)
    throw new ServiceUnavailableError(
      "The Study Assistant is not available right now.",
    );

  try {
    return await aiService.study({
      userId: studentId,
      courseId: course.id,
      message,
      courseTitle: course.name,
      syllabus: course.syllabus,
      materialVersion: course.material_version,
      history,
    });
  } catch (error) {
    if (error instanceof AIServiceRequestError)
      throw new ServiceUnavailableError(
        "The Study Assistant is not available right now.",
      );
    throw error;
  }
}
