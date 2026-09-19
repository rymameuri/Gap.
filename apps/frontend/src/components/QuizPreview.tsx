import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Quiz } from "../services/types";

/** Read-only view of a quiz as a student sees it: no answers, rubric or keywords. */
export function QuizPreview({
  quiz,
  onClose,
}: {
  quiz: Quiz;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="mat-dialog quiz-preview"
      aria-label={`Student view of ${quiz.title}`}
      onClose={onClose}
    >
      <div className="quiz-preview-body">
        <header>
          <div>
            <span className="badge">Student view</span>
            <h2>{quiz.title}</h2>
          </div>
          <button
            type="button"
            className="mat-x"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        <p className="muted">
          This is how students see the quiz. Nothing you do here is submitted.
        </p>
        {quiz.questions.map((q, i) => (
          <fieldset className="quiz-preview-q" key={q.id}>
            <legend>
              {i + 1}. {q.prompt}
            </legend>
            {q.kind === "choice" ? (
              q.options.map((option) => (
                <label className="quiz-preview-option" key={option}>
                  <input type="radio" name={q.id} />
                  <span>{option}</span>
                </label>
              ))
            ) : (
              <textarea
                aria-label={`Answer to question ${String(i + 1)}`}
                placeholder="Students type their answer here."
              />
            )}
          </fieldset>
        ))}
        <footer>
          <button
            type="button"
            className="btn primary"
            onClick={() => ref.current?.close()}
          >
            Close preview
          </button>
        </footer>
      </div>
    </dialog>
  );
}
