import { createHash, randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
} from "../errors.js";
import { isMember } from "../repositories/classes.js";
import { requireOwnedClass } from "./classes.js";

export const MAX_COURSE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_COURSE_FILES = 20;
const MAX_CLASS_BYTES = 25 * 1024 * 1024;

export interface CourseFileSummary {
  id: string;
  class_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: "stored" | "indexed" | "failed";
  created_at: string;
}

interface CourseFileRow extends CourseFileSummary {
  content: Uint8Array;
}

export interface CourseFileForAI {
  id: string;
  filename: string;
  content: Uint8Array;
  status: "stored" | "indexed" | "failed";
  extracted_text: string | null;
}

function fileType(filename: string, bytes: Uint8Array): string {
  const extension = filename.split(".").at(-1)?.toLowerCase();
  if (extension === "txt") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new BadRequestError("The text file must use UTF-8 encoding.");
    }
    return "text/plain";
  }
  if (
    extension === "pdf" &&
    Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-"
  )
    return "application/pdf";
  const zipHeader = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (zipHeader && extension === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (zipHeader && extension === "pptx")
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  throw new BadRequestError(
    "Upload a UTF-8 .txt, PDF, DOCX, or PPTX file with matching file contents.",
  );
}

export function listCourseFiles(
  store: Store,
  userId: string,
  role: "teacher" | "student",
  classId: string,
): CourseFileSummary[] {
  if (role === "teacher") requireOwnedClass(store, userId, classId);
  else if (!isMember(store, classId, userId))
    throw new NotFoundError("Class not found.");
  return store.all<CourseFileSummary>(
    "SELECT id,class_id,filename,mime_type,size_bytes,sha256,status,created_at FROM course_files WHERE class_id=? ORDER BY created_at DESC,id DESC",
    [classId],
  );
}

export function uploadCourseFile(
  store: Store,
  teacherId: string,
  classId: string,
  filename: string | undefined,
  data: unknown,
): CourseFileSummary {
  requireOwnedClass(store, teacherId, classId);
  if (
    !filename ||
    filename.length > 200 ||
    /[\\/]/.test(filename) ||
    Array.from(filename).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    throw new BadRequestError("Provide a valid file name.");
  if (!Buffer.isBuffer(data) || data.length === 0)
    throw new BadRequestError("Choose a non-empty file to upload.");
  if (data.length > MAX_COURSE_FILE_BYTES)
    throw new PayloadTooLargeError("Course files must be 5 MB or smaller.");
  const mimeType = fileType(filename, data);
  const usage = store.one<{ count: number; size: number }>(
    "SELECT COUNT(*) AS count,COALESCE(SUM(size_bytes),0) AS size FROM course_files WHERE class_id=?",
    [classId],
  );
  if (
    (usage?.count ?? 0) >= MAX_COURSE_FILES ||
    (usage?.size ?? 0) + data.length > MAX_CLASS_BYTES
  )
    throw new ConflictError("This class has reached its file storage limit.");
  const file: CourseFileSummary = {
    id: randomUUID(),
    class_id: classId,
    filename,
    mime_type: mimeType,
    size_bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    status: "stored",
    created_at: new Date().toISOString(),
  };
  store.transaction(() => {
    store.run(
      "INSERT INTO course_files(id,class_id,uploaded_by,filename,mime_type,size_bytes,sha256,content,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        file.id,
        classId,
        teacherId,
        filename,
        mimeType,
        data.length,
        file.sha256,
        data,
        file.status,
        file.created_at,
      ],
    );
    store.run(
      "UPDATE classes SET material_version=material_version+1 WHERE id=?",
      [classId],
    );
    store.event(classId, "Teacher", "Course file stored", {
      fileId: file.id,
      filename,
      status: "stored",
    });
  });
  return file;
}

export function getCourseFile(
  store: Store,
  userId: string,
  role: "teacher" | "student",
  classId: string,
  fileId: string,
): CourseFileRow {
  if (role === "teacher") requireOwnedClass(store, userId, classId);
  else if (!isMember(store, classId, userId))
    throw new NotFoundError("Class not found.");
  const file = store.one<CourseFileRow>(
    "SELECT id,class_id,filename,mime_type,size_bytes,sha256,content,status,created_at FROM course_files WHERE class_id=? AND id=?",
    [classId, fileId],
  );
  if (!file) throw new NotFoundError("Course file not found.");
  return file;
}

export function deleteCourseFile(
  store: Store,
  teacherId: string,
  classId: string,
  fileId: string,
): void {
  requireOwnedClass(store, teacherId, classId);
  const file = store.one<{ filename: string }>(
    "SELECT filename FROM course_files WHERE class_id=? AND id=?",
    [classId, fileId],
  );
  if (!file) throw new NotFoundError("Course file not found.");
  store.transaction(() => {
    store.run("DELETE FROM course_files WHERE id=?", [fileId]);
    store.run(
      "UPDATE classes SET material_version=material_version+1 WHERE id=?",
      [classId],
    );
    store.event(classId, "Teacher", "Course file deleted", {
      fileId,
      filename: file.filename,
    });
  });
}

export function courseFilesForAI(
  store: Store,
  classId: string,
): CourseFileForAI[] {
  return store.all<CourseFileForAI>(
    `SELECT f.id,f.filename,f.content,f.status,t.text AS extracted_text
     FROM course_files f
     LEFT JOIN course_file_text t ON t.file_id=f.id
     WHERE f.class_id=?
     ORDER BY f.created_at ASC,f.id ASC`,
    [classId],
  );
}

export function saveCourseFileText(
  store: Store,
  fileId: string,
  text: string,
): void {
  store.transaction(() => {
    store.run(
      "INSERT OR REPLACE INTO course_file_text(file_id,text) VALUES(?,?)",
      [fileId, text],
    );
    store.run("UPDATE course_files SET status='indexed' WHERE id=?", [fileId]);
  });
}

export function failCourseFileIndex(store: Store, fileId: string): void {
  store.run("UPDATE course_files SET status='failed' WHERE id=?", [fileId]);
}
