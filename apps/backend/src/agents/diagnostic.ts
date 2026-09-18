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
) {
  for (const result of results) {
    const q = questions.find((q) => q.id === result.questionId);
    if (!q) continue;
    if (result.score < q.maxPoints) {
      const existing = store.one(
        "SELECT * FROM gaps WHERE class_id=? AND student_id=? AND tag=?",
        [classId, studentId, q.tag],
      );
      if (existing)
        store.run(
          "UPDATE gaps SET status='open',severity=?,source=?,updated_at=? WHERE id=?",
          [
            result.score === 0 ? 3 : 2,
            source,
            new Date().toISOString(),
            existing.id,
          ],
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
          result.score === 0 ? 3 : 2,
          source,
          null,
          new Date().toISOString(),
        ]);
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
