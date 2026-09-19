import type { Store } from "../db.js";
import type { FlagCategory, FlagSeverity } from "../wellbeing.js";

export type FlagStatus = "new" | "reached_out" | "resolved";
export type FlagSource = "question" | "assistant";

export interface FlagRow {
  id: string;
  class_id: string;
  student_id: string;
  source: FlagSource;
  text: string;
  category: FlagCategory;
  severity: FlagSeverity;
  status: FlagStatus;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface TeacherFlagRow extends FlagRow {
  student_name: string;
}

const MAX_FLAGS = 200;

export function insertFlag(store: Store, row: FlagRow): void {
  store.run("INSERT INTO wellbeing_flags VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
    row.id,
    row.class_id,
    row.student_id,
    row.source,
    row.text,
    row.category,
    row.severity,
    row.status,
    row.note,
    row.created_at,
    row.updated_at,
  ]);
}

/** Unresolved flags first, then most severe, then newest. */
export const classFlags = (store: Store, classId: string): TeacherFlagRow[] =>
  store.all<TeacherFlagRow>(
    `SELECT f.*,u.name AS student_name FROM wellbeing_flags f JOIN users u ON u.id=f.student_id WHERE f.class_id=?
     ORDER BY (f.status='resolved'),
       CASE f.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       f.created_at DESC LIMIT ${String(MAX_FLAGS)}`,
    [classId],
  );

export const findFlag = (store: Store, id: string): FlagRow | undefined =>
  store.one<FlagRow>("SELECT * FROM wellbeing_flags WHERE id=?", [id]);

export function updateFlag(
  store: Store,
  id: string,
  status: FlagStatus,
  note: string,
  updatedAt: string,
): void {
  store.run(
    "UPDATE wellbeing_flags SET status=?,note=?,updated_at=? WHERE id=?",
    [status, note, updatedAt, id],
  );
}
