import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { ClassLink as Link } from "../../components/ClassLink";
import { PresentMode } from "../../components/PresentMode";
import { SlideViewer } from "../../components/SlideViewer";
import { useTeacher } from "../../layouts/workspace";
import { ErrorBox, useNotice } from "../../components/ui";
import { api, post, put } from "../../services/api";
import type { Presentation, Slide } from "../../services/types";
import { downloadSlidesAsPdf } from "../../utils/slides-pdf";
import { useAction } from "./TeacherPages";

const blank = (): Slide => ({ title: "", bullets: [""], notes: "" });

export function PresentationEditor() {
  const { pid = "new" } = useParams(),
    { data } = useTeacher(),
    navigate = useNavigate(),
    action = useAction(),
    notice = useNotice();
  const classId = data.course.id;
  const [id, setId] = useState<string | null>(pid === "new" ? null : pid),
    [title, setTitle] = useState(""),
    [slides, setSlides] = useState<Slide[]>([blank()]),
    [status, setStatus] = useState<Presentation["status"]>("draft"),
    [current, setCurrent] = useState(0),
    [loaded, setLoaded] = useState(pid === "new"),
    [presenting, setPresenting] = useState(false);

  useEffect(() => {
    if (pid === "new") return;
    void action.run(async () => {
      const r = await api<{ presentations: Presentation[] }>(
        `/teacher/classes/${classId}/presentations`,
      );
      const found = r.presentations.find((p) => p.id === pid);
      if (!found) throw new Error("Presentation not found.");
      setTitle(found.title);
      setSlides(found.slides);
      setStatus(found.status);
      setLoaded(true);
    });
  }, [pid, classId]);

  const slide = slides[current] ?? blank();
  const patch = (change: Partial<Slide>) =>
    setSlides(slides.map((s, i) => (i === current ? { ...s, ...change } : s)));
  function move(from: number, to: number) {
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    setSlides(next);
    setCurrent(to);
  }
  const clean = () =>
    slides.map((s) => ({
      ...s,
      bullets: s.bullets.map((b) => b.trim()).filter(Boolean),
    }));

  /** Saves, creating the presentation the first time; returns its id. */
  async function save(): Promise<string> {
    const body = { title: title.trim(), slides: clean() };
    if (id) {
      await put(`/teacher/presentations/${id}`, body);
      return id;
    }
    const created = await post<Presentation>(
      `/teacher/classes/${classId}/presentations`,
      body,
    );
    setId(created.id);
    navigate(
      `/teacher/materials/presentations/${created.id}?classId=${classId}`,
      { replace: true },
    );
    return created.id;
  }

  async function setPublished(published: boolean) {
    await action.run(
      async () => {
        const savedId = await save();
        await post(`/teacher/presentations/${savedId}/publish`, { published });
        setStatus(published ? "published" : "draft");
      },
      published
        ? "Published. Your students can see it now."
        : "Unpublished. Students can no longer see it.",
    );
  }

  if (!loaded)
    return action.error ? <ErrorBox message={action.error} /> : <p>Loading…</p>;

  return (
    <div className="presentation-editor">
      <Link className="link-button back" to="/teacher/materials">
        ← Back to materials
      </Link>
      <div className="editor-head">
        <input
          className="editor-title"
          aria-label="Presentation title"
          placeholder="Presentation title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <span className={`badge ${status === "published" ? "resolved" : ""}`}>
          {status === "published" ? "Published" : "Draft"}
        </span>
      </div>
      {action.error && <ErrorBox message={action.error} />}

      <div className="editor-grid">
        <aside className="slide-list" aria-label="Slides">
          {slides.map((s, i) => (
            <div
              key={i}
              className={`slide-thumb ${i === current ? "active" : ""}`}
            >
              <button className="thumb-main" onClick={() => setCurrent(i)}>
                <span className="muted">{i + 1}</span>
                {s.title || "Untitled slide"}
              </button>
              <span className="thumb-tools">
                <button aria-label="Move up" onClick={() => move(i, i - 1)}>
                  <ArrowUp size={13} />
                </button>
                <button aria-label="Move down" onClick={() => move(i, i + 1)}>
                  <ArrowDown size={13} />
                </button>
                <button
                  aria-label="Delete slide"
                  disabled={slides.length === 1}
                  onClick={() => {
                    setSlides(slides.filter((_, k) => k !== i));
                    setCurrent(Math.max(0, i - 1));
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
          <button
            className="btn small"
            disabled={slides.length >= 60}
            onClick={() => {
              setSlides([...slides, blank()]);
              setCurrent(slides.length);
            }}
          >
            <Plus size={14} /> Add slide
          </button>
        </aside>

        <section className="slide-edit">
          <label className="field" htmlFor="slide-title">
            Slide title
          </label>
          <input
            id="slide-title"
            maxLength={150}
            value={slide.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
          <label className="field" htmlFor="slide-bullets">
            Points <span className="muted">(one per line)</span>
          </label>
          <textarea
            id="slide-bullets"
            style={{ minHeight: 140 }}
            value={slide.bullets.join("\n")}
            onChange={(e) => patch({ bullets: e.target.value.split("\n") })}
          />
          <label className="field" htmlFor="slide-notes">
            Speaker notes <span className="muted">(only you see these)</span>
          </label>
          <textarea
            id="slide-notes"
            maxLength={2000}
            value={slide.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </section>

        <section className="slide-preview">
          <span className="eyebrow">WHAT STUDENTS SEE</span>
          <SlideViewer slides={clean()} index={current} onIndex={setCurrent} />
        </section>
      </div>

      <div className="editor-actions">
        <button
          className="btn"
          disabled={action.busy || title.trim().length < 3}
          onClick={() =>
            void action.run(async () => {
              await save();
            }, "Saved.")
          }
        >
          Save
        </button>
        {status === "published" ? (
          <button
            className="btn"
            disabled={action.busy}
            onClick={() => void setPublished(false)}
          >
            Unpublish
          </button>
        ) : (
          <button
            className="btn primary"
            disabled={action.busy || title.trim().length < 3}
            onClick={() => void setPublished(true)}
          >
            Publish to students
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={slides.length === 0}
          onClick={() => setPresenting(true)}
        >
          <Play size={15} /> Present
        </button>
        <button
          type="button"
          className="btn"
          disabled={slides.length === 0}
          onClick={() => {
            try {
              downloadSlidesAsPdf(title, clean());
            } catch (err) {
              notice(
                err instanceof Error
                  ? err.message
                  : "Could not open the PDF download.",
              );
            }
          }}
        >
          <Download size={15} /> Download as PDF
        </button>
        {title.trim().length < 3 && (
          <span className="muted">Add a title to save.</span>
        )}
      </div>

      {presenting && (
        <PresentMode
          title={title}
          slides={clean()}
          startIndex={current}
          onClose={() => setPresenting(false)}
        />
      )}
    </div>
  );
}
