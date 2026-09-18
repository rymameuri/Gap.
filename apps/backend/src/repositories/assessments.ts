import type { Store } from "../db.js";
import type { QuizRow, SubmissionRow } from "../rows.js";

export interface ReviewRow extends SubmissionRow {
  student_name: string;
  quiz_title: string;
  questions: string;
}

export interface SubmissionWithQuiz extends SubmissionRow {
  class_id: string;
  questions: string;
}

export interface StudentQuizRow extends QuizRow {
  class_name: string;
}

export interface SubmissionSummary {
  id: string;
  status: string;
  score: number;
  total: number;
}

export interface StudentGradeRow extends SubmissionRow {
  title: string;
  class_id: string;
}

const count = (store: Store, sql: string, params: string[]): number =>
  store.one<{ count: number }>(sql, params)?.count ?? 0;

export const classQuizzes = (store: Store, classId: string): QuizRow[] =>
  store.all<QuizRow>(
    "SELECT * FROM quizzes WHERE class_id=? ORDER BY created_at DESC",
    [classId],
  );

export const submissionCount = (store: Store, quizId: string): number =>
  count(store, "SELECT COUNT(*) AS count FROM submissions WHERE quiz_id=?", [
    quizId,
  ]);

export const pendingSubmissionCount = (store: Store, quizId: string): number =>
  count(
    store,
    "SELECT COUNT(*) AS count FROM submissions WHERE quiz_id=? AND status='pending'",
    [quizId],
  );

export const pendingReviews = (store: Store, classId: string): ReviewRow[] =>
  store.all<ReviewRow>(
    "SELECT s.*,u.name AS student_name,q.title AS quiz_title,q.questions FROM submissions s JOIN users u ON u.id=s.student_id JOIN quizzes q ON q.id=s.quiz_id WHERE q.class_id=? AND s.status='pending' ORDER BY s.created_at",
    [classId],
  );

export const findQuiz = (store: Store, id: string): QuizRow | undefined =>
  store.one<QuizRow>("SELECT * FROM quizzes WHERE id=?", [id]);

export const findPublishedQuizForMember = (
  store: Store,
  quizId: string,
  studentId: string,
): QuizRow | undefined =>
  store.one<QuizRow>(
    "SELECT q.* FROM quizzes q JOIN memberships m ON m.class_id=q.class_id WHERE q.id=? AND q.status='published' AND m.student_id=?",
    [quizId, studentId],
  );

export const publishedQuizzesForStudent = (
  store: Store,
  studentId: string,
): StudentQuizRow[] =>
  store.all<StudentQuizRow>(
    "SELECT q.*,c.name AS class_name FROM quizzes q JOIN classes c ON c.id=q.class_id JOIN memberships m ON m.class_id=q.class_id WHERE m.student_id=? AND q.status='published' ORDER BY q.created_at DESC",
    [studentId],
  );

export function insertQuiz(
  store: Store,
  row: Omit<QuizRow, "status"> & { status: "draft" },
): void {
  store.run("INSERT INTO quizzes VALUES(?,?,?,?,?,?,?)", [
    row.id,
    row.class_id,
    row.title,
    row.questions,
    row.status,
    row.engine,
    row.created_at,
  ]);
}

export function updateQuizDraft(
  store: Store,
  id: string,
  title: string,
  questions: string,
): void {
  store.run("UPDATE quizzes SET title=?,questions=? WHERE id=?", [
    title,
    questions,
    id,
  ]);
}

export function publishQuiz(store: Store, id: string): void {
  store.run("UPDATE quizzes SET status='published' WHERE id=?", [id]);
}

export const findSubmissionWithQuiz = (
  store: Store,
  id: string,
): SubmissionWithQuiz | undefined =>
  store.one<SubmissionWithQuiz>(
    "SELECT s.*,q.class_id,q.questions FROM submissions s JOIN quizzes q ON q.id=s.quiz_id WHERE s.id=?",
    [id],
  );

export const hasSubmitted = (
  store: Store,
  quizId: string,
  studentId: string,
): boolean =>
  store.one("SELECT id FROM submissions WHERE quiz_id=? AND student_id=?", [
    quizId,
    studentId,
  ]) !== undefined;

export const submissionSummary = (
  store: Store,
  studentId: string,
  quizId: string,
): SubmissionSummary | undefined =>
  store.one<SubmissionSummary>(
    "SELECT id,status,score,total FROM submissions WHERE student_id=? AND quiz_id=?",
    [studentId, quizId],
  );

export const studentGrades = (
  store: Store,
  studentId: string,
): StudentGradeRow[] =>
  store.all<StudentGradeRow>(
    "SELECT s.*,q.title,q.class_id FROM submissions s JOIN quizzes q ON q.id=s.quiz_id WHERE s.student_id=? AND s.status!='pending' ORDER BY s.created_at DESC",
    [studentId],
  );

export function insertSubmission(store: Store, row: SubmissionRow): void {
  store.run("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
    row.id,
    row.quiz_id,
    row.student_id,
    row.answers,
    row.results,
    row.score,
    row.total,
    row.confidence,
    row.status,
    row.reason,
    row.created_at,
  ]);
}

export function saveReview(
  store: Store,
  id: string,
  results: string,
  score: number,
  reason: string,
): void {
  store.run(
    "UPDATE submissions SET results=?,score=?,confidence=1,status='reviewed',reason=? WHERE id=?",
    [results, score, reason, id],
  );
}
