import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import { quizSchema, type Grade } from "../agents/schemas.js";
import { gradeAssessment } from "../agents/assessment.js";
import { diagnose, recordLearningGaps } from "../agents/diagnostic.js";
import { engineName } from "../agents/provider.js";
import { REVIEW_CONFIDENCE_THRESHOLD } from "../constants.js";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js";
import type { AgentQueue } from "../jobs.js";
import { parseGrades, parseQuestions } from "../json-columns.js";
import {
  findPublishedQuizForMember,
  findQuiz,
  findSubmissionWithQuiz,
  hasSubmitted,
  insertSubmission,
  publishQuiz as markPublished,
  saveReview,
  updateQuizDraft as saveQuizDraft,
} from "../repositories/assessments.js";
import { draftAssessmentBody, reviewBody, submitBody } from "../validation.js";
import { requireOwnedClass } from "./classes.js";
import {
  appendWorkflowStep,
  createWorkflowRun,
  workflowRunForEntity,
} from "./workflow-traces.js";

const now = (): string => new Date().toISOString();

/**
 * Queues quiz generation for an owned class.
 * @throws NotFoundError for a class the teacher does not own, then ZodError.
 */
export function queueAssessmentDraft(
  store: Store,
  queue: AgentQueue,
  teacherId: string,
  classId: string,
  input: unknown,
): string {
  requireOwnedClass(store, teacherId, classId);
  const body = draftAssessmentBody.parse(input);
  return queue.enqueue(classId, teacherId, "assessment", body);
}

/** @throws NotFoundError, ConflictError for a published quiz, then ZodError. */
export function updateQuizDraft(
  store: Store,
  teacherId: string,
  quizId: string,
  input: unknown,
): void {
  const quiz = findQuiz(store, quizId);
  if (!quiz) throw new NotFoundError("Quiz not found.");
  requireOwnedClass(store, teacherId, quiz.class_id);
  if (quiz.status !== "draft")
    throw new ConflictError("Published quizzes cannot be edited.");
  const body = quizSchema.parse(input);
  store.transaction(() => {
    saveQuizDraft(store, quiz.id, body.title, JSON.stringify(body.questions));
    const runId = workflowRunForEntity(store, "quiz_draft", quiz.id);
    if (runId)
      appendWorkflowStep(store, runId, {
        actor: "Teacher",
        action: "Edited the draft",
        detail: "The questions were reviewed before publication.",
      });
  });
}

/** Makes a draft quiz visible to enrolled students. @throws NotFoundError, ConflictError when already published, ZodError for an invalid stored quiz. */
export function publishQuiz(
  store: Store,
  teacherId: string,
  quizId: string,
): void {
  const quiz = findQuiz(store, quizId);
  if (!quiz) throw new NotFoundError("Quiz not found.");
  requireOwnedClass(store, teacherId, quiz.class_id);
  if (quiz.status !== "draft")
    throw new ConflictError("This assessment is already published.");
  quizSchema.parse({
    title: quiz.title,
    questions: parseQuestions(quiz.questions),
  });
  store.transaction(() => {
    markPublished(store, quiz.id);
    store.event(quiz.class_id, "Teacher", "Assessment published", {
      quizId: quiz.id,
    });
    const runId = workflowRunForEntity(store, "quiz_draft", quiz.id);
    if (runId)
      appendWorkflowStep(
        store,
        runId,
        {
          actor: "Teacher",
          action: "Published the quiz",
          detail: "Enrolled students can now take this assessment.",
        },
        "complete",
      );
  });
}

/**
 * Publishes a teacher-reviewed grade and records the learning gaps it shows.
 * @throws NotFoundError, ConflictError when already published, ZodError or
 * BadRequestError when a score is missing or above the question's maximum.
 */
export function approveReview(
  store: Store,
  teacherId: string,
  submissionId: string,
  input: unknown,
): void {
  const submission = findSubmissionWithQuiz(store, submissionId);
  if (!submission) throw new NotFoundError("Submission not found.");
  requireOwnedClass(store, teacherId, submission.class_id);
  if (submission.status !== "pending")
    throw new ConflictError("This submission has already been published.");
  const { scores, feedback } = reviewBody.parse(input);
  const questions = parseQuestions(submission.questions);
  const results = parseGrades(submission.results);
  for (const question of questions) {
    const score = scores[question.id];
    if (score === undefined || score > question.maxPoints)
      throw new BadRequestError("Provide a valid score for each question.");
    const result = results.find((grade) => grade.questionId === question.id);
    if (result === undefined)
      throw new Error(
        `Submission ${submission.id} has no grade for question ${question.id}`,
      );
    result.score = score;
    result.tag = score < question.maxPoints ? question.tag : null;
    result.reason = feedback;
    result.confidence = 1;
  }
  store.transaction(() => {
    saveReview(
      store,
      submission.id,
      JSON.stringify(results),
      results.reduce((sum, grade) => sum + grade.score, 0),
      feedback,
    );
    recordLearningGaps(
      store,
      submission.class_id,
      submission.student_id,
      questions,
      results,
      "Reviewed assessment",
      submission.id,
    );
    store.event(
      submission.class_id,
      "Teacher",
      "Grade approved",
      { submissionId: submission.id },
      submission.student_id,
    );
    diagnose(store, submission.class_id, submission.student_id);
    const runId = workflowRunForEntity(store, "quiz_submission", submission.id);
    if (runId) {
      appendWorkflowStep(store, runId, {
        actor: "Teacher",
        action: "Approved the grade",
        detail:
          "The reviewed score and feedback are now visible to the student.",
      });
      appendWorkflowStep(
        store,
        runId,
        {
          actor: "Diagnostic",
          action: "Updated learning evidence",
          detail:
            "The student's learning gaps and class priorities were refreshed.",
        },
        "complete",
      );
    }
  });
}

