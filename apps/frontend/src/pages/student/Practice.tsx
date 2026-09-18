import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ClipboardCheck, BookOpen, Clock3 } from "lucide-react";
import { useCourse } from "../../layouts/StudentLayout";
import { coursePath, courseTopics } from "./course-model";
import { EmptyState, PageHeading } from "./components/StudentUI";

export function Practice() {
  const { course, quizzes, gaps } = useCourse();
  const [params, setParams] = useSearchParams();
  const topic = params.get("topic") || "";
  const [length, setLength] = useState("");
  const [view, setView] = useState("quizzes");
  const topics = courseTopics(gaps, quizzes);
  const filtered = quizzes.filter(
    (quiz) =>
      (!topic || quiz.questions.some((question) => question.topic === topic)) &&
      (!length || quiz.questions.length === Number(length)),
  );
  const reviews = gaps.filter(
    (gap) => gap.content && (!topic || gap.topic === topic),
  );
  return (
    <>
      <PageHeading
        title="Practice & Quizzes"
        description="Work through an explanation, then check what you understand."
      />
      <div
        className="s-tab-bar"
        role="tablist"
        aria-label="Practice activities"
      >
        {[
          ["quizzes", "Quizzes"],
          ["practice", "Guided practice"],
        ].map(([id, label]) => (
          <button
            key={id}
            id={`activity-tab-${id}`}
            role="tab"
            aria-selected={view === id}
            aria-controls="activity-list"
            onClick={() => setView(id)}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                const next = view === "quizzes" ? "practice" : "quizzes";
                setView(next);
                document.getElementById(`activity-tab-${next}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="s-filters">
        <div>
          <label htmlFor="practice-topic">Topic</label>
          <select
            id="practice-topic"
            value={topic}
            onChange={(event) =>
              setParams(event.target.value ? { topic: event.target.value } : {})
            }
          >
            <option value="">All topics</option>
            {topics.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        {view === "quizzes" && (
          <div>
            <label htmlFor="quiz-length">Quiz length</label>
            <select
              id="quiz-length"
              value={length}
              onChange={(event) => setLength(event.target.value)}
            >
              <option value="">Any length</option>
              {[...new Set(quizzes.map((quiz) => quiz.questions.length))]
                .sort((a, b) => a - b)
                .map((count) => (
                  <option key={count} value={count}>
                    {count} question{count === 1 ? "" : "s"}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>
      <section
        id="activity-list"
        role="tabpanel"
        aria-labelledby={`activity-tab-${view}`}
      >
        {view === "quizzes" ? (
          filtered.length ? (
            <div className="s-activity-list">
              {filtered.map((quiz) => (
                <article className="s-quiz-item" key={quiz.id}>
                  <span className="s-activity-symbol">
                    <ClipboardCheck size={23} />
                  </span>
                  <div>
                    <span className="s-kicker">
                      {quiz.submission
                        ? quiz.submission.status === "pending"
                          ? "Awaiting instructor review"
                          : "Completed"
                        : "Ready to take"}
                    </span>
                    <h2>{quiz.title}</h2>
                    <p>
                      {quiz.questions.length} questions ·{" "}
                      {quiz.questions.reduce(
                        (total, question) => total + question.maxPoints,
                        0,
                      )}{" "}
                      points
                    </p>
                  </div>
                  <Link
                    className={`s-button ${quiz.submission ? "" : "s-primary"}`}
                    to={coursePath(course.id, `quizzes/${quiz.id}`)}
                  >
                    {quiz.submission ? "View submission" : "Take quiz"}
                    <ArrowRight size={16} />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="No quizzes available for this selection"
            >
              <p>Your instructor's published quizzes will appear here.</p>
              {topic && (
                <Link
                  className="s-text-link"
                  to={coursePath(course.id, "assistant?mode=topic")}
                >
                  Prepare a study question <ArrowRight size={16} />
                </Link>
              )}
            </EmptyState>
          )
        ) : reviews.length ? (
          <div className="s-activity-list">
            {reviews.map((gap) => (
              <article className="s-quiz-item" key={gap.id}>
                <span className="s-activity-symbol green">
                  <BookOpen size={23} />
                </span>
                <div>
                  <span className="s-kicker">Instructor-approved</span>
                  <h2>{gap.topic}</h2>
                  <p>Explanation + 1 follow-up question</p>
                </div>
                <Link
                  className="s-button"
                  to={coursePath(course.id, `lessons/${gap.id}`)}
                >
                  Review & practice <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No guided practice for this topic yet"
          >
            <p>
              You can review the syllabus while your instructor prepares more
              materials.
            </p>
            <Link
              className="s-text-link"
              to={coursePath(course.id, "materials")}
            >
              Explore materials <ArrowRight size={16} />
            </Link>
          </EmptyState>
        )}
      </section>
      <div className="s-availability-note">
        <Clock3 size={17} />
        <span>
          Personalized quiz generation is not available yet. These activities
          are shared by your instructor.
        </span>
      </div>
    </>
  );
}
