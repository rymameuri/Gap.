import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bookmark,
  BookOpen,
  FileText,
  History,
  MessageSquare,
  Plus,
  Send,
  ChevronRight,
  PanelRightOpen,
  Sparkles,
  X,
} from "lucide-react";
import { useCourse } from "../../layouts/StudentLayout";
import { ErrorBox, useNotice } from "../../components/ui";
import { post } from "../../services/api";
import { courseTopics, errorMessage } from "./course-model";
import { useStudyDrafts, type StudyDraft } from "./useStudyDrafts";
import { MaterialReader } from "./components/MaterialReader";

function InstructorQuestion({ courseId }: { courseId: string }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notice = useNotice();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (question.trim().length < 5 || busy) return;
    setBusy(true);
    setError("");
    try {
      await post("/student/questions", {
        classId: courseId,
        text: question.trim(),
      });
      setQuestion("");
      notice("Your question was shared with your instructor.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="s-instructor-question">
      <summary>
        Need help now? Ask your instructor <ChevronRight size={16} />
      </summary>
      <form onSubmit={submit}>
        <label htmlFor="instructor-question">
          Question for your instructor
        </label>
        <textarea
          id="instructor-question"
          required
          minLength={5}
          maxLength={2000}
          value={question}
          disabled={busy}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What would you like your instructor to explain?"
        />
        {error && <ErrorBox message={error} />}
        <button
          className="s-button"
          disabled={busy || question.trim().length < 5}
        >
          <Send size={16} />
          {busy ? "Sharing..." : "Share with instructor"}
        </button>
      </form>
    </details>
  );
}

export function StudyAssistant() {
  const { course, gaps, quizzes } = useCourse();
  const [params, setParams] = useSearchParams();
  const draftId = params.get("draft");
  const { drafts, saveDraft, storageError } = useStudyDrafts(course.id);
  const current = drafts.find((draft) => draft.id === draftId);
  const [text, setText] = useState(current?.text || "");
  const [mode, setMode] = useState<StudyDraft["mode"]>(
    current?.mode || (params.get("mode") === "topic" ? "topic" : "question"),
  );
  const [topic, setTopic] = useState(current?.topic || "");
  const [material, setMaterial] = useState("syllabus");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const notice = useNotice();
  const topics = courseTopics(gaps, quizzes);
  // Switching drafts intentionally replaces the editor; background course refreshes do not.
  useEffect(() => {
    setText(current?.text || "");
    setTopic(current?.topic || "");
    setMode(
      current?.mode || (params.get("mode") === "topic" ? "topic" : "question"),
    );
  }, [draftId, current?.id, params.get("mode")]);
  const dirty =
    text !== (current?.text || "") ||
    mode !== (current?.mode || "question") ||
    topic !== (current?.topic || "");
  const save = () => {
    if (!text.trim()) return;
    const draft = saveDraft({ text: text.trim(), topic, mode }, current?.id);
    if (draft) {
      setParams({ draft: draft.id }, { replace: true });
      notice("Draft saved in this browser.");
    }
  };
  function switchDraft(id: string) {
    if (
      dirty &&
      text.trim() &&
      !saveDraft({ text: text.trim(), topic, mode }, current?.id)
    )
      return;
    setParams(id ? { draft: id } : {});
  }
  return (
    <div className={`s-assistant-page ${sourcesOpen ? "with-sources" : ""}`}>
      <section className="s-conversation" aria-label="Study conversation">
        <header className="s-assistant-header">
          <div>
            <span className="s-kicker">{course.name}</span>
            <h1>Study Assistant</h1>
          </div>
          <div className="s-assistant-actions">
            <button
              className={`s-button ${sourcesOpen ? "is-active" : ""}`}
              type="button"
              aria-expanded={sourcesOpen}
              aria-controls="study-sources"
              onClick={() => setSourcesOpen((open) => !open)}
            >
              <PanelRightOpen size={17} />
              Sources
            </button>
            <button
              className="s-icon-button"
              type="button"
              title="New study draft"
              aria-label="New study draft"
              onClick={() => switchDraft("")}
            >
              <Plus size={19} />
            </button>
          </div>
        </header>

        <div className="s-draft-bar">
          <History size={16} aria-hidden="true" />
          <label className="sr-only" htmlFor="study-drafts">
            Saved study drafts
          </label>
          <select
            id="study-drafts"
            value={current?.id || ""}
            onChange={(event) => switchDraft(event.target.value)}
          >
            <option value="">New conversation</option>
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.text.slice(0, 65)}
              </option>
            ))}
          </select>
          <span className="s-availability">
            <span />
            AI not connected
          </span>
        </div>

        <div className="s-thread">
          <div className="s-thread-content">
            {current ? (
              <div className="s-draft-message">
                <span className="s-avatar" aria-hidden="true">
                  You
                </span>
                <div>
                  <span className="s-kicker">Saved draft</span>
                  <p>{current.text}</p>
                </div>
              </div>
            ) : (
              <div className="s-assistant-welcome">
                <span className="s-assistant-symbol">
                  <Sparkles size={28} />
                </span>
                <h2>What would you like to understand?</h2>
                <p>
                  Ask about a concept, work through a topic, or open your course
                  sources while you study.
                </p>
                {topics.length > 0 && (
                  <div className="s-suggestions">
                    {topics.slice(0, 3).map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => {
                          setText(
                            `Can you help me understand ${item.toLowerCase()}?`,
                          );
                          setTopic(item);
                        }}
                      >
                        <BookOpen size={16} />
                        <span>{item}</span>
                        <ArrowPrompt />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            className="s-composer"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="s-mode-control" aria-label="Study mode">
              <button
                type="button"
                aria-pressed={mode === "question"}
                onClick={() => setMode("question")}
              >
                <MessageSquare size={15} />
                Ask
              </button>
              <button
                type="button"
                aria-pressed={mode === "topic"}
                onClick={() => setMode("topic")}
              >
                <BookOpen size={15} />
                Study a topic
              </button>
            </div>
            {mode === "topic" && (
              <div className="s-topic-picker">
                <label htmlFor="study-topic">Topic</label>
                <select
                  id="study-topic"
                  value={topic}
                  onChange={(event) => {
                    setTopic(event.target.value);
                    if (!text || text.startsWith("Help me work through "))
                      setText(`Help me work through ${event.target.value}.`);
                  }}
                >
                  <option value="">Choose a topic</option>
                  {topics.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="sr-only" htmlFor="study-message">
              {current ? "Edit your saved draft" : "Message Study Assistant"}
            </label>
            <div className="s-composer-input">
              <textarea
                id="study-message"
                maxLength={2000}
                required
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Message Study Assistant..."
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (text.trim()) save();
                  }
                }}
              />
              <button
                className="s-composer-submit"
                title="Save draft"
                aria-label="Save draft"
                disabled={!text.trim()}
              >
                <Bookmark size={18} />
              </button>
            </div>
            <p className="s-composer-note">
              AI replies are not connected yet. Enter saves a private draft;
              Shift+Enter adds a new line.
            </p>
            {storageError && <ErrorBox message={storageError} />}
          </form>
          <InstructorQuestion courseId={course.id} />
        </div>
      </section>

      {sourcesOpen && (
        <aside className="s-sources-panel" id="study-sources">
          <div className="s-sources-header">
            <div>
              <span className="s-kicker">Grounding</span>
              <h2>Course sources</h2>
            </div>
            <button
              className="s-icon-button"
              type="button"
              title="Close sources"
              aria-label="Close sources"
              onClick={() => setSourcesOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="s-sources-note">
            <FileText size={16} />
            <span>
              These are the materials future assistant responses should cite.
            </span>
          </div>
          <MaterialReader
            course={course}
            gaps={gaps}
            selectedId={material}
            onSelect={setMaterial}
          />
        </aside>
      )}
    </div>
  );
}

function ArrowPrompt() {
  return <ChevronRight size={15} aria-hidden="true" />;
}
