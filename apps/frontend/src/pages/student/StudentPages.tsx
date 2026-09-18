import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ClassLink as Link } from "../../components/ClassLink";
import { useStudent } from "../../layouts/workspace";
import { useSession } from "../../services/session";
import { Title, Badge, Empty, ErrorBox, useNotice } from "../../components/ui";
import { post } from "../../services/api";
import type { Quiz } from "../../services/types";
const msg = (e: unknown) => (e instanceof Error ? e.message : "Please retry.");
export function MyLearning() {
  const { data, refresh } = useStudent(),
    { user } = useSession(),
    notice = useNotice();
  const [params] = useSearchParams();
  const [question, setQuestion] = useState(""),
    [classId, setClassId] = useState(
      params.get("classId") || data.courses[0]?.id || "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Title
        label="MY LEARNING"
        heading="Keep moving forward."
        description={
          (user?.name.split(" ")[0] || "") +
          ", let’s work through one idea at a time."
        }
      />
      <div className="stats">
        {[
          [
            "My learning gaps",
            data.gaps.filter((g) => g.status !== "resolved").length,
          ],
          ["Resolved", data.gaps.filter((g) => g.status === "resolved").length],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <label>{label}</label>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <h2>Your next steps</h2>
        {data.gaps.length ? (
          data.gaps.map((g) => (
            <div className="gap" key={g.id}>
              <div>
                <Badge status={g.status} />
                <h3>{g.topic}</h3>
                <div className="muted">{g.tag}</div>
                <div className="muted" style={{ marginTop: 10 }}>
                  Flagged from {g.source} · {g.class_name}
                </div>
              </div>
              {g.content ? (
                <Link
                  className={
                    "btn " + (g.status === "resolved" ? "" : "primary")
                  }
                  to={"/student/gaps/" + g.id}
                >
                  {g.status === "resolved" ? "Revisit" : "Start learning"}
                </Link>
              ) : (
                <span className="muted">
                  Waiting for teacher-approved explanation
                </span>
              )}
            </div>
          ))
        ) : (
          <Empty>
            No flagged gaps. Your next assessment will help show what to focus
            on.
          </Empty>
        )}
      </section>
      <section className="panel">
        <h2>A question on your mind?</h2>
        <p className="muted">
          Share it with your teacher. It helps them see where the class needs
          support.
        </p>
        {error && <ErrorBox message={error} />}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await post("/student/questions", { classId, text: question });
              setQuestion("");
              await refresh();
              notice("Question shared with your teacher.");
            } catch (error) {
              setError(msg(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field" htmlFor="question-class">
            Class
          </label>
          <select
            id="question-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="field" htmlFor="student-question">
            Your question
          </label>
          <textarea
            id="student-question"
            required
            minLength={5}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button className="btn" disabled={busy || !classId}>
            Share question
          </button>
        </form>
      </section>
    </>
  );
}
export function Lesson() {
  const { id } = useParams(),
    { data, refresh } = useStudent();
  const gap = data.gaps.find((g) => g.id === id),
    [answer, setAnswer] = useState(""),
    [result, setResult] = useState<{
      correct: boolean;
      message: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!gap?.content || !gap.probe)
    return (
      <section className="panel">
        <Empty>This teacher-approved explanation is not available.</Empty>
        <Link to="/student/learning">Back to my learning</Link>
      </section>
    );
  return (
    <>
      <Link className="backlink" to="/student/learning">
        ← Back to my learning
      </Link>
      <Title
        label="YOUR NEXT STEP"
        heading={gap.topic}
        description={gap.section}
      />
      <section className="panel">
        <Badge status={gap.status} />
        <h3 style={{ marginTop: 22 }}>Why this was flagged</h3>
        <p>{gap.tag}</p>
        <p className="muted">Evidence: {gap.source}</p>
        <h2>Let’s clear this up</h2>
        <div className="lessonbox lesson" style={{ whiteSpace: "pre-line" }}>
          {gap.content}
        </div>
        <h2>Quick recheck</h2>
        <p>{gap.probe.prompt}</p>
        {error && <ErrorBox message={error} />}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              setResult(
                await post("/student/gaps/" + gap.id + "/recheck", { answer }),
              );
              await refresh();
            } catch (e) {
              setError(msg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="options" style={{ border: 0, padding: 0 }}>
            <legend className="sr-only">{gap.probe.prompt}</legend>
            {gap.probe.options.map((option) => (
              <label className="option" key={option}>
                <input
                  type="radio"
                  required
                  name="probe"
                  value={option}
                  checked={answer === option}
                  onChange={() => setAnswer(option)}
                />
                {option}
              </label>
            ))}
          </fieldset>
          <button className="btn primary" disabled={busy || !!result?.correct}>
            Check understanding
          </button>
        </form>
        {result && (
          <div className="feedback" role="status">
            {result.message}
          </div>
        )}
        <p className="notice">
          If you’re still stuck after this, your teacher receives the result
          directly.
        </p>
      </section>
    </>
  );
}
function AssessmentForm({ quiz }: { quiz: Quiz }) {
  const { refresh } = useStudent();
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      status: string;
      message?: string;
      score?: number;
      total?: number;
    } | null>(null);
  return (
    <section className="panel">
      <h2>{quiz.title}</h2>
      <p className="muted">{quiz.class_name}</p>
      {quiz.submission ? (
        <>
          <Badge status={quiz.submission.status} />
          <p>
            {quiz.submission.status === "pending"
              ? "Your teacher is reviewing the grade. It will appear here after approval."
              : "Score: " +
                quiz.submission.score +
                " / " +
                quiz.submission.total}
          </p>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              setResult(
                await post("/student/quizzes/" + quiz.id + "/submit", {
                  answers,
                }),
              );
              await refresh();
            } catch (e) {
              setError(msg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {quiz.questions.map((q, i) => (
            <div className="question-card" key={q.id}>
              <h3>
                {i + 1}. {q.prompt}
              </h3>
              <p className="muted">
                {q.maxPoints} points · {q.section}
              </p>
              {q.kind === "choice" ? (
                <fieldset className="options" style={{ border: 0, padding: 0 }}>
                  <legend className="sr-only">{q.prompt}</legend>
                  {q.options.map((o) => (
                    <label className="option" key={o}>
                      <input
                        type="radio"
                        required
                        name={quiz.id + q.id}
                        checked={answers[q.id] === o}
                        onChange={() => setAnswers({ ...answers, [q.id]: o })}
                      />
                      {o}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <>
                  <label className="field" htmlFor={quiz.id + q.id}>
                    Your explanation
                  </label>
                  <textarea
                    required
                    id={quiz.id + q.id}
                    value={answers[q.id] || ""}
                    onChange={(e) =>
                      setAnswers({ ...answers, [q.id]: e.target.value })
                    }
                  />
                </>
              )}
              <div className="rubric">{q.rubric}</div>
            </div>
          ))}
          <button className="btn primary" disabled={busy}>
            {busy ? "Assessment Agent is grading…" : "Submit assessment"}
          </button>
        </form>
      )}
      {error && <ErrorBox message={error} />}{" "}
      {result && (
        <div className="feedback" role="status">
          {result.message ||
            "Published score: " + result.score + " / " + result.total}
        </div>
      )}
    </section>
  );
}
export function StudentAssessments() {
  const { data } = useStudent();
  return (
    <>
      <Title
        label="CLASS ASSESSMENTS"
        heading="Show what you know."
        description="Your published assessments and reviewed feedback."
      />
      {data.quizzes.length ? (
        data.quizzes.map((q) => <AssessmentForm key={q.id} quiz={q} />)
      ) : (
        <section className="panel">
          <Empty>No published assessments yet.</Empty>
        </section>
      )}
      {!!data.grades.length && (
        <section className="panel">
          <h2>Feedback from your teacher</h2>
          {data.grades.map((g) => (
            <div className="timeline" key={g.id}>
              <h3>{g.title}</h3>
              <p>
                {g.score} / {g.total} · {g.reason}
              </p>
              {g.results.map((r) => (
                <p className="muted" key={r.questionId}>
                  {r.questionId.toUpperCase()}: {r.reason}
                </p>
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
export function Progress() {
  const { data } = useStudent();
  return (
    <>
      <Title
        label="YOUR PROGRESS"
        heading="Every step counts."
        description="Follow-up checks show what you’ve understood."
      />
      <section className="panel">
        {data.gaps.map((g) => (
          <div className="timeline" key={g.id}>
            <div className="listrow">
              <h3>{g.topic}</h3>
              <Badge status={g.status} />
            </div>
            <p className="muted">
              {g.status === "resolved"
                ? "Verified with a correct follow-up answer."
                : g.status === "struggling"
                  ? "Your teacher has been notified for further support."
                  : g.status === "ready"
                    ? "Explanation ready; check your understanding next."
                    : "Gap identified from assessment evidence."}
            </p>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Your learning history</h2>
        {data.progress.length ? (
          data.progress.map((p) => (
            <div className="timeline" key={p.id}>
              <h3>{p.topic}</h3>
              <Badge status={p.correct ? "resolved" : "struggling"} />
              <div className="muted">
                {new Date(p.created_at).toLocaleString()}
              </div>
            </div>
          ))
        ) : (
          <Empty>Your completed follow-up checks will appear here.</Empty>
        )}
      </section>
    </>
  );
}
