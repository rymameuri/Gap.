import type { Store } from "../db.js";
import type { ClassRow, UserRow } from "../rows.js";

export interface TeacherClassCard extends ClassRow {
  students: number;
}

export interface StudentClassCard {
  id: string;
  name: string;
  syllabus: string;
  material_version: number;
  teacher_name: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  email: string;
  open_gaps: number;
  activity: number;
}

export const findUserByEmail = (
  store: Store,
  email: string,
): UserRow | undefined =>
  store.one<UserRow>("SELECT * FROM users WHERE email=?", [email]);

export const findStudentIdByEmail = (
  store: Store,
  email: string,
): string | undefined =>
  store.one<{ id: string }>(
    "SELECT id FROM users WHERE email=? AND role='student'",
    [email],
  )?.id;

export const findClass = (store: Store, id: string): ClassRow | undefined =>
  store.one<ClassRow>("SELECT * FROM classes WHERE id=?", [id]);

export const findOwnedClass = (
  store: Store,
  teacherId: string,
  classId: string,
): ClassRow | undefined =>
  store.one<ClassRow>("SELECT * FROM classes WHERE id=? AND teacher_id=?", [
    classId,
    teacherId,
  ]);

export const teacherClasses = (store: Store, teacherId: string): ClassRow[] =>
  store.all<ClassRow>("SELECT * FROM classes WHERE teacher_id=?", [teacherId]);

export const memberClasses = (store: Store, studentId: string): ClassRow[] =>
  store.all<ClassRow>(
    "SELECT c.* FROM memberships m JOIN classes c ON c.id=m.class_id WHERE m.student_id=?",
    [studentId],
  );

export const teacherClassCards = (
  store: Store,
  teacherId: string,
): TeacherClassCard[] =>
  store.all<TeacherClassCard>(
    "SELECT c.*, (SELECT COUNT(*) FROM memberships m WHERE m.class_id=c.id) AS students FROM classes c WHERE c.teacher_id=?",
    [teacherId],
  );

export const studentClassCards = (
  store: Store,
  studentId: string,
): StudentClassCard[] =>
  store.all<StudentClassCard>(
    "SELECT c.id,c.name,c.syllabus,c.material_version,u.name AS teacher_name FROM classes c JOIN memberships m ON m.class_id=c.id JOIN users u ON u.id=c.teacher_id WHERE m.student_id=?",
    [studentId],
  );

export const classRoster = (store: Store, classId: string): RosterEntry[] =>
  store.all<RosterEntry>(
    "SELECT u.id,u.name,u.email,(SELECT COUNT(*) FROM gaps g WHERE g.student_id=u.id AND g.class_id=m.class_id AND g.status!='resolved') AS open_gaps,(SELECT COUNT(*) FROM questions q WHERE q.student_id=u.id AND q.class_id=m.class_id) AS activity FROM memberships m JOIN users u ON u.id=m.student_id WHERE m.class_id=? ORDER BY open_gaps DESC,activity DESC",
    [classId],
  );

export const findClassByJoinCode = (
  store: Store,
  code: string,
): { id: string; name: string } | undefined =>
  store.one<{ id: string; name: string }>(
    "SELECT id,name FROM classes WHERE join_code=?",
    [code],
  );

export const isMember = (
  store: Store,
  classId: string,
  studentId: string,
): boolean =>
  store.one("SELECT 1 FROM memberships WHERE class_id=? AND student_id=?", [
    classId,
    studentId,
  ]) !== undefined;

export function insertClass(
  store: Store,
  row: Pick<ClassRow, "id" | "teacher_id" | "name" | "syllabus"> & {
    join_code: string;
  },
): void {
  store.run(
    "INSERT INTO classes(id,teacher_id,name,syllabus,material_version,join_code) VALUES(?,?,?,?,?,?)",
    [row.id, row.teacher_id, row.name, row.syllabus, 1, row.join_code],
  );
}

export function updateClassMaterials(
  store: Store,
  id: string,
  name: string,
  syllabus: string,
): void {
  store.run(
    "UPDATE classes SET name=?,syllabus=?,material_version=material_version+1 WHERE id=?",
    [name, syllabus, id],
  );
}

export function setJoinCode(store: Store, id: string, code: string): void {
  store.run("UPDATE classes SET join_code=? WHERE id=?", [code, id]);
}

/** Enrolls a student; enrolling twice is a no-op. */
export function enrollStudent(
  store: Store,
  classId: string,
  studentId: string,
): void {
  store.run("INSERT OR IGNORE INTO memberships VALUES(?,?)", [
    classId,
    studentId,
  ]);
}

export function addMember(
  store: Store,
  classId: string,
  studentId: string,
): void {
  store.run("INSERT INTO memberships(class_id,student_id) VALUES(?,?)", [
    classId,
    studentId,
  ]);
}
