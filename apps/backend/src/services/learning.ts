import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import { diagnose } from "../agents/diagnostic.js";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js";
import type { AgentQueue } from "../jobs.js";
import { parseIds, parseQuestion } from "../json-columns.js";
import { isMember } from "../repositories/classes.js";
import { insertQuestion } from "../repositories/activity.js";
import {
  approveIntervention as markApproved,
  findApprovedGapForStudent,
  findGap,
  findIntervention,
  hasAnsweredSince,
  insertProbe,
  markGapReady,
  setGapStatus,
  updateInterventionContent,
} from "../repositories/learning.js";
import { interventionBody, questionBody, recheckBody } from "../validation.js";
import { requireOwnedClass } from "./classes.js";

const now = (): string => new Date().toISOString();

/**
 * Queues an explanation for the gap's misconception in an owned class.
 * @throws NotFoundError for a missing gap or a class the teacher does not own.
 */
export function queueExplainer(
  store: Store,
  queue: AgentQueue,
  teacherId: string,
  gapId: string,
): string {
  const gap = findGap(store, gapId);
  if (!gap) throw new NotFoundError("Gap not found.");
  requireOwnedClass(store, teacherId, gap.class_id);
  return queue.enqueue(gap.class_id, teacherId, "content", { gapId: gap.id });
}

function requireOwnedIntervention(
  store: Store,
  teacherId: string,
  interventionId: string,
) {
  const item = findIntervention(store, interventionId);
  if (!item) throw new NotFoundError("Explanation not found.");
  requireOwnedClass(store, teacherId, item.class_id);
  return item;
}

/** @throws NotFoundError, ConflictError once shared, then ZodError. */
export function updateIntervention(
  store: Store,
  teacherId: string,
  interventionId: string,
  input: unknown,
): void {
  const item = requireOwnedIntervention(store, teacherId, interventionId);
  if (item.status !== "draft")
    throw new ConflictError("Shared explanations cannot be edited.");
  const { content } = interventionBody.parse(input);
  updateInterventionContent(store, item.id, content);
}

/**
 * Shares a draft explanation with every targeted gap that is not resolved.
 * @throws NotFoundError, ConflictError once shared.
 */
export function approveIntervention(
  store: Store,
  teacherId: string,
  interventionId: string,
): void {
  const item = requireOwnedIntervention(store, teacherId, interventionId);
  if (item.status !== "draft")
    throw new ConflictError("This explanation is already shared.");
  const targets = parseIds(item.targets);
  store.transaction(() => {
    markApproved(store, item.id, now());
    for (const gapId of targets) markGapReady(store, gapId, item.id, now());
    store.event(item.class_id, "Teacher", "Explanation approved and shared", {
      interventionId: item.id,
      targetCount: targets.length,
    });
  });
}

export interface RecheckOutcome {
  correct: boolean;
  status: "resolved" | "struggling";
  message: string;
}

/**
 * Records the student's one answer to the follow-up of their gap's current
 * explanation. A correct answer resolves the gap; a wrong one marks it
 * struggling until the teacher approves a new explanation.
 * @throws NotFoundError without an approved explanation, ConflictError once
 * resolved or answered, ZodError or
 * BadRequestError when the answer is not an option.
 */
export function recheckGap(
  store: Store,
  studentId: string,
  gapId: string,
  input: unknown,
): RecheckOutcome {
  const gap = findApprovedGapForStudent(store, gapId, studentId);
  if (!gap) throw new NotFoundError("Teacher-approved explanation not found.");
  if (gap.status === "resolved")
    throw new ConflictError("This gap is already resolved.");
  // One attempt per follow-up question: a wrong answer waits for the teacher
  // to approve a new explanation, whose question the student has not seen.
  if (hasAnsweredSince(store, gap.id, studentId, gap.approved_at))
    throw new ConflictError(
      "You already answered this follow-up. Your teacher will share another explanation.",
    );
  const { answer } = recheckBody.parse(input);
  const probe = parseQuestion(gap.probe);
  if (!probe.options.includes(answer))
    throw new BadRequestError("Select one of the answer options.");
  const correct = answer === probe.correctAnswer;
  const status = correct ? "resolved" : "struggling";
  store.transaction(() => {
    insertProbe(store, {
      id: randomUUID(),
      gap_id: gap.id,
      student_id: studentId,
      answer,
      correct: correct ? 1 : 0,
      created_at: now(),
    });
    setGapStatus(store, gap.id, status, now());
    store.event(
      gap.class_id,
      "Content",
      correct
        ? "Follow-up verified understanding"
        : "Follow-up escalated for teacher support",
      { gapId: gap.id, correct },
      studentId,
    );
    diagnose(store, gap.class_id, studentId);
  });
  return {
    correct,
    status,
    message: correct
      ? "Correct. Your gap is resolved, and your teacher's dashboard has been updated."
      : "Not quite. The gap stays open, and your teacher has been notified for more support.",
  };
}

/** Shares a student's question with the teacher. @throws ZodError, NotFoundError for a class the student did not join. */
export function askQuestion(
  store: Store,
  studentId: string,
  input: unknown,
): void {
  const { classId, text } = questionBody.parse(input);
  if (!isMember(store, classId, studentId))
    throw new NotFoundError("Class not found.");
  store.transaction(() => {
    insertQuestion(store, {
      id: randomUUID(),
      class_id: classId,
      student_id: studentId,
      text,
      created_at: now(),
    });
    store.event(
      classId,
      "Diagnostic",
      "Informal question received",
      { question: text },
      studentId,
    );
    diagnose(store, classId, studentId);
  });
}
