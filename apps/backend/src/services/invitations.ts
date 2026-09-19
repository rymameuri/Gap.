import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import { ROSTER_UPLOAD_LIMIT } from "../constants.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
} from "../errors.js";
import { enrollStudent } from "../repositories/classes.js";
import {
  emailStates,
  findInvitation,
  findOwnedInvitation,
  pendingInvitationsFor,
  setInvitationStatus,
  upsertInvitation,
  type StudentInvitation,
} from "../repositories/invitations.js";
import { rosterLines, type RosterLine } from "../roster/roster.js";
import { readSpreadsheet, SpreadsheetError } from "../roster/spreadsheet.js";
import { inviteStudentsBody } from "../validation.js";
import { requireOwnedClass } from "./classes.js";

const now = (): string => new Date().toISOString();

/**
 * new: will be invited. invited: already has a pending invitation.
 * enrolled: already a member. duplicate: repeats an earlier row.
 * invalid: cannot be invited; `message` says why.
 */
export type RosterRowStatus =
  "new" | "invited" | "enrolled" | "duplicate" | "invalid";

export interface RosterPreviewRow {
  row: number;
  name: string;
  email: string;
  status: RosterRowStatus;
  /** Whether a student account with this email exists and can accept now. */
  hasAccount: boolean;
  message?: string;
}

export interface RosterPreview {
  rows: RosterPreviewRow[];
  summary: Record<RosterRowStatus, number>;
}

function classify(
  store: Store,
  classId: string,
  lines: RosterLine[],
): RosterPreview {
  const states = emailStates(
    store,
    classId,
    lines.filter((line) => !line.problem).map((line) => line.email),
  );
  const seen = new Set<string>();
  const summary: Record<RosterRowStatus, number> = {
    new: 0,
    invited: 0,
    enrolled: 0,
    duplicate: 0,
    invalid: 0,
  };
  const rows = lines.map((line): RosterPreviewRow => {
    const state = states.get(line.email);
    const hasAccount = state?.role === "student";
    const base = { row: line.row, name: line.name, email: line.email };
    let result: RosterPreviewRow;
    if (line.problem !== undefined || state === undefined)
      result = {
        ...base,
        status: "invalid",
        hasAccount: false,
        message: line.problem ?? "Email is not valid.",
      };
    else if (seen.has(line.email))
      result = {
        ...base,
        status: "duplicate",
        hasAccount,
        message: "This email appears earlier in the file.",
      };
    else if (state.role === "teacher")
      result = {
        ...base,
        status: "invalid",
        hasAccount: false,
        message: "This email belongs to a teacher account.",
      };
    else if (state.member) result = { ...base, status: "enrolled", hasAccount };
    else if (state.invitation === "pending")
      result = { ...base, status: "invited", hasAccount };
    else result = { ...base, status: "new", hasAccount };
    if (line.problem === undefined) seen.add(line.email);
    summary[result.status]++;
    return result;
  });
  return { rows, summary };
}

/**
 * Reads an uploaded roster and reports what inviting each row would do.
 * Nothing is saved; the teacher confirms with inviteStudents.
 * @throws NotFoundError, BadRequestError, PayloadTooLargeError.
 */
export function previewRoster(
  store: Store,
  teacherId: string,
  classId: string,
  filename: string | undefined,
  content: unknown,
): RosterPreview {
  requireOwnedClass(store, teacherId, classId);
  if (
    filename === undefined ||
    filename.length > 200 ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\u0000") ||
    !/\.(xlsx|csv)$/i.test(filename)
  )
    throw new BadRequestError("Choose an Excel (.xlsx) or CSV (.csv) file.");
  if (!Buffer.isBuffer(content) || content.length === 0)
    throw new BadRequestError(
      "Send a non-empty file as application/octet-stream.",
    );
  if (content.length > ROSTER_UPLOAD_LIMIT)
    throw new PayloadTooLargeError("The file exceeds the 2 MB upload limit.");
  try {
    return classify(
      store,
      classId,
      rosterLines(readSpreadsheet(filename, content)),
    );
  } catch (error) {
    if (error instanceof SpreadsheetError)
      throw new BadRequestError(error.message);
    throw error;
  }
}

/**
 * Invites every listed student who is not already a member or invited.
 * Declined and revoked invitations are reopened.
 * @throws NotFoundError when the class is not owned, then ZodError.
 */
export function inviteStudents(
  store: Store,
  teacherId: string,
  classId: string,
  input: unknown,
): { invited: number; skipped: number } {
  requireOwnedClass(store, teacherId, classId);
  const { students } = inviteStudentsBody.parse(input);
  const { rows } = classify(
    store,
    classId,
    students.map((student, index) => ({
      row: index + 1,
      name: student.name,
      email: student.email,
    })),
  );
  const invite = rows.filter((row) => row.status === "new");
  const createdAt = now();
  store.transaction(() => {
    for (const row of invite)
      upsertInvitation(store, {
        id: randomUUID(),
        class_id: classId,
        email: row.email,
        name: row.name,
        invited_by: teacherId,
        created_at: createdAt,
      });
    if (invite.length > 0)
      store.event(classId, "Teacher", "Students invited", {
        count: invite.length,
      });
  });
  return { invited: invite.length, skipped: rows.length - invite.length };
}

/** @throws NotFoundError when not the owner's invitation, ConflictError when already answered. */
export function revokeInvitation(
  store: Store,
  teacherId: string,
  invitationId: string,
): void {
  const invitation = findOwnedInvitation(store, teacherId, invitationId);
  if (!invitation) throw new NotFoundError("Invitation not found.");
  if (invitation.status !== "pending")
    throw new ConflictError("This invitation has already been answered.");
  store.transaction(() => {
    setInvitationStatus(store, invitation.id, "revoked", now());
    store.event(invitation.class_id, "Teacher", "Invitation revoked", {
      email: invitation.email,
    });
  });
}

function studentEmail(store: Store, studentId: string): string {
  const user = store.one<{ email: string }>(
    "SELECT lower(email) AS email FROM users WHERE id=?",
    [studentId],
  );
  if (!user) throw new NotFoundError("Student not found.");
  return user.email;
}

/** Pending invitations addressed to the student's email. */
export function studentInvitations(
  store: Store,
  studentId: string,
): StudentInvitation[] {
  return pendingInvitationsFor(store, studentEmail(store, studentId));
}

/**
 * Accepts or declines an invitation addressed to the student. Accepting
 * enrolls the student in the same transaction.
 * @throws NotFoundError when the invitation is not theirs, ConflictError when already answered.
 */
export function respondToInvitation(
  store: Store,
  studentId: string,
  invitationId: string,
  accept: boolean,
): { id: string; name: string } {
  const invitation = findInvitation(store, invitationId);
  if (invitation?.email !== studentEmail(store, studentId))
    throw new NotFoundError("Invitation not found.");
  if (invitation.status !== "pending")
    throw new ConflictError("This invitation has already been answered.");
  const course = store.one<{ id: string; name: string }>(
    "SELECT id,name FROM classes WHERE id=?",
    [invitation.class_id],
  );
  if (!course) throw new NotFoundError("Class not found.");
  store.transaction(() => {
    if (accept) enrollStudent(store, course.id, studentId);
    setInvitationStatus(
      store,
      invitation.id,
      accept ? "accepted" : "declined",
      now(),
    );
    store.event(
      course.id,
      "Student",
      accept ? "Accepted invitation" : "Declined invitation",
      {},
      studentId,
    );
  });
  return course;
}
