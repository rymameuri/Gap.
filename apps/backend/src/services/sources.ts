import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import { BadRequestError, ConflictError } from "../errors.js";
import { parseLink, type PageFetcher } from "../safe-fetch.js";
import { MAX_SOURCE_TEXT, readDeck } from "../source-extract.js";
import { linkBody } from "../validation.js";
import { requireOwnedClass } from "./classes.js";
import type { AIServiceClient } from "../agents/python-service.js";
import { importCourseMaterial } from "./material-import.js";

export interface SourceRow {
  id: string;
  type: "deck" | "link";
  name: string;
  url: string | null;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chars: number;
  created_at: string;
}

const COLUMNS =
  "id,type,name,url,status,error,LENGTH(content) AS chars,created_at";

export function listSources(
  store: Store,
  teacherId: string,
  classId: string,
): SourceRow[] {
  requireOwnedClass(store, teacherId, classId);
  return store.all<SourceRow>(
    `SELECT ${COLUMNS} FROM sources WHERE class_id=? ORDER BY created_at,id`,
    [classId],
  );
}

function findSource(store: Store, id: string): SourceRow {
  const row = store.one<SourceRow>(
    `SELECT ${COLUMNS} FROM sources WHERE id=?`,
    [id],
  );
  if (!row) throw new Error("Source disappeared after saving.");
  return row;
}

const now = () => new Date().toISOString();

/** Stores a presentation and its extracted text. */
export async function addDeck(
  store: Store,
  teacherId: string,
  classId: string,
  name: string,
  data: Uint8Array,
  aiService: AIServiceClient | null,
): Promise<SourceRow> {
  requireOwnedClass(store, teacherId, classId);
  const clean = name.trim().slice(0, 200);
  if (!clean)
    throw new BadRequestError("Add a file name.", "validation_failed");
  let content = readDeck(clean, data);
  if (/\.pdf$/i.test(clean))
    content = (await importCourseMaterial(aiService, clean, Buffer.from(data)))
      .text;
  if (!content.trim())
    throw new BadRequestError("No readable slide text was found.");
  const id = randomUUID();
  store.transaction(() => {
    store.run(
      "INSERT INTO sources(id,class_id,type,name,status,content,created_at) VALUES(?,?,?,?,?,?,?)",
      [id, classId, "deck", clean, "ready", content, now()],
    );
    store.event(classId, "Teacher", "Presentation added", { name: clean });
  });
  return findSource(store, id);
}

/**
 * Stores a link right away and reads the page in the background, so the
 * teacher never waits on someone else's server.
 * @throws BadRequestError for an unsafe address, ConflictError for a duplicate.
 */
export function addLink(
  store: Store,
  teacherId: string,
  classId: string,
  input: unknown,
  fetchPage: PageFetcher,
): SourceRow {
  requireOwnedClass(store, teacherId, classId);
  const url = parseLink(linkBody.parse(input).url).toString();
  if (
    store.one("SELECT 1 FROM sources WHERE class_id=? AND url=?", [
      classId,
      url,
    ])
  )
    throw new ConflictError("That link is already added.");
  const id = randomUUID();
  const host = new URL(url).hostname.replace(/^www\./, "");
  store.transaction(() => {
    store.run(
      "INSERT INTO sources(id,class_id,type,name,url,status,created_at) VALUES(?,?,?,?,?,?,?)",
      [id, classId, "link", host, url, "processing", now()],
    );
    store.event(classId, "Teacher", "Link added", { url });
  });
  void fetchPage(url)
    .then((page) => {
      store.run(
        "UPDATE sources SET name=?,status='ready',content=? WHERE id=?",
        [page.title || host, page.text.slice(0, MAX_SOURCE_TEXT), id],
      );
    })
    .catch((error: unknown) => {
      store.run("UPDATE sources SET status='failed',error=? WHERE id=?", [
        error instanceof Error ? error.message : "Could not read that page.",
        id,
      ]);
    });
  return findSource(store, id);
}
