import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import { NotFoundError } from "../errors.js";
import { classCode } from "../join-codes.js";
import type { ClassRow } from "../rows.js";
import {
  createClassBody,
  enrollBody,
  joinBody,
  updateClassBody,
} from "../validation.js";
import {
  addMember,
  enrollStudent,
  findClassByJoinCode,
  findOwnedClass,
  findStudentIdByEmail,
  insertClass,
  isMember,
  setJoinCode,
  studentClassCards,
  teacherClassCards,
  updateClassMaterials,
  type StudentClassCard,
  type TeacherClassCard,
} from "../repositories/classes.js";

/**
 * Returns the class when `teacherId` owns it.
 * @throws NotFoundError otherwise, so other teachers' classes look absent.
 */
export function requireOwnedClass(
  store: Store,
  teacherId: string,
  classId: string,
): ClassRow {
  const course = findOwnedClass(store, teacherId, classId);
  if (!course) throw new NotFoundError("Class not found.");
  return course;
}

/**
 * Class cards for the dashboard: owned classes with student counts and join
 * codes for teachers, joined classes with the teacher's name for students.
 */
export function classCards(
  store: Store,
  userId: string,
  role: "teacher" | "student",
): (TeacherClassCard | StudentClassCard)[] {
  if (role === "student") return studentClassCards(store, userId);
  const cards = teacherClassCards(store, userId);
  for (const card of cards)
    if (!card.join_code) {
      card.join_code = classCode(store);
      setJoinCode(store, card.id, card.join_code);
    }
  return cards;
}

/** @throws ZodError for an invalid body. */
export function createClass(
  store: Store,
  teacherId: string,
  input: unknown,
): { id: string; join_code: string } {
  const { name, syllabus } = createClassBody.parse(input);
  const id = randomUUID();
  const joinCode = classCode(store);
  store.transaction(() => {
    insertClass(store, {
      id,
      teacher_id: teacherId,
      name,
      syllabus,
      join_code: joinCode,
    });
    store.event(id, "Teacher", "Class created", { name });
  });
  return { id, join_code: joinCode };
}

/** @throws NotFoundError when the teacher does not own the class, then ZodError for an invalid body. */
export function updateClass(
  store: Store,
  teacherId: string,
  classId: string,
  input: unknown,
): void {
  requireOwnedClass(store, teacherId, classId);
  const { name, syllabus } = updateClassBody.parse(input);
  store.transaction(() => {
    updateClassMaterials(store, classId, name, syllabus);
    store.event(classId, "Teacher", "Class materials updated", { name });
  });
}

/** @throws NotFoundError when the class is not owned or the student account does not exist. */
export function enrollByEmail(
  store: Store,
  teacherId: string,
  classId: string,
  input: unknown,
): void {
  requireOwnedClass(store, teacherId, classId);
  const { email } = enrollBody.parse(input);
  const studentId = findStudentIdByEmail(store, email.toLowerCase());
  if (studentId === undefined)
    throw new NotFoundError(
      "Student account not found. Use a seeded demo account.",
    );
  enrollStudent(store, classId, studentId);
}

export interface JoinResult {
  id: string;
  name: string;
  alreadyJoined: boolean;
}

/**
 * Adds the student to the class with `code`. Joining twice is not an error.
 * @throws ZodError for an invalid code, NotFoundError when no class has it.
 */
export function joinClass(
  store: Store,
  studentId: string,
  input: unknown,
): JoinResult {
  const { code } = joinBody.parse(input);
  const course = findClassByJoinCode(store, code);
  if (!course)
    throw new NotFoundError(
      "That class code was not found. Check it with your teacher.",
    );
  const alreadyJoined = isMember(store, course.id, studentId);
  if (!alreadyJoined)
    store.transaction(() => {
      addMember(store, course.id, studentId);
      store.event(course.id, "Student", "Joined class", {}, studentId);
    });
  return { id: course.id, name: course.name, alreadyJoined };
}
