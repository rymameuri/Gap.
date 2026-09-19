import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

interface Props {
  courseId: string;
  disabled: boolean;
  onText: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}

export function MaterialFileImport({
  courseId,
  disabled,
  onText,
  onBusyChange,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => () => currentRequest.current?.abort(), []);

  async function importFile(file: File) {
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setError("");
    setNotice("");
    setBusy(true);
    onBusyChange(true);
    try {
      if (!/\.(pdf|docx|pptx|txt)$/i.test(file.name))
        throw new Error(
          "Choose a PDF, Word (.docx), PowerPoint (.pptx), or text (.txt) file.",
        );
      if (file.size === 0) throw new Error("This file is empty.");
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Choose a file no larger than 25 MB.");
      let text: string;
      if (/\.txt$/i.test(file.name)) {
        text = new TextDecoder("utf-8", { fatal: true })
          .decode(await file.arrayBuffer())
          .trim();
      } else {
        const response = await api<{ text: string; sectionCount: number }>(
          "/teacher/classes/" +
            encodeURIComponent(courseId) +
            "/materials/import?filename=" +
            encodeURIComponent(file.name),
          {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: file,
            signal: controller.signal,
          },
        );
        text = response.text;
      }
      if (text.trim().length < 10 || text.includes("\u0000"))
        throw new Error("This file does not contain enough readable text.");
      if (text.length > 50_000)
        throw new Error(
          "The extracted text exceeds 50,000 characters. Split the document into smaller sections.",
        );
      if (controller.signal.aborted) return;
      onText(text);
      setNotice(
        "Imported " +
          file.name +
          ". Review the text above, then select Save syllabus.",
      );
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "This document could not be imported.",
        );
    } finally {
      if (!controller.signal.aborted) {
        currentRequest.current = null;
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  return (
    <>
      <label className="field" htmlFor="syllabus-file">
        Import PDF, Word, PowerPoint or text
      </label>
      <input
        id="syllabus-file"
        type="file"
        accept=".pdf,.docx,.pptx,.txt"
        disabled={disabled || busy}
        aria-describedby="material-import-help"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <p id="material-import-help" className="muted">
        Up to 25 MB. Import replaces the text in this editor. Review it before
        saving. Scanned PDFs need OCR first. Text limit: 50,000 characters.
      </p>
      {busy && <p role="status">Reading your document...</p>}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
