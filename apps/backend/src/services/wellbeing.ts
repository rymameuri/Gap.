import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import { NotFoundError } from "../errors.js";
import {
  findFlag,
  insertFlag,
  updateFlag,
  type FlagSource,
} from "../repositories/wellbeing.js";
import { flagUpdateBody } from "../validation.js";
import { screenWellbeing } from "../wellbeing.js";
import { requireOwnedClass } from "./classes.js";

/**
 * Records a flag for the class teacher when `text` shows signs of distress.
 * Never blocks or alters the student's own request and reveals nothing to them.
 */
export function flagIfConcerning(
  store: Store,
  classId: string,
  studentId: string,
  source: FlagSource,
  text: string,
): void {
  const signal = screenWellbeing(text);
  if (signal === null) return;
  const at = new Date().toISOString();
  insertFlag(store, {
    id: randomUUID(),
    class_id: classId,
    student_id: studentId,
    source,
    text,
    ...signal,
    status: "new",
    note: "",
    created_at: at,
    updated_at: at,
  });
}

/**
 * Sets a flag's follow-up status and the teacher's private note.
 * @throws ZodError, NotFoundError for a flag outside the teacher's classes.
 */
export function updateFlagStatus(
  store: Store,
  teacherId: string,
  flagId: string,
  input: unknown,
): void {
  const flag = findFlag(store, flagId);
  if (flag === undefined) throw new NotFoundError("Flag not found.");
  requireOwnedClass(store, teacherId, flag.class_id);
  const { status, note } = flagUpdateBody.parse(input);
  updateFlag(store, flagId, status, note, new Date().toISOString());
}
