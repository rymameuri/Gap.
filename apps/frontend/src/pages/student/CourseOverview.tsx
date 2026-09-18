import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  MessageSquare,
  NotebookPen,
  Play,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCourse } from "../../layouts/StudentLayout";
import { coursePath, courseTopics, topicEvidence } from "./course-model";
import { useStudyDrafts } from "./useStudyDrafts";
import {
  ActionLink,
  PageHeading,
  SectionHeading,
} from "./components/StudentUI";

export function CourseOverview() {
  const data = useCourse();
  const { course, gaps, quizzes, grades } = data;
  const { drafts } = useStudyDrafts(course.id);
  const latest = drafts[0];
  const ready = gaps.find((gap) => gap.content && gap.status !== "resolved");
  const topics = courseTopics(gaps, quizzes);
  const needsPractice = topics.filter(
    (topic) => topicEvidence(topic, data).status === "practice",
  );
  const available = quizzes.filter((quiz) => !quiz.submission);
  const pending = quizzes.filter(
    (quiz) => quiz.submission?.status === "pending",
  );
  return (
    <>
      <PageHeading
        title={course.name}
        description="A little progress, one topic at a time."
      />
      <section className="s-continue">
        <div className="s-continue-icon">
          <Play size={22} aria-hidden="true" />
        </div>
        <div>
          <span className="s-kicker">
            {latest
              ? "Pick up where you left off"
              : ready
                ? "Ready for a closer look"
                : "Your next study session"}
          </span>
          <h2>
            {latest
              ? latest.text
              : ready
                ? ready.topic
                : "Choose something to work on"}
          </h2>
          <p>
            {latest
              ? "Your saved question is waiting in Study Assistant."
              : ready
                ? "Your instructor shared an explanation and a follow-up question."
                : "Review your course materials or prepare a question for your next session."}
          </p>
        </div>
        <Link
          className="s-button s-primary"
          to={
            latest
              ? coursePath(course.id, `assistant?draft=${latest.id}`)
              : ready
                ? coursePath(course.id, `lessons/${ready.id}`)
                : coursePath(course.id, "assistant")
          }
        >
          {latest
            ? "Continue draft"
            : ready
              ? "Review explanation"
              : "Open Study Assistant"}
          <ArrowRight size={16} />
        </Link>
      </section>
      <section className="s-section">
        <SectionHeading title="What would you like to do?" />
        <div className="s-actions-grid">
          <ActionLink
            icon={MessageSquare}
            title="Ask a question"
            description="Bring an idea you want to understand."
            to={coursePath(course.id, "assistant?mode=question")}
          />
          <ActionLink
            icon={NotebookPen}
            title="Study a topic"
            description="Work through one concept at a time."
            to={coursePath(course.id, "assistant?mode=topic")}
          />
          <ActionLink
            icon={ClipboardCheck}
            title="Test yourself"
            description={
              available.length
                ? `${available.length} quiz${available.length === 1 ? "" : "zes"} ready for you.`
                : "Revisit a topic or check quiz feedback."
            }
            to={coursePath(course.id, "practice")}
          />
          <ActionLink
            icon={BookOpen}
            title="Explore materials"
            description="Your syllabus and instructor explanations."
            to={coursePath(course.id, "materials")}
          />
        </div>
      </section>
      <div className="s-overview-columns">
        <section className="s-section">
          <SectionHeading title="From your instructor" />
          <div className="s-update-list">
            {gaps
              .filter((gap) => gap.content)
              .map((gap) => (
                <Link
                  key={gap.id}
                  className="s-update"
                  to={coursePath(course.id, `lessons/${gap.id}`)}
                >
                  <span className="s-update-icon">
                    <FileText size={19} />
                  </span>
                  <div>
                    <strong>{gap.topic}</strong>
                    <span>Instructor-approved explanation</span>
                  </div>
                  <ArrowRight size={17} />
                </Link>
              ))}
            {pending.map((quiz) => (
              <Link
                key={quiz.id}
                className="s-update"
                to={coursePath(course.id, `quizzes/${quiz.id}`)}
              >
                <span className="s-update-icon amber">
                  <ClipboardCheck size={19} />
                </span>
                <div>
                  <strong>{quiz.title}</strong>
                  <span>Submitted · Feedback awaiting review</span>
                </div>
                <ArrowRight size={17} />
              </Link>
            ))}
            {grades.slice(0, 2).map((grade) => (
              <Link
                key={grade.id}
                className="s-update"
                to={coursePath(course.id, `quizzes/${grade.quiz_id}`)}
              >
                <span className="s-update-icon green">
                  <CheckCircle2 size={19} />
                </span>
                <div>
                  <strong>{grade.title}</strong>
                  <span>
                    Feedback available · {grade.score} / {grade.total}
                  </span>
                </div>
                <ArrowRight size={17} />
              </Link>
            ))}
            {!gaps.some((gap) => gap.content) &&
              !pending.length &&
              !grades.length && (
                <p className="s-muted">No new updates from your instructor.</p>
              )}
          </div>
        </section>
        <section className="s-section">
          <SectionHeading title="Topics to revisit">
            <Link
              className="s-text-link"
              to={coursePath(course.id, "progress")}
            >
              My progress <ArrowRight size={15} />
            </Link>
          </SectionHeading>
          {needsPractice.length ? (
            <ul className="s-topic-list">
              {needsPractice.map((topic) => (
                <li key={topic}>
                  <span className="s-topic-dot" />
                  <span>{topic}</span>
                  <Link
                    to={coursePath(
                      course.id,
                      `practice?topic=${encodeURIComponent(topic)}`,
                    )}
                    aria-label={`Practice ${topic}`}
                  >
                    Practice <ArrowRight size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="s-muted">
              No topics currently marked for more practice.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
