import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
} from "lucide-react";
import { useCourse } from "../../layouts/StudentLayout";
import { ErrorBox } from "../../components/ui";
import { post } from "../../services/api";
import type { Quiz } from "../../services/types";
import { coursePath, errorMessage } from "./course-model";
import { EmptyState, PageHeading } from "./components/StudentUI";

type Submission = {
  status: string;
  message?: string;
  score?: number;
  total?: number;
};

export function QuizPage() {
  const { quizId } = useParams();
  const { course, quizzes } = useCourse();
  const quiz = quizzes.find((item) => item.id === quizId);
  if (!quiz)
    return (
      <EmptyState icon={ClipboardCheck} title="Quiz not found">
        <Link className="s-text-link" to={coursePath(course.id, "practice")}>
          Back to Practice & Quizzes
        </Link>
      </EmptyState>
    );
  return <QuizRunner key={quiz.id} quiz={quiz} />;
}

function QuizRunner({ quiz }: { quiz: Quiz }) {
  const { course, refresh, grades } = useCourse();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Submission | null>(null);
  const submission = quiz.submission || result;
  const feedback = grades.find((grade) => grade.quiz_id === quiz.id);
  const question = quiz.questions[step];
  const points = quiz.questions.reduce((sum, item) => sum + item.maxPoints, 0);
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await post<Submission>(`/student/quizzes/${quiz.id}/submit`, {
          answers,
        }),
      );
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="s-back" to={coursePath(course.id, "practice")}>
        <ArrowLeft size={16} />
        Practice & Quizzes
      </Link>
      <PageHeading
        title={quiz.title}
        description={`${quiz.questions.length} questions · ${points} points`}
      />
      {error && <ErrorBox message={error} />}
      {submission ? (
        <section className="s-quiz-results" aria-live="polite">
          <span
            className={`s-result-symbol ${submission.status === "pending" ? "amber" : "green"}`}
          >
            {submission.status === "pending" ? (
              <Clock3 size={26} />
            ) : (
              <CheckCircle2 size={26} />
            )}
          </span>
          <h2>
            {submission.status === "pending"
              ? "Submitted for review"
              : "Your results"}
          </h2>
          {submission.status === "pending" ? (
            <p>
              Your instructor is reviewing your answers. Your score and feedback
              will appear after approval.
            </p>
          ) : (
            <>
              <div className="s-score">
                {submission.score}
                <span> / {submission.total}</span>
              </div>
              <p>{feedback?.reason || "Your answers have been graded."}</p>
            </>
          )}
          {feedback && (
            <div className="s-feedback-list">
              {feedback.results.map((item) => {
                const q = quiz.questions.find(
                  (entry) => entry.id === item.questionId,
                );
                return (
                  <article key={item.questionId}>
                    <div className="s-section-heading">
                      <h3>{q?.topic || "Question feedback"}</h3>
                      <span>
                        {item.score} / {q?.maxPoints ?? "-"}
                      </span>
                    </div>
                    <p className="s-result-prompt">{q?.prompt}</p>
                    <p>{item.reason}</p>
                  </article>
                );
              })}
            </div>
          )}
          <div className="s-button-row">
            <Link
              className="s-button s-primary"
              to={coursePath(course.id, "progress")}
            >
              View my progress <ArrowRight size={16} />
            </Link>
            <Link className="s-button" to={coursePath(course.id, "practice")}>
              Back to practice
            </Link>
          </div>
        </section>
      ) : !question ? (
        <EmptyState icon={ClipboardCheck} title="This quiz has no questions">
          <p>Please check back after your instructor updates it.</p>
        </EmptyState>
      ) : (
        <div className="s-quiz-workspace">
          <div className="s-quiz-step">
            <span>
              {reviewing
                ? "Review your answers"
                : `Question ${step + 1} of ${quiz.questions.length}`}
            </span>
            <span>{reviewing ? "Ready to submit" : question.topic}</span>
          </div>
          <progress
            className="s-quiz-progress"
            aria-label="Quiz position"
            max={quiz.questions.length}
            value={reviewing ? quiz.questions.length : step + 1}
          />
          {reviewing ? (
            <section>
              <h2>Ready to hand it in?</h2>
              <div className="s-answer-review">
                {quiz.questions.map((item, index) => (
                  <div key={item.id}>
                    <span className="s-muted">Question {index + 1}</span>
                    <h3>{item.prompt}</h3>
                    <p>{answers[item.id]}</p>
                    <button
                      className="s-text-button"
                      disabled={busy}
                      onClick={() => {
                        setStep(index);
                        setReviewing(false);
                      }}
                    >
                      Edit answer
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="s-button s-primary"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? "Submitting answers..." : "Submit quiz"}
                <CheckCircle2 size={17} />
              </button>
            </section>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!answers[question.id]?.trim()) return;
                if (step === quiz.questions.length - 1) setReviewing(true);
                else setStep(step + 1);
              }}
            >
              <fieldset className="s-question-fieldset">
                <legend>{question.prompt}</legend>
                <p className="s-muted">
                  {question.maxPoints} points · {question.section}
                </p>
                {question.kind === "choice" ? (
                  <div className="s-options">
                    {question.options.map((option, index) => (
                      <label
                        className={`s-option ${answers[question.id] === option ? "selected" : ""}`}
                        key={option}
                      >
                        <input
                          type="radio"
                          required
                          name={question.id}
                          checked={answers[question.id] === option}
                          onChange={() =>
                            setAnswers({ ...answers, [question.id]: option })
                          }
                        />
                        <span className="s-option-letter" aria-hidden="true">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <>
                    <label htmlFor="quiz-answer">Your explanation</label>
                    <textarea
                      id="quiz-answer"
                      required
                      maxLength={4000}
                      value={answers[question.id] || ""}
                      onChange={(event) =>
                        setAnswers({
                          ...answers,
                          [question.id]: event.target.value,
                        })
                      }
                    />
                  </>
                )}
              </fieldset>
              <div className="s-quiz-navigation">
                <button
                  type="button"
                  className="s-button"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={16} />
                  Previous
                </button>
                <button
                  className="s-button s-primary"
                  disabled={!answers[question.id]?.trim()}
                >
                  {step === quiz.questions.length - 1
                    ? "Review answers"
                    : "Next question"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
