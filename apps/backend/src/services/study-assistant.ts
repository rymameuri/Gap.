import type {
  AIServiceClient,
  AIStudyResponse,
  StudyDocument,
  StudyRequest,
  StudyResponse,
  StudyStreamUpdate,
} from "../agents/python-service.js";
import type { Store } from "../db.js";
import {
  AIServiceRequestError,
  DocumentImportError,
} from "../agents/python-service.js";
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
import {
  courseFilesForAI,
  failCourseFileIndex,
  saveCourseFileText,
} from "./materials.js";

interface PreparedStudyRequest {
  aiService: AIServiceClient;
  request: StudyRequest;
  message: string;
  conversationId?: string;
}

async function prepareStudyRequest(
  store: Store,
  aiService: AIServiceClient | null,
  studentId: string,
  classId: string,
  input: unknown,
): Promise<PreparedStudyRequest> {
  if (!isMember(store, classId, studentId))
    throw new NotFoundError("Class not found.");

  const course = findClass(store, classId);
  if (course === undefined) throw new NotFoundError("Class not found.");

  const { message, conversationId } = studyAssistantBody.parse(input);
  const history = conversationId
    ? conversationHistory(store, studentId, classId, conversationId)
    : [];

  if (aiService === null)
    throw new ServiceUnavailableError(
      "The Study Assistant is not available right now.",
    );

  const documents: StudyDocument[] = [];
  for (const file of courseFilesForAI(store, classId)) {
    if (file.status === "failed")
      throw new ConflictError(
        `The course file ${file.filename} could not be read. Ask your instructor to replace or remove it.`,
      );

    let text = file.extracted_text;
    if (text === null) {
      try {
        const extracted = await aiService.extractDocument(
          file.filename,
          file.content,
        );
        text = extracted.text;
        saveCourseFileText(store, file.id, text);
      } catch (error) {
        if (error instanceof DocumentImportError) {
          failCourseFileIndex(store, file.id);
          throw new ConflictError(
            `The course file ${file.filename} could not be read. Ask your instructor to replace or remove it.`,
          );
        }
        unavailable(error);
      }
    }

    documents.push({ documentId: file.id, title: file.filename, text });
  }

  if (!course.syllabus.trim() && documents.length === 0)
    throw new ConflictError(
      "Your instructor needs to add course material before you can ask the Study Assistant.",
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
      documents,
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
      prepared.conversationId,
      prepared.message,
      safeResponse,
    );
    const runId = createWorkflowRun(store, {
      classId,
      kind: "study",
      title: "Study Assistant answer",
      studentId,
      entityId: saved.assistantMessageId,
      conversationId: saved.conversationId,
      status: safeResponse.requiresHumanReview ? "awaiting_review" : "complete",
    });
    appendWorkflowStep(store, runId, {
      actor: "Express",
      action: "Checked access and loaded course context",
      detail: `Used syllabus version ${String(prepared.request.materialVersion)}, ${String(prepared.request.documents?.length ?? 0)} stored course files, and ${String(prepared.request.history.length)} prior conversation messages.`,
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
  const prepared = await prepareStudyRequest(
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
  const prepared = await prepareStudyRequest(
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
