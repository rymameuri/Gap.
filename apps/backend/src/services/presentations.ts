import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import { NotFoundError } from "../errors.js";
import { isMember } from "../repositories/classes.js";
import { generateDeck } from "../agents/presentation.js";
import {
  generateDeckBody,
  presentationBody,
  publishBody,
} from "../validation.js";
import { requireOwnedClass } from "./classes.js";

export interface Slide {
  title: string;
  bullets: string[];
  notes: string;
}

export interface Presentation {
  id: string;
  class_id: string;
  title: string;
  slides: Slide[];
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

interface PresentationRow extends Omit<Presentation, "slides"> {
  slides: string;
}

const hydrate = (row: PresentationRow): Presentation => ({
  ...row,
  slides: JSON.parse(row.slides) as Slide[],
});

const now = () => new Date().toISOString();

function requireOwnedPresentation(
  store: Store,
  teacherId: string,
  id: string,
): PresentationRow {
  const row = store.one<PresentationRow>(
    "SELECT p.* FROM presentations p JOIN classes c ON c.id=p.class_id WHERE p.id=? AND c.teacher_id=?",
    [id, teacherId],
  );
  if (!row) throw new NotFoundError("Presentation not found.");
  return row;
}

export function listPresentations(
  store: Store,
  teacherId: string,
  classId: string,
): Presentation[] {
  requireOwnedClass(store, teacherId, classId);
  return store
    .all<PresentationRow>(
      "SELECT * FROM presentations WHERE class_id=? ORDER BY updated_at DESC,id",
      [classId],
    )
    .map(hydrate);
}

/** Students only ever see published presentations of classes they joined. */
export function publishedPresentations(
  store: Store,
  studentId: string,
  classId: string,
): Presentation[] {
  if (!isMember(store, classId, studentId))
    throw new NotFoundError("Class not found.");
  return store
    .all<PresentationRow>(
      "SELECT * FROM presentations WHERE class_id=? AND status='published' ORDER BY published_at DESC,id",
      [classId],
    )
    .map(hydrate);
}

/** @throws ZodError for an invalid body. */
export function createPresentation(
  store: Store,
  teacherId: string,
  classId: string,
  input: unknown,
): Presentation {
  requireOwnedClass(store, teacherId, classId);
  const { title, slides } = presentationBody.parse(input);
  const id = randomUUID();
  const stamp = now();
  store.transaction(() => {
    store.run(
      "INSERT INTO presentations(id,class_id,title,slides,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      [id, classId, title, JSON.stringify(slides), "draft", stamp, stamp],
    );
    store.event(classId, "Teacher", "Presentation created", { title });
  });
  const row = store.one<PresentationRow>(
    "SELECT * FROM presentations WHERE id=?",
    [id],
  );
  if (!row) throw new Error("Presentation disappeared after saving.");
  return hydrate(row);
}

/**
 * Drafts a deck with the AI from the class syllabus, its ready sources and the
 * teacher's main points, and saves it as a draft.
 * @throws ZodError for an invalid body, Error when the AI is unavailable.
 */
export async function generatePresentation(
  store: Store,
  teacherId: string,
  classId: string,
  input: unknown,
): Promise<Presentation> {
  const course = requireOwnedClass(store, teacherId, classId);
  const body = generateDeckBody.parse(input);
  const sources = store.all<{ name: string; content: string }>(
    "SELECT name,content FROM sources WHERE class_id=? AND status='ready' AND content<>'' ORDER BY created_at,id",
    [classId],
  );
  const deck = await generateDeck({
    ...body,
    syllabus: course.syllabus,
    sources,
  });
  return createPresentation(store, teacherId, classId, deck);
}

/** Edits a presentation; a published one keeps its status so students see the fix. */
export function updatePresentation(
  store: Store,
  teacherId: string,
  id: string,
  input: unknown,
): void {
  const row = requireOwnedPresentation(store, teacherId, id);
  const { title, slides } = presentationBody.parse(input);
  store.run(
    "UPDATE presentations SET title=?,slides=?,updated_at=? WHERE id=?",
    [title, JSON.stringify(slides), now(), row.id],
  );
}

export function setPublished(
  store: Store,
  teacherId: string,
  id: string,
  input: unknown,
): void {
  const row = requireOwnedPresentation(store, teacherId, id);
  const { published } = publishBody.parse(input);
  store.transaction(() => {
    store.run("UPDATE presentations SET status=?,published_at=? WHERE id=?", [
      published ? "published" : "draft",
      published ? now() : null,
      row.id,
    ]);
    store.event(
      row.class_id,
      "Teacher",
      published ? "Presentation published" : "Presentation unpublished",
      { title: row.title },
    );
  });
}

export function deletePresentation(
  store: Store,
  teacherId: string,
  id: string,
): void {
  const row = requireOwnedPresentation(store, teacherId, id);
  store.run("DELETE FROM presentations WHERE id=?", [row.id]);
}
