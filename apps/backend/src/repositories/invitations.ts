import type { Store } from "../db.js";
import type { Role } from "../rows.js";

export type InvitationStatus = "pending" | "accepted" | "declined" | "revoked";

export interface InvitationRow {
  id: string;
  class_id: string;
  email: string;
  name: string;
  invited_by: string;
  status: InvitationStatus;
  created_at: string;
  responded_at: string | null;
}

/** What the teacher sees: invitations still waiting and ones the student declined. */
export type TeacherInvitation = Pick<
  InvitationRow,
  "id" | "email" | "name" | "status" | "created_at" | "responded_at"
>;

export interface StudentInvitation {
  id: string;
  class_id: string;
  class_name: string;
  teacher_name: string;
  created_at: string;
}

export const findInvitation = (
  store: Store,
  id: string,
): InvitationRow | undefined =>
  store.one<InvitationRow>("SELECT * FROM class_invitations WHERE id=?", [id]);

export const findOwnedInvitation = (
  store: Store,
  teacherId: string,
  id: string,
): InvitationRow | undefined =>
  store.one<InvitationRow>(
    "SELECT i.* FROM class_invitations i JOIN classes c ON c.id=i.class_id WHERE i.id=? AND c.teacher_id=?",
    [id, teacherId],
  );

export const classInvitationList = (
  store: Store,
  classId: string,
): TeacherInvitation[] =>
  store.all<TeacherInvitation>(
    "SELECT id,email,name,status,created_at,responded_at FROM class_invitations WHERE class_id=? AND status IN ('pending','declined') ORDER BY status DESC,created_at DESC,email",
    [classId],
  );

export const pendingInvitationsFor = (
  store: Store,
  email: string,
): StudentInvitation[] =>
  store.all<StudentInvitation>(
    "SELECT i.id,i.class_id,c.name AS class_name,u.name AS teacher_name,i.created_at FROM class_invitations i JOIN classes c ON c.id=i.class_id JOIN users u ON u.id=c.teacher_id WHERE i.email=? AND i.status='pending' ORDER BY i.created_at DESC",
    [email],
  );

/** Current invitation status and account for each email, as seen from one class. */
export interface EmailState {
  role: Role | null;
  member: boolean;
  invitation: InvitationStatus | null;
}

export function emailStates(
  store: Store,
  classId: string,
  emails: string[],
): Map<string, EmailState> {
  const states = new Map<string, EmailState>(
    emails.map((email) => [
      email,
      { role: null, member: false, invitation: null },
    ]),
  );
  const users = store.all<{ email: string; role: Role; member: number }>(
    "SELECT lower(u.email) AS email,u.role,EXISTS(SELECT 1 FROM memberships m WHERE m.class_id=? AND m.student_id=u.id) AS member FROM users u",
    [classId],
  );
  for (const user of users) {
    const state = states.get(user.email);
    if (state) {
      state.role = user.role;
      state.member = user.member === 1;
    }
  }
  const invitations = store.all<{ email: string; status: InvitationStatus }>(
    "SELECT email,status FROM class_invitations WHERE class_id=?",
    [classId],
  );
  for (const invitation of invitations) {
    const state = states.get(invitation.email);
    if (state) state.invitation = invitation.status;
  }
  return states;
}

/** Creates the invitation, or reopens a declined or revoked one. */
export function upsertInvitation(
  store: Store,
  row: Pick<
    InvitationRow,
    "id" | "class_id" | "email" | "name" | "invited_by" | "created_at"
  >,
): void {
  store.run(
    "INSERT INTO class_invitations(id,class_id,email,name,invited_by,status,created_at) VALUES(?,?,?,?,?,'pending',?) ON CONFLICT(class_id,email) DO UPDATE SET name=excluded.name,invited_by=excluded.invited_by,status='pending',created_at=excluded.created_at,responded_at=NULL",
    [row.id, row.class_id, row.email, row.name, row.invited_by, row.created_at],
  );
}

export function setInvitationStatus(
  store: Store,
  id: string,
  status: Exclude<InvitationStatus, "pending">,
  at: string,
): void {
  store.run("UPDATE class_invitations SET status=?,responded_at=? WHERE id=?", [
    status,
    at,
    id,
  ]);
}

/** Marks the student's pending invitation to a class accepted once they are a member. */
export function settleInvitation(
  store: Store,
  classId: string,
  studentId: string,
  at: string,
): void {
  store.run(
    "UPDATE class_invitations SET status='accepted',responded_at=? WHERE class_id=? AND status='pending' AND email=(SELECT lower(email) FROM users WHERE id=?)",
    [at, classId, studentId],
  );
}