export type SubmissionOutcome =
  | { id: string; status: "pending"; message: string }
  | {
      id: string;
      status: "graded";
      score: number;
      total: number;
      results: Grade[];
    };

const alreadySubmitted = () =>
  new ConflictError("You have already submitted this assessment.");

/**
 * Grades a student's answers. Grades below the confidence threshold are held
 * for teacher review and returned without a score.
 * @throws NotFoundError, ConflictError for a second submission, ZodError or
 * BadRequestError for missing or invalid answers.
 */
export async function submitQuiz(
  store: Store,
  studentId: string,
  quizId: string,
  input: unknown,
): Promise<SubmissionOutcome> {
  const quiz = findPublishedQuizForMember(store, quizId, studentId);
  if (!quiz) throw new NotFoundError("Assessment not found.");
  if (hasSubmitted(store, quiz.id, studentId)) throw alreadySubmitted();
  const { answers } = submitBody.parse(input);
  const questions = parseQuestions(quiz.questions);
  for (const question of questions) {
    const answer = answers[question.id];
    if (
      !answer?.trim() ||
      (question.kind === "choice" && !question.options.includes(answer))
    )
      throw new BadRequestError("Answer every question using a valid option.");
  }
  const results = await gradeAssessment(questions, answers);
  const confidence = Math.min(...results.map((grade) => grade.confidence));
  const pending = confidence < REVIEW_CONFIDENCE_THRESHOLD;
  const score = results.reduce((sum, grade) => sum + grade.score, 0);
  const total = questions.reduce(
    (sum, question) => sum + question.maxPoints,
    0,
  );
  const id = randomUUID();
  // A second request could arrive while the model was running; enforce uniqueness again before publication.
  if (hasSubmitted(store, quiz.id, studentId)) throw alreadySubmitted();
  store.transaction(() => {
    insertSubmission(store, {
      id,
      quiz_id: quiz.id,
      student_id: studentId,
      answers: JSON.stringify(answers),
      results: JSON.stringify(results),
      score,
      total,
      confidence,
      status: pending ? "pending" : "graded",
      reason: pending
        ? "Uncertain grading awaits teacher review."
        : "Graded against the rubric.",
      created_at: now(),
    });
    createWorkflowRun(store, {
      id,
      classId: quiz.class_id,
      kind: "quiz_submission",
      title: quiz.title,
      studentId,
      entityId: id,
    });
    appendWorkflowStep(store, id, {
      actor: "Student",
      action: "Submitted answers",
      detail: `${String(questions.length)} answers were submitted for rubric grading.`,
    });
    appendWorkflowStep(store, id, {
      actor: "Assessment",
      action: "Graded against the rubric",
      detail: `Score ${String(score)}/${String(total)}; confidence ${String(Math.round(confidence * 100))}%; engine ${engineName()}.`,
    });
    appendWorkflowStep(
      store,
      id,
      {
        actor: "Review gate",
        action: pending ? "Held an uncertain grade" : "Cleared the grade",
        detail: pending
          ? "A teacher must review the score before the student sees it."
          : "The confidence threshold was met; the score can be published.",
        state: pending ? "pending" : "complete",
      },
      pending ? "awaiting_review" : undefined,
    );
    store.event(
      quiz.class_id,
      "Assessment",
      pending ? "Grade held for review" : "Assessment graded",
      { submissionId: id, confidence, engine: engineName() },
      studentId,
    );
    if (!pending) {
      recordLearningGaps(
        store,
        quiz.class_id,
        studentId,
        questions,
        results,
        quiz.title,
        id,
      );
      diagnose(store, quiz.class_id, studentId);
      appendWorkflowStep(
        store,
        id,
        {
          actor: "Diagnostic",
          action: "Updated learning evidence",
          detail: `${String(new Set(questions.map((question) => question.tag)).size)} topic signals were checked and class priorities refreshed.`,
        },
        "complete",
      );
    }
  });
  return pending
    ? {
        id,
        status: "pending",
        message:
          "Submitted. Your teacher will review the uncertain grade before it is published.",
      }
    : { id, status: "graded", score, total, results };
}
