import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";
import { useCourse } from "../../layouts/StudentLayout";
import { post } from "../../services/api";
import { ErrorBox } from "../../components/ui";
import type { Gap } from "../../services/types";
import { coursePath, errorMessage } from "./course-model";
import { EmptyState, PageHeading } from "./components/StudentUI";

export function Lesson() {
  const { gapId } = useParams();
  const { course, gaps } = useCourse();
  const gap = gaps.find((item) => item.id === gapId);
  if (!gap?.content || !gap.probe)
    return (
      <EmptyState icon={BookOpen} title="This explanation is not available">
        <Link className="s-text-link" to={coursePath(course.id, "practice")}>
          Back to Practice & Quizzes
        </Link>
      </EmptyState>
    );
  return <LessonContent key={gap.id} gap={gap} />;
}

function LessonContent({ gap }: { gap: Gap }) {
  const { course, refresh } = useCourse();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ correct: boolean } | null>(null);
  const [error, setError] = useState("");
  const completed = result?.correct || gap.status === "resolved";
  return (
    <>
      <Link className="s-back" to={coursePath(course.id, "practice")}>
        <ArrowLeft size={16} />
        Practice & Quizzes
      </Link>
      <PageHeading
        title={gap.topic}
        description={gap.section}
        action={
          <span className="s-availability s-approved">
            <CheckCircle2 size={15} />
            Instructor-approved
          </span>
        }
      />
      <div className="s-lesson-layout">
        <article className="s-lesson-reading">
          <span className="s-kicker">Review the idea</span>
          <h2>A closer look</h2>
          <div className="s-lesson-copy">{gap.content}</div>
          <div className="s-lesson-source">
            <BookOpen size={17} />
            <span>Shared by your instructor · {gap.section}</span>
          </div>
          <details className="s-evidence-note">
            <summary>Earlier assessment evidence</summary>
            <p>{gap.source}</p>
            <blockquote>{gap.tag}</blockquote>
          </details>
        </article>
        <section className="s-recheck">
          <span className="s-kicker">Put it into practice</span>
          <h2>A quick follow-up</h2>
          <p className="s-muted">
            This check follows the explanation, so it counts as supported
            practice.
          </p>
          {completed ? (
            <div className="s-feedback success" role="status">
              <CheckCircle2 size={22} />
              <div>
                <strong>Follow-up completed</strong>
                <p>
                  You answered correctly after reviewing the explanation. Your
                  progress has been updated.
                </p>
              </div>
            </div>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy || !answer) return;
                setBusy(true);
                setError("");
                try {
                  setResult(
                    await post(`/student/gaps/${gap.id}/recheck`, { answer }),
                  );
                  await refresh();
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset className="s-question-fieldset" disabled={busy}>
                <legend>{gap.probe?.prompt}</legend>
                <div className="s-options">
                  {gap.probe?.options.map((option) => (
                    <label
                      className={`s-option ${answer === option ? "selected" : ""}`}
                      key={option}
                    >
                      <input
                        type="radio"
                        name="recheck"
                        required
                        checked={answer === option}
                        onChange={() => setAnswer(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="s-button s-primary" disabled={busy || !answer}>
                {busy ? "Checking..." : "Check my answer"}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          {result && !result.correct && (
            <div className="s-feedback" role="status">
              <p>
                Not quite. Revisit the explanation and try again. Your
                instructor has received the result and can offer more support.
              </p>
            </div>
          )}
          {error && <ErrorBox message={error} />}
          <Link
            className="s-text-link s-progress-link"
            to={coursePath(course.id, "progress")}
          >
            View my progress <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    </>
  );
}
