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
import { appendWorkflowStep, createWorkflowRun } from "./workflow-traces.js";

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
    const { pendingReview, workflow, ...safeResponse } = response;
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
      const runId = createWorkflowRun(store, {
        classId,
        kind: "study",
        title: "Study Assistant answer",
        studentId,
        entityId: saved.assistantMessageId,
        conversationId: saved.conversationId,
        status: safeResponse.requiresHumanReview
          ? "awaiting_review"
          : "complete",
      });
      appendWorkflowStep(store, runId, {
        actor: "Express",
        action: "Checked access and loaded course context",
        detail: `Used syllabus version ${String(course.material_version)} and ${String(history.length)} prior conversation messages. Stored course files were not searched.`,
      });
      if (workflow) {
        appendWorkflowStep(store, runId, {
          actor: "Orchestrator",
          action: "Routed the request",
          detail: `Sent to the ${workflow.routedTo} agent; response produced by ${workflow.producedBy}.`,
        });
      } else {
        appendWorkflowStep(store, runId, {
          actor: "AI service",
          action: "Returned a response",
          detail: "Routing details were not supplied by this service.",
        });
      }
      if (safeResponse.sources.length > 0)
        appendWorkflowStep(store, runId, {
          actor: "Retriever",
          action: "Returned course sources",
          detail: `${String(safeResponse.sources.length)} source references were attached to the answer.`,
          sources: safeResponse.sources,
        });
      appendWorkflowStep(store, runId, {
        actor: "Reviewer",
        action: safeResponse.requiresHumanReview
          ? "Held the answer"
          : "Cleared the answer",
        detail: safeResponse.requiresHumanReview
          ? "The student received a review notice; the private draft went to the teacher queue."
          : safeResponse.grounded
            ? "The answer passed the course-source checks."
            : "The response was released without course citations.",
        state: safeResponse.requiresHumanReview ? "pending" : "complete",
      });
      appendWorkflowStep(store, runId, {
        actor: "Express",
        action: safeResponse.requiresHumanReview
          ? "Saved a review notice"
          : "Saved the student answer",
        detail: "The conversation is available to the student across sessions.",
      });
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
