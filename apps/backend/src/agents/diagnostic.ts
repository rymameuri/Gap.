import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import type { Question, Grade } from "./schemas.js";
export function recordLearningGaps(
  store: Store,
  classId: string,
  studentId: string,
  questions: Question[],
  results: Grade[],
  source: string,
  submissionId?: string,
) {
  const grades = new Map(results.map((result) => [result.questionId, result]));
  const byTag = new Map<string, Question[]>();
  for (const question of questions) {
    const group = byTag.get(question.tag) ?? [];
    group.push(question);
    byTag.set(question.tag, group);
  }
  for (const [tag, taggedQuestions] of byTag) {
    const graded = taggedQuestions.map((question) => ({
      question,
      result: grades.get(question.id),
    }));
    if (graded.some(({ result }) => result === undefined)) continue;
    const missed = graded.filter(
      ({ question, result }) => result!.score < question.maxPoints,
    );
    const existing = store.one<{ id: string; status: string }>(
      "SELECT id,status FROM gaps WHERE class_id=? AND student_id=? AND tag=?",
      [classId, studentId, tag],
    );
    const timestamp = new Date().toISOString();
    if (missed.length === 0) {
      if (existing && existing.status !== "resolved") {
        store.run(
          "UPDATE gaps SET status='resolved',source=?,updated_at=? WHERE id=?",
          [source, timestamp, existing.id],
        );
        store.event(
          classId,
          "Diagnostic",
          "Assessment resolved learning gap",
          { gapId: existing.id, tag, source },
          studentId,
        );
      }
      if (existing && submissionId) {
        store.run(
          "INSERT INTO gap_resolutions(gap_id,submission_id,created_at) VALUES(?,?,?) ON CONFLICT(gap_id) DO UPDATE SET submission_id=excluded.submission_id,created_at=excluded.created_at",
          [existing.id, submissionId, timestamp],
        );
      }
    } else {
      const mostSevere = missed.some(({ result }) => result!.score === 0)
        ? 3
        : 2;
      const q = missed[0]!.question;
      if (existing)
        store.run(
          "UPDATE gaps SET status='open',severity=?,source=?,updated_at=? WHERE id=?",
          [mostSevere, source, timestamp, existing.id],
        );
      else
        store.run("INSERT INTO gaps VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
          randomUUID(),
          classId,
          studentId,
          q.topic,
          q.tag,
          q.section,
          "open",
          mostSevere,
          source,
          null,
          timestamp,
        ]);
      if (existing)
        store.run("DELETE FROM gap_resolutions WHERE gap_id=?", [existing.id]);
    }
  }
}
export function diagnose(
  store: Store,
  classId: string,
  studentId: string | null = null,
  jobId: string | null = null,
) {
  const clusters = store.all(
    "SELECT topic,tag,section,COUNT(*) AS students,SUM(severity) AS priority,SUM(CASE WHEN status='struggling' THEN 1 ELSE 0 END) AS struggling FROM gaps WHERE class_id=? AND status!='resolved' GROUP BY topic,tag,section ORDER BY priority DESC,students DESC",
    [classId],
  );
  store.event(
    classId,
    "Diagnostic",
    "Learning gaps ranked",
    {
      clusters: clusters.map((c) => ({
        topic: c.topic,
        students: c.students,
        priority: c.priority,
        struggling: c.struggling,
      })),
    },
    studentId,
    jobId,
  );
  return clusters;
}
