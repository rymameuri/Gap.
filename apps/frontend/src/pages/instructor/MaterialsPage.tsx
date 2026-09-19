import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  History,
  ClipboardCheck,
  Presentation as SlidesIcon,
  X,
} from "lucide-react";
import { ClassLink as Link } from "../../components/ClassLink";
import { useTeacher } from "../../layouts/workspace";
import { Badge, ErrorBox, Title } from "../../components/ui";
import { api, post, waitForJob } from "../../services/api";
import type { Presentation, Source } from "../../services/types";
import { useAction } from "./TeacherPages";

export function Materials() {
  const { data, refresh } = useTeacher(),
    action = useAction();
  const classId = data.course.id,
    navigate = useNavigate();
  const [dialog, setDialog] = useState(false),
    [quizDialog, setQuizDialog] = useState(false),
    [history, setHistory] = useState(false);
  const syllabus = data.course.syllabus,
    [presentations, setPresentations] = useState<Presentation[]>([]),
    [sources, setSources] = useState<Source[]>([]);

  async function load() {
    const [p, s] = await Promise.all([
      api<{ presentations: Presentation[] }>(
        `/teacher/classes/${classId}/presentations`,
      ),
      api<{ sources: Source[] }>(`/teacher/classes/${classId}/sources`),
    ]);
    setPresentations(p.presentations);
    setSources(s.sources);
  }
  useEffect(() => {
    void action.run(load);
  }, [classId]);

  return (
    <>
      <Title
        label="MATERIALS"
        heading="Materials"
        description="Everything your class is built from. Presentations you publish appear for your students."
      />
      {action.error && <ErrorBox message={action.error} />}

      <section className="mat-studio" aria-label="Create for class">
        <h2>Create for class</h2>
        <p className="muted">
          Turn your syllabus and sources into something students can use.
        </p>
        <div className="mat-tiles">
          <button className="mat-tile t-slides" onClick={() => setDialog(true)}>
            <SlidesIcon size={20} />
            <strong>Slides</strong>
            <span>Draft a deck</span>
          </button>
          <button
            className="mat-tile t-quiz"
            onClick={() => setQuizDialog(true)}
          >
            <ClipboardCheck size={20} />
            <strong>Check-in quiz</strong>
            <span>Draft a quiz</span>
          </button>
          <div className="mat-tile t-soon" aria-disabled="true">
            <BookOpen size={20} />
            <strong>Study guide</strong>
            <span>Coming soon</span>
          </div>
        </div>
      </section>
      <button
        className="btn mat-history"
        aria-expanded={history}
        aria-controls="previous-generations"
        onClick={() => setHistory(!history)}
      >
        <History size={15} /> Previous generations ({presentations.length})
      </button>
      {history && (
        <section className="panel" id="previous-generations">
          <h2>Previous generations</h2>
          {presentations.length ? (
            presentations.map((p) => (
              <div className="gap" key={p.id}>
                <div>
                  <Badge
                    status={p.status === "published" ? "resolved" : "draft"}
                  />
                  <h3>{p.title}</h3>
                  <span className="muted">
                    {p.slides.length}{" "}
                    {p.slides.length === 1 ? "slide" : "slides"}
                    {p.status === "published"
                      ? " · Visible to students"
                      : " · Only you can see this"}
                  </span>
                </div>
                <div className="actions">
                  <Link
                    className="btn"
                    to={`/teacher/materials/presentations/${p.id}`}
                  >
                    Edit
                  </Link>
                  <button
                    className={p.status === "published" ? "btn" : "btn primary"}
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await post(`/teacher/presentations/${p.id}/publish`, {
                          published: p.status !== "published",
                        });
                        await load();
                      })
                    }
                  >
                    {p.status === "published"
                      ? "Unpublish"
                      : "Publish to students"}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">
              No presentations yet. Build slides here and choose when your
              students see them.
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Uploaded decks and links</h2>
        {sources.length ? (
          sources.map((s) => (
            <div className="gap" key={s.id}>
              <div>
                <h3>{s.name}</h3>
                <span className="muted">
                  {s.type === "deck" ? "Presentation file" : s.url}
                  {s.status === "ready" && s.chars > 0
                    ? ` · ${s.chars.toLocaleString()} characters read`
                    : ""}
                  {s.error ? ` · ${s.error}` : ""}
                </span>
              </div>
              <span className="badge">{s.status}</span>
            </div>
          ))
        ) : (
          <p className="muted">
            Files and links you add when creating a class show up here.
          </p>
        )}
      </section>

      {dialog && (
        <SlidesDialog
          sources={sources.filter((x) => x.status === "ready")}
          busy={action.busy}
          error={action.error}
          onClose={() => setDialog(false)}
          onGenerate={(body) =>
            void action.run(async () => {
              const created = await post<Presentation>(
                `/teacher/classes/${classId}/presentations/generate`,
                body,
              );
              navigate(
                `/teacher/materials/presentations/${created.id}?classId=${classId}`,
              );
            })
          }
        />
      )}
      {quizDialog && (
        <QuizDialog
          initialTopic={data.course.id === "physics" ? "Force and motion" : ""}
          busy={action.busy}
          error={action.error}
          onClose={() => setQuizDialog(false)}
          onGenerate={(topic) =>
            void action.run(async () => {
              const { jobId } = await post<{ jobId: string }>(
                `/teacher/classes/${classId}/assessments`,
                { topic },
              );
              await waitForJob(jobId);
              await refresh();
              navigate(`/teacher/assessments?classId=${classId}`);
            })
          }
        />
      )}
    </>
  );
}

function SlidesDialog(props: {
  sources: Source[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onGenerate: (body: {
    title: string;
    focus: string;
    style: "lesson" | "recap";
    length: "short" | "full";
  }) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<"lesson" | "recap">("lesson"),
    [length, setLength] = useState<"short" | "full">("full"),
    [title, setTitle] = useState(""),
    [focus, setFocus] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function build() {
    props.onGenerate({
      title: title.trim(),
      focus: focus.trim(),
      style: format,
      length,
    });
  }

  return (
    <dialog ref={ref} className="mat-dialog" onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          build();
        }}
      >
        <header>
          <h2>Generate slide deck</h2>
          <button
            type="button"
            className="mat-x"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        <label htmlFor="deck-title">Deck title</label>
        <input
          id="deck-title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Unit 1: Forces and motion"
        />
        <span className="mat-label">Style</span>
        <div className="mat-choices">
          <button
            type="button"
            aria-pressed={format === "lesson"}
            onClick={() => setFormat("lesson")}
          >
            <strong>Lesson deck</strong>
            <span>
              Slides with talking points and speaker notes to teach from.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={format === "recap"}
            onClick={() => setFormat("recap")}
          >
            <strong>Quick recap</strong>
            <span>
              Fewer points per slide for a fast review before an assessment.
            </span>
          </button>
        </div>
        <div className="mat-row">
          <div>
            <span className="mat-label">Length</span>
            <div className="mat-seg">
              <button
                type="button"
                aria-pressed={length === "short"}
                onClick={() => setLength("short")}
              >
                Short
              </button>
              <button
                type="button"
                aria-pressed={length === "full"}
                onClick={() => setLength("full")}
              >
                Full
              </button>
            </div>
          </div>
          <div>
            <span className="mat-label">Built from</span>
            <span className="mat-chip">
              Syllabus
              {props.sources.length
                ? ` + ${props.sources.length} source${props.sources.length === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
        </div>
        <label htmlFor="deck-focus">
          Main points you want the AI to touch on (optional)
        </label>
        <textarea
          id="deck-focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g. Newton's three laws, friction, and a real-world example for each."
        />
        {props.error && (
          <div role="alert" className="errorbox">
            {props.error}
          </div>
        )}
        <footer>
          <button type="submit" className="btn primary" disabled={props.busy}>
            {props.busy ? "Generating slides…" : "Generate slides"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function QuizDialog(props: {
  initialTopic: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onGenerate: (topic: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [topic, setTopic] = useState(props.initialTopic);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="mat-dialog" onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.onGenerate(topic.trim());
        }}
      >
        <header>
          <h2>Draft a check-in quiz</h2>
          <button
            type="button"
            className="mat-x"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        <label htmlFor="quiz-topic">What should the check-in cover?</label>
        <input
          id="quiz-topic"
          required
          minLength={3}
          maxLength={200}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Force and motion"
        />
        <p className="muted">
          The AI drafts questions from your syllabus. You review and publish the
          quiz on the Assessments page before students see it.
        </p>
        {props.error && (
          <div role="alert" className="errorbox">
            {props.error}
          </div>
        )}
        <footer>
          <button type="submit" className="btn primary" disabled={props.busy}>
            {props.busy ? "Drafting quiz…" : "Draft quiz"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
