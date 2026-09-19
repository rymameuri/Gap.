import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import type {
  StudyMessage,
  StudyResponse,
  StudySource,
} from "../agents/python-service.js";
import { NotFoundError } from "../errors.js";
import { isMember } from "../repositories/classes.js";

export interface ConversationSummary {
  id: string;
  class_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationRow extends ConversationSummary {
  student_id: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: string | null;
  grounded: number | null;
  requires_human_review: number | null;
  created_at: string;
}

export interface ConversationMessage extends Omit<
  MessageRow,
  "sources" | "grounded" | "requires_human_review"
> {
  sources: StudySource[];
  grounded: boolean | null;
  requiresHumanReview: boolean | null;
}

function requireMember(store: Store, studentId: string, classId: string): void {
  if (!isMember(store, classId, studentId))
    throw new NotFoundError("Class not found.");
}

export function listConversations(
  store: Store,
  studentId: string,
  classId: string,
): ConversationSummary[] {
  requireMember(store, studentId, classId);
  return store.all<ConversationSummary>(
    "SELECT id,class_id,title,created_at,updated_at FROM conversations WHERE class_id=? AND student_id=? ORDER BY updated_at DESC,id DESC",
    [classId, studentId],
  );
}

export function ownedConversation(
  store: Store,
  studentId: string,
  conversationId: string,
  classId?: string,
): ConversationRow {
  const row = store.one<ConversationRow>(
    "SELECT * FROM conversations WHERE id=? AND student_id=?",
    [conversationId, studentId],
  );
  if (!row || (classId && row.class_id !== classId))
    throw new NotFoundError("Conversation not found.");
  requireMember(store, studentId, row.class_id);
  return row;
}

export function getConversation(
  store: Store,
  studentId: string,
  conversationId: string,
): { conversation: ConversationSummary; messages: ConversationMessage[] } {
  const row = ownedConversation(store, studentId, conversationId);
  const messages = store.all<MessageRow>(
    "SELECT id,role,content,sources,grounded,requires_human_review,created_at FROM conversation_messages WHERE conversation_id=? ORDER BY rowid",
    [row.id],
  );
  return {
    conversation: {
      id: row.id,
      class_id: row.class_id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      sources: message.sources
        ? (JSON.parse(message.sources) as StudySource[])
        : [],
      grounded: message.grounded === null ? null : Boolean(message.grounded),
      requiresHumanReview:
        message.requires_human_review === null
          ? null
          : Boolean(message.requires_human_review),
      created_at: message.created_at,
    })),
  };
}

export function conversationHistory(
  store: Store,
  studentId: string,
  classId: string,
  conversationId: string,
): StudyMessage[] {
  ownedConversation(store, studentId, conversationId, classId);
  return store
    .all<Pick<MessageRow, "role" | "content">>(
      "SELECT role,content FROM (SELECT role,content,rowid FROM conversation_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 20) ORDER BY rowid",
      [conversationId],
    )
    .map((row) => ({ role: row.role, content: row.content }));
}

export function appendConversationTurn(
  store: Store,
  studentId: string,
  classId: string,
  conversationId: string | undefined,
  question: string,
  response: StudyResponse,
): { conversationId: string; assistantMessageId: string } {
  if (conversationId)
    ownedConversation(store, studentId, conversationId, classId);
  else requireMember(store, studentId, classId);
  const id = conversationId ?? randomUUID();
  const assistantMessageId = randomUUID();
  const timestamp = new Date().toISOString();
  store.transaction(() => {
    if (!conversationId)
      store.run(
        "INSERT INTO conversations(id,class_id,student_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        [id, classId, studentId, question.slice(0, 100), timestamp, timestamp],
      );
    store.run(
      "INSERT INTO conversation_messages(id,conversation_id,role,content,sources,grounded,requires_human_review,created_at) VALUES(?,?,?,?,?,?,?,?)",
      [randomUUID(), id, "user", question, null, null, null, timestamp],
    );
    store.run(
      "INSERT INTO conversation_messages(id,conversation_id,role,content,sources,grounded,requires_human_review,created_at) VALUES(?,?,?,?,?,?,?,?)",
      [
        assistantMessageId,
        id,
        "assistant",
        response.content,
        JSON.stringify(response.sources),
        response.grounded ? 1 : 0,
        response.requiresHumanReview ? 1 : 0,
        timestamp,
      ],
    );
    store.run("UPDATE conversations SET updated_at=? WHERE id=?", [
      timestamp,
      id,
    ]);
  });
  return { conversationId: id, assistantMessageId };
}

export function deleteConversation(
  store: Store,
  studentId: string,
  conversationId: string,
): void {
  const conversation = ownedConversation(store, studentId, conversationId);
  store.transaction(() => {
    store.run(
      "DELETE FROM agent_reviews WHERE conversation_id=? AND status='pending'",
      [conversationId],
    );
    store.run("DELETE FROM conversations WHERE id=?", [conversationId]);
    store.event(
      conversation.class_id,
      "Student",
      "Study conversation deleted",
      { conversationId },
      studentId,
    );
  });
}
