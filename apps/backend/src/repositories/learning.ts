import type { Store } from "../db.js";
import type { GapRow, InterventionRow, ProbeRow } from "../rows.js";

export interface TeacherGapRow extends GapRow {
  student_name: string;
}

export interface ClusterRow {
  topic: string;
  tag: string;
  section: string;
  gapId: string;
  students: number;
  priority: number;
  struggling: number;
}

export interface StudentGapRow extends GapRow {
  content: string | null;
  probe: string | null;
  content_status: string | null;
  class_name: string;
}

export interface ApprovedGapRow extends GapRow {
  probe: string;
  content: string;
  approved_at: string;
}

export interface ProgressRow extends ProbeRow {
  topic: string;
  class_id: string;
}

export const classGaps = (store: Store, classId: string): TeacherGapRow[] =>
  store.all<TeacherGapRow>(
    "SELECT g.*,u.name AS student_name FROM gaps g JOIN users u ON u.id=g.student_id WHERE g.class_id=? ORDER BY g.severity DESC",
    [classId],
  );

export const openClusters = (store: Store, classId: string): ClusterRow[] =>
  store.all<ClusterRow>(
    "SELECT topic,tag,section,MIN(id) AS gapId,COUNT(*) AS students,SUM(severity) AS priority,SUM(CASE WHEN status='struggling' THEN 1 ELSE 0 END) AS struggling FROM gaps WHERE class_id=? AND status!='resolved' GROUP BY topic,tag,section ORDER BY priority DESC",
    [classId],
  );

export const studentGaps = (store: Store, studentId: string): StudentGapRow[] =>
  store.all<StudentGapRow>(
    "SELECT g.*,i.content,i.probe,i.status AS content_status,c.name AS class_name FROM gaps g JOIN classes c ON c.id=g.class_id LEFT JOIN interventions i ON i.id=g.intervention_id AND i.status='approved' WHERE g.student_id=? ORDER BY g.updated_at DESC",
    [studentId],
  );

export const findGap = (store: Store, id: string): GapRow | undefined =>
  store.one<GapRow>("SELECT * FROM gaps WHERE id=?", [id]);

export const findGapInClass = (
  store: Store,
  id: string,
  classId: string,
): GapRow | undefined =>
  store.one<GapRow>("SELECT * FROM gaps WHERE id=? AND class_id=?", [
    id,
    classId,
  ]);

export const openGapIdsForTag = (
  store: Store,
  classId: string,
  tag: string,
): string[] =>
  store
    .all<{
      id: string;
    }>(
      "SELECT id FROM gaps WHERE class_id=? AND tag=? AND status!='resolved'",
      [classId, tag],
    )
    .map((row) => row.id);

export const findApprovedGapForStudent = (
  store: Store,
  gapId: string,
  studentId: string,
): ApprovedGapRow | undefined =>
  store.one<ApprovedGapRow>(
    "SELECT g.*,i.probe,i.content,i.approved_at FROM gaps g JOIN interventions i ON i.id=g.intervention_id AND i.status='approved' WHERE g.id=? AND g.student_id=?",
    [gapId, studentId],
  );

export function markGapReady(
  store: Store,
  gapId: string,
  interventionId: string,
  now: string,
): void {
  store.run(
    "UPDATE gaps SET intervention_id=?,status='ready',updated_at=? WHERE id=? AND status!='resolved'",
    [interventionId, now, gapId],
  );
}

export function setGapStatus(
  store: Store,
  gapId: string,
  status: "resolved" | "struggling",
  now: string,
): void {
  store.run("UPDATE gaps SET status=?,updated_at=? WHERE id=?", [
    status,
    now,
    gapId,
  ]);
}

/** True when the student answered a follow-up on this gap at or after `since`. */
export const hasAnsweredSince = (
  store: Store,
  gapId: string,
  studentId: string,
  since: string,
): boolean =>
  store.one(
    "SELECT 1 FROM probes WHERE gap_id=? AND student_id=? AND created_at>=?",
    [gapId, studentId, since],
  ) !== undefined;

export function insertProbe(store: Store, row: ProbeRow): void {
  store.run("INSERT INTO probes VALUES(?,?,?,?,?,?)", [
    row.id,
    row.gap_id,
    row.student_id,
    row.answer,
    row.correct,
    row.created_at,
  ]);
}

export const studentProgress = (
  store: Store,
  studentId: string,
): ProgressRow[] =>
  store.all<ProgressRow>(
    "SELECT p.*,g.topic,g.class_id FROM probes p JOIN gaps g ON g.id=p.gap_id WHERE p.student_id=? ORDER BY p.created_at DESC",
    [studentId],
  );

export const classInterventions = (
  store: Store,
  classId: string,
): InterventionRow[] =>
  store.all<InterventionRow>(
    "SELECT * FROM interventions WHERE class_id=? ORDER BY created_at DESC",
    [classId],
  );

export const findIntervention = (
  store: Store,
  id: string,
): InterventionRow | undefined =>
  store.one<InterventionRow>("SELECT * FROM interventions WHERE id=?", [id]);

export function insertIntervention(store: Store, row: InterventionRow): void {
  store.run("INSERT INTO interventions VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
    row.id,
    row.class_id,
    row.topic,
    row.tag,
    row.content,
    row.probe,
    row.targets,
    row.status,
    row.engine,
    row.created_at,
    row.approved_at,
  ]);
}

export function updateInterventionContent(
  store: Store,
  id: string,
  content: string,
): void {
  store.run("UPDATE interventions SET content=? WHERE id=?", [content, id]);
}

export function approveIntervention(
  store: Store,
  id: string,
  now: string,
): void {
  store.run(
    "UPDATE interventions SET status='approved',approved_at=? WHERE id=?",
    [now, id],
  );
}
