import type { Store } from "../db.js";
import type { PendingStudyReview } from "../agents/python-service.js";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js";
import { agentReviewBody } from "../validation.js";
import { requireOwnedClass } from "./classes.js";

export interface AgentReviewRow {
  id: string;
  class_id: string;
  student_id: string;
  student_name: string;
  kind: string;
  content: string;
  sources: string;
  issues: string;
  status: "pending" | "published" | "rejected";
  created_at: string;
}

export interface AgentReviewView extends Omit<
  AgentReviewRow,
  "sources" | "issues"
> {
  sources: PendingStudyReview["sources"];
  issues: PendingStudyReview["issues"];
}

export function pendingAgentReviews(
  store: Store,
  classId: string,
): AgentReviewView[] {
  return store
    .all<AgentReviewRow>(
      "SELECT r.id,r.class_id,r.student_id,u.name AS student_name,r.kind,r.content,r.sources,r.issues,r.status,r.created_at FROM agent_reviews r JOIN users u ON u.id=r.student_id WHERE r.class_id=? AND r.status='pending' ORDER BY r.created_at",
      [classId],
    )
    .map((row) => ({
      ...row,
      sources: JSON.parse(row.sources) as PendingStudyReview["sources"],
      issues: JSON.parse(row.issues) as PendingStudyReview["issues"],
    }));
}

export function recordAgentReview(
  store: Store,
  classId: string,
  studentId: string,
  conversationId: string,
  messageId: string,
  review: PendingStudyReview,
): void {
  if (!review.content.trim() || review.content.length > 10_000)
    throw new BadRequestError("The AI review item is invalid.");
  store.run(
    "INSERT INTO agent_reviews(id,class_id,student_id,conversation_id,message_id,kind,content,sources,issues,status,final_content,created_at,resolved_at,resolved_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      review.id,
      classId,
      studentId,
      conversationId,
      messageId,
      "study_response",
      review.content,
      JSON.stringify(review.sources),
      JSON.stringify(review.issues),
      "pending",
      null,
      new Date().toISOString(),
      null,
      null,
    ],
  );
  store.event(
    classId,
    "Study Assistant",
    "Response held for teacher review",
    {
      reviewId: review.id,
    },
    studentId,
  );
}

export function resolveAgentReview(
  store: Store,
  teacherId: string,
  reviewId: string,
  input: unknown,
): void {
  const row = store.one<{
    id: string;
    class_id: string;
    student_id: string;
    message_id: string | null;
    status: string;
    content: string;
    sources: string;
  }>(
    "SELECT id,class_id,student_id,message_id,status,content,sources FROM agent_reviews WHERE id=?",
    [reviewId],
  );
  if (!row) throw new NotFoundError("AI review item not found.");
  requireOwnedClass(store, teacherId, row.class_id);
  if (row.status !== "pending")
    throw new ConflictError("This AI response has already been reviewed.");
  const body = agentReviewBody.parse(input);
  const finalContent =
    body.action === "publish" ? (body.content ?? row.content).trim() : null;
  if (body.action === "publish" && !finalContent)
    throw new BadRequestError("Provide a response before publishing.");
  const revised = finalContent !== row.content;
  const timestamp = new Date().toISOString();
  store.transaction(() => {
    store.run(
      "UPDATE agent_reviews SET status=?,final_content=?,resolved_at=?,resolved_by=? WHERE id=?",
      [
        body.action === "publish" ? "published" : "rejected",
        finalContent,
        timestamp,
        teacherId,
        reviewId,
      ],
    );
    if (row.message_id) {
      store.run(
        "UPDATE conversation_messages SET content=?,sources=?,grounded=?,requires_human_review=0 WHERE id=?",
        [
          finalContent ??
            "Your instructor did not approve this response. Please ask another question or contact them.",
          body.action === "publish" && !revised ? row.sources : "[]",
          body.action === "publish" && !revised ? 1 : 0,
          row.message_id,
        ],
      );
    }
    store.event(
      row.class_id,
      "Teacher",
      body.action === "publish"
        ? "AI response published"
        : "AI response rejected",
      { reviewId },
      row.student_id,
    );
  });
}
