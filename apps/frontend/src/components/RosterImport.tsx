import { useEffect, useRef, useState } from "react";
import { api, post } from "../services/api";
import type { RosterPreview, RosterRowStatus } from "../services/types";

interface Props {
  courseId: string;
  onInvited: (invited: number) => Promise<void>;
}

const MAX_BYTES = 2 * 1024 * 1024;

const plural = (count: number, one: string, many: string) =>
  count + " " + (count === 1 ? one : many);

const STATUS: Record<RosterRowStatus, { label: string; tone: string }> = {
  new: { label: "Will be invited", tone: "sent" },
  invited: { label: "Already invited", tone: "" },
  enrolled: { label: "Already enrolled", tone: "resolved" },
  duplicate: { label: "Duplicate", tone: "" },
  invalid: { label: "Cannot invite", tone: "open" },
};

export function RosterImport({ courseId, onInvited }: Props) {
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => () => currentRequest.current?.abort(), []);
  useEffect(() => {
    setPreview(null);
    setError("");
  }, [courseId]);

  async function readFile(file: File) {
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setError("");
    setPreview(null);
    setFilename(file.name);
    setBusy(true);
    try {
      if (!/\.(xlsx|csv)$/i.test(file.name))
        throw new Error("Choose an Excel (.xlsx) or CSV (.csv) file.");
      if (file.size === 0) throw new Error("This file is empty.");
      if (file.size > MAX_BYTES)
        throw new Error("Choose a file no larger than 2 MB.");
      const result = await api<RosterPreview>(
        "/teacher/classes/" +
          encodeURIComponent(courseId) +
          "/roster/preview?filename=" +
          encodeURIComponent(file.name),
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
          signal: controller.signal,
        },
      );
      if (!controller.signal.aborted) setPreview(result);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "This roster could not be read.",
        );
    } finally {
      if (!controller.signal.aborted) {
        currentRequest.current = null;
        setBusy(false);
      }
    }
  }

  async function sendInvitations() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const students = preview.rows
        .filter((row) => row.status === "new")
        .map((row) => ({ email: row.email, name: row.name }));
      const result = await post<{ invited: number }>(
        "/teacher/classes/" + encodeURIComponent(courseId) + "/invitations",
        { students },
      );
      setPreview(null);
      await onInvited(result.invited);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The invitations could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  const count = preview?.summary.new ?? 0;
  return (
    <div className="roster-import">
      <label className="field" htmlFor="roster-file">
        Import a class list (Excel or CSV)
      </label>
      <input
        id="roster-file"
        type="file"
        accept=".xlsx,.csv"
        disabled={busy}
        aria-describedby="roster-import-help"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void readFile(file);
        }}
      />
      <p id="roster-import-help" className="muted">
        The first row must be a header with an Email column and either a Name
        column or First name and Last name columns. Up to 1,000 students and 2
        MB. Students receive an invitation and join the class when they accept
        it. Invitations to students without an account wait until they have one.
      </p>
      {busy && !preview && <p role="status">Reading your class list...</p>}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <section aria-label={"Preview of " + filename}>
          <p role="status">
            <strong>{filename}</strong>: {count} to invite,{" "}
            {preview.summary.invited} already invited,{" "}
            {preview.summary.enrolled} already enrolled,{" "}
            {plural(preview.summary.duplicate, "duplicate", "duplicates")},{" "}
            {preview.summary.invalid} cannot be invited.
          </p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Result</th>
                  <th>Has an account</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>
                      {row.name || <span className="muted">No name</span>}
                    </td>
                    <td>{row.email}</td>
                    <td>
                      <span className={"badge " + STATUS[row.status].tone}>
                        {STATUS[row.status].label}
                      </span>
                      {row.message && (
                        <span className="muted"> {row.message}</span>
                      )}
                    </td>
                    <td>
                      {row.status === "invalid"
                        ? ""
                        : row.hasAccount
                          ? "Yes"
                          : "Not yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || count === 0}
              onClick={() => void sendInvitations()}
            >
              {count === 1
                ? "Send 1 invitation"
                : "Send " + count + " invitations"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
