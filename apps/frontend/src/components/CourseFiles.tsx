import { useEffect, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { api } from "../services/api";
import type { CourseFile } from "../services/types";

export function CourseFiles({
  courseId,
  canManage = false,
}: {
  courseId: string;
  canManage?: boolean;
}) {
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setFiles([]);
    setError("");
    void api<{ files: CourseFile[] }>(
      `/classes/${encodeURIComponent(courseId)}/files`,
    )
      .then((result) => {
        if (!cancelled) setFiles(result.files);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Files could not be loaded.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  async function upload(file: File) {
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Stored files must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const created = await api<CourseFile>(
        `/teacher/classes/${encodeURIComponent(courseId)}/files?filename=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        },
      );
      setFiles((current) => [created, ...current]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The file could not be stored.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/teacher/classes/${encodeURIComponent(courseId)}/files/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      setFiles((current) => current.filter((file) => file.id !== id));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The file could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="course-files" aria-label="Course files">
      <div className="course-files-heading">
        <div>
          <h2>Course files</h2>
          {canManage && (
            <p>
              Files are available to students. AI indexing is not connected yet.
            </p>
          )}
        </div>
        {canManage && (
          <label className="btn" htmlFor="course-file-upload">
            <Upload size={16} /> Store file
            <input
              id="course-file-upload"
              className="sr-only"
              type="file"
              accept=".txt,.pdf,.docx,.pptx"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
        )}
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {files.length === 0 ? (
        <p className="muted">No files stored for this course.</p>
      ) : (
        <ul className="course-files-list">
          {files.map((file) => (
            <li key={file.id}>
              <FileText size={18} aria-hidden="true" />
              <span>
                <strong>{file.filename}</strong>
                <small>
                  {(file.size_bytes / 1024).toFixed(0)} KB · {file.status}
                </small>
              </span>
              <a
                href={`/api/classes/${encodeURIComponent(courseId)}/files/${encodeURIComponent(file.id)}`}
                title={`Download ${file.filename}`}
                aria-label={`Download ${file.filename}`}
              >
                <Download size={17} />
              </a>
              {canManage && (
                <button
                  type="button"
                  title={`Delete ${file.filename}`}
                  aria-label={`Delete ${file.filename}`}
                  disabled={busy}
                  onClick={() => void remove(file.id)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
