import { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileQuestion,
  MessageCircle,
  Target,
} from "lucide-react";
import { ClassLink as Link } from "../../components/ClassLink";
import type { WorkflowRun } from "../../services/types";

type Filter = "all" | "study" | "assessment" | "teaching";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "study", label: "Study Assistant" },
  { id: "assessment", label: "Assessments" },
  { id: "teaching", label: "Teaching" },
];

const kindLabels: Record<WorkflowRun["kind"], string> = {
  study: "Study Assistant",
  quiz_draft: "Quiz draft",
  quiz_submission: "Quiz grading",
  explanation: "Targeted explanation",
  follow_up: "Follow-up check",
};

const statusLabels: Record<WorkflowRun["status"], string> = {
  running: "Running",
  awaiting_review: "Awaiting review",
  complete: "Complete",
  failed: "Failed",
  rejected: "Rejected",
};

function matches(run: WorkflowRun, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "study") return run.kind === "study";
  if (filter === "assessment")
    return run.kind === "quiz_draft" || run.kind === "quiz_submission";
  return run.kind === "explanation" || run.kind === "follow_up";
}

function SourceList({
  sources,
}: {
  sources: WorkflowRun["steps"][number]["sources"];
}) {
  if (sources.length === 0) return null;
  return (
    <ul className="workflow-sources" aria-label="Course sources used">
      {sources.map((source, index) => (
        <li key={`${source.documentId}-${source.chunkId ?? ""}-${index}`}>
          <BookOpen size={13} aria-hidden="true" />
          <span>
            {source.title}
            {source.page !== null && `, page ${source.page}`}
            {source.slide !== null && `, slide ${source.slide}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function WorkflowTimeline({ runs }: { runs: WorkflowRun[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = runs.filter((run) => matches(run, filter));
  return (
    <section className="workflow-board" aria-labelledby="workflow-heading">
      <div className="workflow-heading">
        <div>
          <h2 id="workflow-heading">Workflow runs</h2>
          <p>Observed handoffs, source checks, and teacher decisions.</p>
        </div>
        <span>{runs.length} recent</span>
      </div>
      <div
        className="workflow-filters"
        role="group"
        aria-label="Filter workflows"
      >
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="workflow-empty">
          <p>
            {runs.length
              ? "No recent runs match this filter."
              : "New assistant answers, quiz drafts, grades, and follow-ups will appear here."}
          </p>
          {runs.length === 0 && (
            <Link className="btn small" to="/teacher/assessments">
              Create quiz
            </Link>
          )}
        </div>
      ) : (
        <div className="workflow-runs">
          {visible.map((run, index) => {
            const Icon =
              run.kind === "study"
                ? MessageCircle
                : run.kind === "quiz_draft"
                  ? FileQuestion
                  : run.kind === "quiz_submission"
                    ? Check
                    : Target;
            return (
              <details className="workflow-run" key={run.id} open={index === 0}>
                <summary>
                  <span className="workflow-kind-icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span className="workflow-run-name">
                    {kindLabels[run.kind] !== run.title && (
                      <small>{kindLabels[run.kind]}</small>
                    )}
                    <strong>{run.title}</strong>
                  </span>
                  <time dateTime={run.created_at}>
                    {new Date(run.created_at).toLocaleString()}
                  </time>
                  <span className={`workflow-status ${run.status}`}>
                    {statusLabels[run.status]}
                  </span>
                  <ChevronDown
                    size={17}
                    className="workflow-chevron"
                    aria-hidden="true"
                  />
                </summary>
                <ol className="workflow-steps">
                  {run.steps.map((step) => {
                    const StateIcon =
                      step.state === "pending"
                        ? Clock3
                        : step.state === "failed"
                          ? CircleAlert
                          : Check;
                    return (
                      <li
                        className={`workflow-step ${step.state}`}
                        key={step.id}
                      >
                        <span className="workflow-step-icon">
                          <StateIcon size={13} aria-hidden="true" />
                        </span>
                        <div>
                          <span className="workflow-actor">{step.actor}</span>
                          <strong>{step.action}</strong>
                          <p>{step.detail}</p>
                          <SourceList sources={step.sources} />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </details>
            );
          })}
        </div>
      )}
      <p className="workflow-note">
        This timeline records system actions and evidence, not private model
        reasoning.
      </p>
    </section>
  );
}
