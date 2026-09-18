import { ArrowRight, ChartNoAxesCombined } from "lucide-react";
import { Link } from "react-router-dom";
import { useCourse } from "../../layouts/StudentLayout";
import {
  coursePath,
  courseTopics,
  evidenceLabels,
  topicEvidence,
  type EvidenceStatus,
} from "./course-model";
import {
  EmptyState,
  EvidenceBadge,
  PageHeading,
  SectionHeading,
} from "./components/StudentUI";

export function Progress() {
  const data = useCourse();
  const { course, gaps, quizzes, progress } = data;
  const topics = courseTopics(gaps, quizzes);
  const evidence = topics.map((topic) => ({
    topic,
    ...topicEvidence(topic, data),
  }));
  return (
    <>
      <PageHeading
        title="My progress"
        description="What your work shows so far, and what to try next."
      />
      <div className="s-progress-summary">
        {(Object.keys(evidenceLabels) as EvidenceStatus[]).map((status) => (
          <div key={status}>
            <strong>
              {evidence.filter((entry) => entry.status === status).length}
            </strong>
            <EvidenceBadge status={status} />
          </div>
        ))}
      </div>
      <section className="s-section">
        <SectionHeading title="By topic" />
        <p className="s-muted">
          Asking a question does not lower your progress. Supported practice and
          independent quiz answers count separately.
        </p>
        {evidence.length ? (
          <div className="s-progress-topics">
            {evidence.map((entry) => {
              const ready = gaps.find(
                (gap) => gap.topic === entry.topic && gap.content,
              );
              const destination =
                entry.status === "practice" && ready
                  ? `lessons/${ready.id}`
                  : `practice?topic=${encodeURIComponent(entry.topic)}`;
              return (
                <article key={entry.topic}>
                  <div>
                    <h3>{entry.topic}</h3>
                    <p>{entry.detail}</p>
                  </div>
                  <EvidenceBadge status={entry.status} />
                  <Link
                    className="s-text-link"
                    to={coursePath(course.id, destination)}
                  >
                    {entry.status === "practice" && ready
                      ? "Review explanation"
                      : "Find practice"}
                    <ArrowRight size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={ChartNoAxesCombined} title="No topic results yet">
            <p>Your course activities and their results will appear here.</p>
          </EmptyState>
        )}
      </section>
      <section className="s-section">
        <SectionHeading title="Recent practice" />
        {progress.length ? (
          <ol className="s-history">
            {progress.slice(0, 10).map((entry) => (
              <li key={entry.id}>
                <span
                  className={`s-history-dot ${entry.correct ? "success" : ""}`}
                />
                <div>
                  <strong>{entry.topic}</strong>
                  <span>
                    {entry.correct
                      ? "Correct follow-up after an explanation"
                      : "Follow-up needs another look"}
                  </span>
                </div>
                <time dateTime={entry.created_at}>
                  {new Date(entry.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="s-muted">
            You haven't completed any follow-up practice in this course yet.
          </p>
        )}
      </section>
    </>
  );
}
