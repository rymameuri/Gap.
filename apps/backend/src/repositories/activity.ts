import type { Store } from "../db.js";
import type { EventRow, JobKind, JobRow, QuestionRow } from "../rows.js";

const RECENT_EVENTS = 60;
const RECENT_QUESTIONS = 20;
const RECENT_JOBS = 10;

export interface AskedQuestionRow extends QuestionRow {
  student_name: string;
}

export type JobSummaryRow = Pick<
  JobRow,
  "id" | "kind" | "status" | "error" | "created_at"
>;

export const recentEvents = (store: Store, classId: string): EventRow[] =>
  store.all<EventRow>(
    `SELECT * FROM events WHERE class_id=? ORDER BY created_at DESC LIMIT ${String(RECENT_EVENTS)}`,
    [classId],
  );

export const recentQuestions = (
  store: Store,
  classId: string,
): AskedQuestionRow[] =>
  store.all<AskedQuestionRow>(
    `SELECT q.*,u.name AS student_name FROM questions q JOIN users u ON u.id=q.student_id WHERE q.class_id=? ORDER BY q.created_at DESC LIMIT ${String(RECENT_QUESTIONS)}`,
    [classId],
  );

export function insertQuestion(store: Store, row: QuestionRow): void {
  store.run("INSERT INTO questions VALUES(?,?,?,?,?)", [
    row.id,
    row.class_id,
    row.student_id,
    row.text,
    row.created_at,
  ]);
}

export const recentJobs = (store: Store, classId: string): JobSummaryRow[] =>
  store.all<JobSummaryRow>(
    `SELECT id,kind,status,error,created_at FROM jobs WHERE class_id=? ORDER BY created_at DESC LIMIT ${String(RECENT_JOBS)}`,
    [classId],
  );

export const findJobForActor = (
  store: Store,
  id: string,
  actorId: string,
): JobRow | undefined =>
  store.one<JobRow>("SELECT * FROM jobs WHERE id=? AND actor_id=?", [
    id,
    actorId,
  ]);

export const nextQueuedJob = (store: Store): JobRow | undefined =>
  store.one<JobRow>(
    "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1",
  );

export function insertJob(
  store: Store,
  row: Pick<JobRow, "id" | "class_id" | "actor_id" | "payload"> & {
    kind: JobKind;
    now: string;
  },
): void {
  store.run("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?)", [
    row.id,
    row.class_id,
    row.actor_id,
    row.kind,
    row.payload,
    "queued",
    null,
    null,
    row.now,
    row.now,
  ]);
}

/** Jobs left running by a stopped process go back to the queue. */
export function requeueRunningJobs(store: Store): void {
  store.run("UPDATE jobs SET status='queued' WHERE status='running'");
}

export function markJobRunning(store: Store, id: string, now: string): void {
  store.run("UPDATE jobs SET status='running',updated_at=? WHERE id=?", [
    now,
    id,
  ]);
}

export function markJobSucceeded(
  store: Store,
  id: string,
  result: string,
  now: string,
): void {
  store.run(
    "UPDATE jobs SET status='succeeded',result=?,updated_at=? WHERE id=?",
    [result, now, id],
  );
}

export function markJobFailed(
  store: Store,
  id: string,
  error: string,
  now: string,
): void {
  store.run("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=?", [
    error,
    now,
    id,
  ]);
}
