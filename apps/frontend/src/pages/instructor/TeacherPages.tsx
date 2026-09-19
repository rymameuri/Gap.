import { MaterialFileImport } from "../../components/MaterialFileImport";
import { LearningCharts } from "../../components/LearningCharts";
import {
  Users,
  Layers,
  CheckCircle2,
  ClipboardCheck,
  ArrowUpRight,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ClassLink as Link } from "../../components/ClassLink";
import { useTeacher } from "../../layouts/workspace";
import { Title, Badge, Empty, ErrorBox, useNotice } from "../../components/ui";
import { post, put, waitForJob } from "../../services/api";
import type {
  Quiz,
  Question,
  Intervention,
  Review,
} from "../../services/types";
import { SpeechInputButton } from "../../components/SpeechInputButton";
import { appendSpeechTranscript } from "../../components/speech-recognition";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "The action could not be completed.";
function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    notice = useNotice();
  async function run(fn: () => Promise<void>, success?: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (success) notice(success);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function Overview() {
  const { data } = useTeacher();
  const priority = data.clusters[0];
  const resolved = data.gaps.filter((g) => g.status === "resolved").length;
  const metrics = [
    {
      label: "Students",
      value: data.roster.length,
      detail: "Enrolled in this class",
      Icon: Users,
      tone: "neutral",
      to: "/teacher/students",
    },
    {
      label: "Learning gaps",
      value: data.clusters.length,
      detail: "Topics needing support",
      Icon: Layers,
      tone: "lavender",
      to: "/teacher/gaps?status=open",
    },
    {
      label: "Resolved",
      value: resolved,
      detail: "Verified learning outcomes",
      Icon: CheckCircle2,
      tone: "sage",
      to: "/teacher/gaps?status=resolved",
    },
    {
      label: "Awaiting review",
      value: data.reviews.length,
      detail: "Responses to check",
      Icon: ClipboardCheck,
      tone: "sand",
      to: "/teacher/review",
    },
  ];
  return (
    <div className="teacher-overview">
      <div className="overview-heading">
        <div>
          <h1>Class overview</h1>
          <p>Review enrollment, learning gaps, and work awaiting review.</p>
        </div>
        <Link className="btn primary" to="/teacher/assessments">
          Create assessment <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="overview-metrics">
        {metrics.map(({ label, value, detail, Icon, tone, to }) => (
          <Link
            to={to}
            className={"overview-metric " + tone}
            key={label}
            aria-label={label + ": " + value + ". View details"}
          >
            <div className="metric-label">
              <span>{label}</span>
              <Icon size={18} strokeWidth={1.6} />
            </div>
            <strong>{value}</strong>
            <span className="metric-detail">
              {detail} <ArrowUpRight size={13} />
            </span>
          </Link>
        ))}
      </div>
      {priority && (
        <section className="priority-insight">
          <div className="insight-marker">
            <Layers size={21} />
          </div>
          <div>
            <span className="eyebrow">PRIORITY FOR YOUR CLASS</span>
            <h2>{priority.topic} needs the most support</h2>
            <p>
              {priority.students} of {data.roster.length} students have this
              learning gap. A focused explanation is a good next step.
            </p>
          </div>
          <Link className="btn insight-action" to="/teacher/content">
            Prepare explanation <ArrowRight size={16} />
          </Link>
        </section>
      )}
      <LearningCharts
        clusters={data.clusters}
        gaps={data.gaps}
        students={data.roster.length}
      />
      <div className="grid">
        <section className="panel gap-panel">
          <div className="panelhead">
            <h2>Learning gaps</h2>
            <span className="muted">Students needing support</span>
          </div>
          {data.clusters.length ? (
            data.clusters.map((c) => (
              <div className="gap" key={c.tag}>
                <div className="gap-summary">
                  <Badge status={c.struggling ? "struggling" : "open"} />
                  <h3>{c.topic}</h3>
                  <div className="muted">{c.tag}</div>
                  <div className="muted" style={{ marginTop: 10 }}>
                    {c.section}
                  </div>
                  <div className="gap-measure">
                    <span>
                      <strong>{c.students}</strong> of {data.roster.length}{" "}
                      students
                    </span>
                    <span>
                      {data.roster.length
                        ? Math.round((c.students / data.roster.length) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <div
                    className="gap-track"
                    role="meter"
                    aria-label={c.topic + " students needing support"}
                    aria-valuemin={0}
                    aria-valuemax={data.roster.length || 1}
                    aria-valuenow={c.students}
                  >
                    <span
                      style={{
                        width:
                          Math.min(
                            100,
                            (c.students / Math.max(1, data.roster.length)) *
                              100,
                          ) + "%",
                      }}
                    />
                  </div>
                </div>
                <Link className="btn small gap-action" to="/teacher/content">
                  Prepare explainer
                </Link>
              </div>
            ))
          ) : (
            <Empty>No open learning gaps.</Empty>
          )}
        </section>
        <div>
          <section className="panel">
            <h2>Questions from your class</h2>
            {data.asked.length ? (
              data.asked.slice(0, 5).map((q) => (
                <Link
                  to={
                    "/teacher/students?search=" +
                    encodeURIComponent(q.student_name)
                  }
                  className="question dashboard-student-link"
                  key={q.id}
                >
                  {q.text}
                  <div className="muted">{q.student_name}</div>
                </Link>
              ))
            ) : (
              <div className="overview-empty">
                <MessageSquare size={24} strokeWidth={1.3} />
                <strong>No questions yet</strong>
                <p>Questions shared by your students will appear here.</p>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Students to check in with</h2>
            {!data.roster.some((s) => s.open_gaps > 0) && (
              <p className="muted">No students currently need a check-in.</p>
            )}
            {data.roster
              .filter((s) => s.open_gaps > 0)
              .slice(0, 4)
              .map((s) => (
                <Link
                  to={"/teacher/students?student=" + s.id}
                  className="activity dashboard-student-link"
                  key={s.id}
                >
                  <span className="avatar">
                    {s.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <div>
                    {s.name}
                    <div className="muted">{s.open_gaps} open gaps</div>
                  </div>
                  <ArrowUpRight size={14} />
                </Link>
              ))}
          </section>
          <section className="panel">
            <h2>Class participation</h2>
            {!data.roster.some((s) => s.activity > 0) && (
              <p className="muted">
                Participation will appear as students share questions.
              </p>
            )}
            {[...data.roster]
              .filter((s) => s.activity > 0)
              .sort((a, b) => b.activity - a.activity)
              .slice(0, 3)
              .map((s) => (
                <Link
                  className="question dashboard-student-link"
                  to={"/teacher/students?student=" + s.id}
                  key={s.id}
                >
                  {s.name}
                  <b>{s.activity} questions</b>
                </Link>
              ))}
          </section>
        </div>
      </div>
      <section className="panel">
        <h2>Recent assessments</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Submissions</th>
                <th>Flagged</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.quizzes.map((q) => (
                <tr key={q.id}>
                  <td>
                    <Link
                      to={
                        q.flagged ? "/teacher/review" : "/teacher/assessments"
                      }
                    >
                      {q.title}
                    </Link>
                  </td>
                  <td>{q.submissions}</td>
                  <td>{q.flagged}</td>
                  <td>
                    <Badge status={q.flagged ? "pending" : q.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
export function Assessments() {
  const { data, refresh } = useTeacher(),
    action = useAction();
  const [topic, setTopic] = useState(
      data.course.id === "physics" ? "Force and motion" : "",
    ),
    [draft, setDraft] = useState<Quiz | null>(null);
  useEffect(() => {
    setTopic(data.course.id === "physics" ? "Force and motion" : "");
    setDraft(null);
  }, [data.course.id]);
  async function generate() {
    await action.run(async () => {
      const { jobId } = await post<{ jobId: string }>(
        "/teacher/classes/" + data.course.id + "/assessments",
        { topic },
      );
      const result = await waitForJob(jobId);
      await refresh();
      if (result?.quizId) setDraft(null);
    }, "Quiz draft ready. Select it below to review.");
  }
  function updateQuestion(id: string, patch: Partial<Question>) {
    setDraft((q) =>
      q
        ? {
            ...q,
            questions: q.questions.map((question) =>
              question.id === id ? { ...question, ...patch } : question,
            ),
          }
        : q,
    );
  }
  async function save(publish = false) {
    if (!draft) return;
    await action.run(
      async () => {
        await put("/teacher/quizzes/" + draft.id, {
          title: draft.title,
          questions: draft.questions,
        });
        if (publish) await post("/teacher/quizzes/" + draft.id + "/publish");
        await refresh();
        setDraft(null);
      },
      publish ? "Assessment published." : "Draft saved.",
    );
  }
  return (
    <>
      <Title
        label="ASSESSMENT"
        heading="Assessments"
        description="Choose a course topic, then review every question before publishing."
      />
      {action.error && <ErrorBox message={action.error} />}
      <section className="panel">
        {data.engine === "local" && (
          <p className="muted">
            The local demo can draft only Force and motion, Energy and work, or
            Electric circuits when the topic appears in the syllabus. Other
            topics require live AI.
          </p>
        )}
        <label className="field" htmlFor="topic">
          Topic
        </label>
        <div className="voice-field">
          <input
            id="topic"
            list="topics"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic from this course"
          />
          <SpeechInputButton
            label="Dictate the assessment topic"
            disabled={action.busy}
            onTranscript={(transcript) =>
              setTopic((currentTopic) =>
                appendSpeechTranscript(currentTopic, transcript),
              )
            }
          />
        </div>
        <datalist id="topics">
          {data.engine === "local" &&
            ["Force and motion", "Energy and work", "Electric circuits"].map(
              (t) => <option key={t} value={t} />,
            )}
        </datalist>
        <div className="actions">
          <button
            className="btn primary"
            disabled={action.busy || topic.trim().length < 3}
            onClick={() => void generate()}
          >
            {action.busy ? "Assessment Agent is working…" : "Draft quiz"}
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Your assessments</h2>
        {data.quizzes.map((q) => (
          <div className="gap" key={q.id}>
            <div>
              <Badge status={q.status} />
              <h3>{q.title}</h3>
              <span className="muted">
                {q.questions.length} questions ·{" "}
                {q.engine === "local" ? "Local teaching bank" : "Live AI"}
              </span>
            </div>
            {q.status === "draft" ? (
              <button
                className="btn"
                onClick={() => setDraft(structuredClone(q))}
              >
                Review draft
              </button>
            ) : (
              <Link className="btn" to="/teacher/review">
                View review queue
              </Link>
            )}
          </div>
        ))}
      </section>
      {draft && (
        <section className="panel">
          <h2>Review and edit</h2>
          <label className="field" htmlFor="quiz-title">
            Title
          </label>
          <input
            id="quiz-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          {draft.questions.map((q, i) => (
            <div className="question-card" key={q.id}>
              <h3>
                Question {i + 1} ·{" "}
                {q.kind === "choice" ? "Multiple choice" : "Short answer"}
              </h3>
              <label className="field" htmlFor={"prompt-" + q.id}>
                Question
              </label>
              <textarea
                id={"prompt-" + q.id}
                value={q.prompt}
                onChange={(e) =>
                  updateQuestion(q.id, { prompt: e.target.value })
                }
              />
              {q.kind === "choice" && (
                <>
                  {q.options.map((option, j) => (
                    <div key={j}>
                      <label className="field" htmlFor={q.id + "-option-" + j}>
                        Option {j + 1}
                      </label>
                      <input
                        id={q.id + "-option-" + j}
                        value={option}
                        onChange={(e) => {
                          const options = [...q.options];
                          options[j] = e.target.value;
                          updateQuestion(q.id, {
                            options,
                            correctAnswer:
                              q.correctAnswer === option
                                ? e.target.value
                                : q.correctAnswer,
                          });
                        }}
                      />
                    </div>
                  ))}
                  <label className="field" htmlFor={"correct-" + q.id}>
                    Correct answer
                  </label>
                  <select
                    id={"correct-" + q.id}
                    value={q.correctAnswer}
                    onChange={(e) =>
                      updateQuestion(q.id, { correctAnswer: e.target.value })
                    }
                  >
                    {q.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </>
              )}
              <label className="field" htmlFor={"rubric-" + q.id}>
                Rubric
              </label>
              <textarea
                id={"rubric-" + q.id}
                value={q.rubric}
                onChange={(e) =>
                  updateQuestion(q.id, { rubric: e.target.value })
                }
              />
              <div className="muted">
                {q.section} · Misconception: {q.tag}
              </div>
            </div>
          ))}
          <div className="actions">
            <button
              className="btn"
              disabled={action.busy}
              onClick={() => void save()}
            >
              Save draft
            </button>
            <button
              className="btn primary"
              disabled={action.busy}
              onClick={() => void save(true)}
            >
              Publish quiz
            </button>
          </div>
        </section>
      )}
    </>
  );
}
function ReviewCard({ review }: { review: Review }) {
  const { refresh } = useTeacher(),
    action = useAction();
  const [scores, setScores] = useState<Record<string, number>>(
      Object.fromEntries(review.results.map((r) => [r.questionId, r.score])),
    ),
    [feedback, setFeedback] = useState("Reviewed against the rubric.");
  return (
    <section className="panel">
      <div className="panelhead">
        <h2>{review.student_name}</h2>
        <span className="badge open">
          {Math.round(review.confidence * 100)}% confidence
        </span>
      </div>
      <p>{review.quiz_title}</p>
      <div className="review-grid">
        <div>
          {review.questions.map((q) => (
            <div className="question-card" key={q.id}>
              <h3>{q.prompt}</h3>
              <div className="lessonbox">{review.answers[q.id]}</div>
              <div className="muted">
                {review.results.find((r) => r.questionId === q.id)?.reason}
              </div>
              <label className="field" htmlFor={review.id + q.id}>
                Score out of {q.maxPoints}
              </label>
              <input
                className="input-inline"
                type="number"
                id={review.id + q.id}
                min={0}
                max={q.maxPoints}
                step={0.5}
                value={scores[q.id]}
                onChange={(e) =>
                  setScores({ ...scores, [q.id]: Number(e.target.value) })
                }
              />
            </div>
          ))}
        </div>
        <div>
          <h3>Rubric and context</h3>
          {review.questions.map((q) => (
            <div className="rubric" key={q.id}>
              <strong>
                {q.id.toUpperCase()} · {q.maxPoints} points
              </strong>
              <p>{q.rubric}</p>
              <span className="muted">{q.tag}</span>
            </div>
          ))}
          <p className="muted">{review.reason}</p>
          <label className="field" htmlFor={"feedback-" + review.id}>
            Feedback to student
          </label>
          <div className="voice-field">
            <textarea
              id={"feedback-" + review.id}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <SpeechInputButton
              label="Dictate feedback to the student"
              disabled={action.busy}
              onTranscript={(transcript) =>
                setFeedback((currentFeedback) =>
                  appendSpeechTranscript(currentFeedback, transcript),
                )
              }
            />
          </div>
        </div>
      </div>
      {action.error && <ErrorBox message={action.error} />}
      <div className="actions">
        <button
          className="btn primary"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await post("/teacher/reviews/" + review.id, { scores, feedback });
              await refresh();
            }, "Grade reviewed and published.")
          }
        >
          Approve & publish grade
        </button>
      </div>
    </section>
  );
}
export function ReviewQueue() {
  const { data } = useTeacher();
  return (
    <>
      <Title
        label="TEACHER REVIEW"
        heading="Grades for review"
        description="Check uncertain scores and publish feedback to students."
      />
      {data.reviews.length ? (
        data.reviews.map((r) => <ReviewCard key={r.id} review={r} />)
      ) : (
        <section className="panel">
          <Empty>All caught up. No grades are awaiting review.</Empty>
        </section>
      )}
    </>
  );
}
export function ContentStudio() {
  const { data, refresh } = useTeacher(),
    action = useAction();
  const [selected, setSelected] = useState<Intervention | null>(null),
    [content, setContent] = useState("");
  useEffect(() => {
    if (selected) setContent(selected.content);
  }, [selected?.id]);
  async function prepare(id: string) {
    await action.run(async () => {
      const { jobId } = await post<{ jobId: string }>(
        "/teacher/gaps/" + id + "/explainer",
      );
      await waitForJob(jobId);
      await refresh();
    }, "Explanation prepared. Review it below.");
  }
  async function approve() {
    if (!selected) return;
    await action.run(async () => {
      await put("/teacher/interventions/" + selected.id, { content });
      await post("/teacher/interventions/" + selected.id + "/approve");
      setSelected(null);
      await refresh();
    }, "Explanation shared with affected students.");
  }
  return (
    <>
      <Title
        label="CONTENT STUDIO"
        heading="Explanations and follow-ups"
        description="Approve focused explanations and follow-up questions before students receive them."
      />
      {action.error && <ErrorBox message={action.error} />}
      <div className="content-grid">
        <div>
          <section className="panel">
            <h2>Topics to support</h2>
            {data.clusters.map((c) => (
              <div className="gap" key={c.tag}>
                <div>
                  <h3>{c.topic}</h3>
                  <p className="muted">{c.tag}</p>
                  <span className="muted">{c.students} students</span>
                </div>
                <button
                  className="btn"
                  disabled={action.busy}
                  onClick={() => void prepare(c.gapId)}
                >
                  {action.busy ? "Preparing…" : "Prepare explanation"}
                </button>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Prepared explanations</h2>
            {data.interventions.map((i) => (
              <div className="gap" key={i.id}>
                <div>
                  <Badge status={i.status} />
                  <h3>{i.topic}</h3>
                  <span className="muted">
                    {i.targets.length} affected students
                  </span>
                </div>
                <button className="btn" onClick={() => setSelected(i)}>
                  Review
                </button>
              </div>
            ))}
          </section>
        </div>
        <section className="panel">
          {selected ? (
            <>
              <Badge status={selected.status} />
              <h2 style={{ marginTop: 20 }}>{selected.topic}</h2>
              <p>{selected.tag}</p>
              <label className="field" htmlFor="explainer-content">
                Explanation
              </label>
              <div className="voice-field">
                <textarea
                  id="explainer-content"
                  style={{ minHeight: 240 }}
                  readOnly={selected.status !== "draft"}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                {selected.status === "draft" && (
                  <SpeechInputButton
                    label="Dictate changes to the explanation"
                    disabled={action.busy}
                    onTranscript={(transcript) =>
                      setContent((currentContent) =>
                        appendSpeechTranscript(currentContent, transcript),
                      )
                    }
                  />
                )}
              </div>
              <h3 style={{ marginTop: 25 }}>Follow-up question</h3>
              <p>{selected.probe.prompt}</p>
              {selected.probe.options.map((o) => (
                <div className="question" key={o}>
                  {o}
                  {o === selected.probe.correctAnswer && (
                    <span className="badge resolved" style={{ marginLeft: 8 }}>
                      Correct
                    </span>
                  )}
                </div>
              ))}
              <div className="muted">{selected.probe.section}</div>
              {selected.status === "draft" && (
                <div className="actions">
                  <button
                    className="btn primary"
                    disabled={action.busy}
                    onClick={() => void approve()}
                  >
                    Approve & share
                  </button>
                </div>
              )}
            </>
          ) : (
            <Empty>
              Select a prepared explanation to review its content and follow-up
              check.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
export function Materials() {
  const { data, refresh, selectClass } = useTeacher(),
    action = useAction();
  const [name, setName] = useState(data.course.name),
    [syllabus, setSyllabus] = useState(data.course.syllabus),
    [newName, setNewName] = useState(""),
    [email, setEmail] = useState(""),
    [importing, setImporting] = useState(false);
  useEffect(() => {
    setName(data.course.name);
    setSyllabus(data.course.syllabus);
    setImporting(false);
  }, [data.course.id]);
  return (
    <>
      <Title
        label="CLASS SETUP"
        heading="Class materials"
        description="Ground assessments and explanations in your syllabus."
      />
      {action.error && <ErrorBox message={action.error} />}
      <section className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (importing) return;
            void action.run(async () => {
              await put("/teacher/classes/" + data.course.id, {
                name,
                syllabus,
              });
              await refresh();
            }, "Class materials saved.");
          }}
        >
          <label className="field" htmlFor="course-name">
            Course name
          </label>
          <input
            id="course-name"
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="field" htmlFor="syllabus">
            Syllabus
          </label>
          <textarea
            id="syllabus"
            required
            minLength={10}
            maxLength={50000}
            disabled={importing || action.busy}
            style={{ minHeight: 190 }}
            value={syllabus}
            onChange={(e) => setSyllabus(e.target.value)}
          />
          <MaterialFileImport
            key={data.course.id}
            courseId={data.course.id}
            disabled={action.busy}
            onText={setSyllabus}
            onBusyChange={setImporting}
          />
          <p className="muted">
            Material version {data.course.material_version}.
          </p>
          <div className="actions">
            <button className="btn primary" disabled={action.busy || importing}>
              Save materials
            </button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Class roster</h2>
        <form
          className="actions"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await post("/teacher/classes/" + data.course.id + "/enroll", {
                email,
              });
              setEmail("");
              await refresh();
            }, "Student enrolled.");
          }}
        >
          <label className="sr-only" htmlFor="enroll-email">
            Student email
          </label>
          <input
            id="enroll-email"
            type="email"
            required
            placeholder="Existing student account email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <button className="btn" disabled={action.busy}>
            Enroll student
          </button>
        </form>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Open gaps</th>
              </tr>
            </thead>
            <tbody>
              {data.roster.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.email}</td>
                  <td>{s.open_gaps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Create another class</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              const result = await post<{ id: string }>("/teacher/classes", {
                name: newName,
                syllabus,
              });
              selectClass(result.id);
              setNewName("");
            }, "Class created. Enroll students to begin.");
          }}
        >
          <label className="field" htmlFor="new-class">
            Class name
          </label>
          <input
            id="new-class"
            minLength={3}
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <p className="muted">
            Uses the syllabus entered above. No students are enrolled
            automatically.
          </p>
          <button className="btn" disabled={action.busy}>
            Create class
          </button>
        </form>
      </section>
    </>
  );
}
export function AgentActivity() {
  const { data } = useTeacher();
  return (
    <>
      <Title
        label="THE LEARNING LOOP"
        heading="Agent activity"
        description="A durable record of agent work, teacher approvals, and student outcomes."
      />
      <section className="panel">
        <h2>Task queue</h2>
        {data.jobs.length ? (
          data.jobs.map((j) => (
            <div className="gap" key={j.id}>
              <div>
                <h3>
                  {j.kind === "assessment"
                    ? "Assessment draft"
                    : "Targeted explanation"}
                </h3>
                {j.error && <p>{j.error}</p>}
              </div>
              <Badge status={j.status} />
            </div>
          ))
        ) : (
          <Empty>No generation tasks yet.</Empty>
        )}
      </section>
      <section className="panel">
        <h2>Agent audit trail</h2>
        {data.events.map((e) => (
          <details className="event" key={e.id}>
            <summary>
              <span className="badge sent" style={{ marginRight: 10 }}>
                {e.agent}
              </span>
              {e.action}
              <div className="muted" style={{ marginTop: 5 }}>
                {new Date(e.created_at).toLocaleString()}
              </div>
            </summary>
            <pre>{JSON.stringify(e.details, null, 2)}</pre>
            {e.job_id && <div className="muted">Task: {e.job_id}</div>}
          </details>
        ))}
      </section>
    </>
  );
}
