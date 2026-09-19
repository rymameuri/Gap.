import { useState } from "react";
import { ArrowRight, BookOpen, Check, CircleAlert, Clock3 } from "lucide-react";
import { ClassLink as Link } from "../../components/ClassLink";
import type { WorkflowRun } from "../../services/types";

type Filter = "all" | "study" | "assessment" | "teaching";
type Pathway = Exclude<Filter, "all">;

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "study", label: "Study Assistant" },
  { id: "assessment", label: "Assessments" },
  { id: "teaching", label: "Targeted support" },
];

const pathways: {
  id: Pathway;
  label: string;
  steps: { actor: string; action: string }[];
}[] = [
  {
    id: "study",
    label: "Study answer",
    steps: [
      { actor: "Student", action: "Asks a question" },
      { actor: "API", action: "Checks course access" },
      { actor: "Orchestrator", action: "Routes to Study" },
      { actor: "Retriever", action: "Finds syllabus sources" },
      { actor: "Reviewer", action: "Releases or holds answer" },
    ],
  },
  {
    id: "assessment",
    label: "Assessment",
    steps: [
      { actor: "Teacher", action: "Requests a draft" },
      { actor: "Assessment", action: "Drafts questions" },
      { actor: "Teacher", action: "Reviews and publishes" },
      { actor: "Student", action: "Submits answers" },
      { actor: "Assessment", action: "Grades or flags" },
      { actor: "Teacher", action: "Checks flags if needed" },
      { actor: "Diagnostic", action: "Updates learning gaps" },
    ],
  },
  {
    id: "teaching",
    label: "Targeted support",
    steps: [
      { actor: "Diagnostic", action: "Surfaces a gap" },
      { actor: "Content", action: "Drafts an explanation" },
      { actor: "Teacher", action: "Approves and shares" },
      { actor: "Student", action: "Answers follow-up" },
      { actor: "Diagnostic", action: "Rechecks the gap" },
    ],
  },
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

function reviewPath(kind: WorkflowRun["kind"]): string {
  if (kind === "quiz_draft") return "/teacher/assessments";
  if (kind === "explanation") return "/teacher/content";
  return "/teacher/review";
}

function reviewLabel(kind: WorkflowRun["kind"]): string {
  if (kind === "quiz_draft") return "Review quiz draft";
  if (kind === "explanation") return "Review explanation";
  return "Open review queue";
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
          <BookOpen size={14} aria-hidden="true" />
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

function PathwayMap() {
  const [selected, setSelected] = useState<Pathway>("study");
  const pathway = pathways.find((item) => item.id === selected) ?? pathways[0];
  return (
    <section className="workflow-map" aria-labelledby="workflow-map-heading">
      <div className="workflow-heading">
        <div>
          <h2 id="workflow-map-heading">How work moves</h2>
          <p>Typical handoffs across the student and instructor experience.</p>
        </div>
        <span>Workflow model</span>
      </div>
      <div className="workflow-filters" role="group" aria-label="Workflow path">
        {pathways.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            className={selected === item.id ? "active" : ""}
            onClick={() => setSelected(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="workflow-flow-scroll">
        <ol
          className="workflow-flow workflow-model-flow"
          aria-label={pathway.label}
        >
          {pathway.steps.map((step, index) => (
            <li key={`${step.actor}-${index}`}>
              <div className="workflow-node">
                <span className="workflow-node-number">{index + 1}</span>
                <small>{step.actor}</small>
                <strong>{step.action}</strong>
              </div>
              {index < pathway.steps.length - 1 && (
                <ArrowRight
                  className="workflow-arrow"
                  size={17}
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function WorkflowTimeline({ runs }: { runs: WorkflowRun[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [runId, setRunId] = useState<string | null>(null);
  const [stepId, setStepId] = useState<string | null>(null);
  const visible = runs.filter((run) => matches(run, filter));
  const selectedRun = visible.find((run) => run.id === runId) ?? visible[0];
  const selectedStep =
    selectedRun?.steps.find((step) => step.id === stepId) ??
    selectedRun?.steps.at(-1);
  const selectedIndex = selectedRun?.steps.findIndex(
    (step) => step.id === selectedStep?.id,
  );

  return (
    <div className="workflow-board">
      <PathwayMap />
      <section
        className="workflow-records"
        aria-labelledby="workflow-records-heading"
      >
        <div className="workflow-heading">
          <div>
            <h2 id="workflow-records-heading">Recorded runs</h2>
            <p>Steps observed in this class, newest first.</p>
          </div>
          <span>{runs.length} recent</span>
        </div>
        <div
          className="workflow-filters"
          role="group"
          aria-label="Filter recorded runs"
        >
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => {
                setFilter(item.id);
                setRunId(null);
                setStepId(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {!selectedRun ? (
          <div className="workflow-empty">
            <p>
              {runs.length
                ? "No recorded runs in this category."
                : "No runs recorded yet. New assistant answers, quiz drafts, grades, and follow-ups will appear here."}
            </p>
            {runs.length === 0 && (
              <Link className="btn small" to="/teacher/assessments">
                Draft a quiz
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="workflow-run-toolbar">
              <div>
                <label htmlFor="workflow-run-select">Run</label>
                <select
                  id="workflow-run-select"
                  value={selectedRun.id}
                  onChange={(event) => {
                    setRunId(event.target.value);
                    setStepId(null);
                  }}
                >
                  {visible.map((run) => (
                    <option key={run.id} value={run.id}>
                      {kindLabels[run.kind]}: {run.title} -{" "}
                      {new Date(run.created_at).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <span className={`workflow-status ${selectedRun.status}`}>
                {statusLabels[selectedRun.status]}
              </span>
            </div>
            <div className="workflow-flow-scroll">
              <ol
                className="workflow-flow workflow-observed-flow"
                aria-label="Recorded steps"
              >
                {selectedRun.steps.map((step, index) => {
                  const StateIcon =
                    step.state === "pending"
                      ? Clock3
                      : step.state === "failed"
                        ? CircleAlert
                        : Check;
                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        className={`workflow-node ${step.id === selectedStep?.id ? "active" : ""} ${step.state}`}
                        aria-pressed={step.id === selectedStep?.id}
                        onClick={() => setStepId(step.id)}
                      >
                        <span className="workflow-node-number">
                          {index + 1}
                        </span>
                        <small>{step.actor}</small>
                        <strong>{step.action}</strong>
                        <StateIcon
                          size={15}
                          className="workflow-node-state"
                          aria-hidden="true"
                        />
                      </button>
                      {index < selectedRun.steps.length - 1 && (
                        <ArrowRight
                          className="workflow-arrow"
                          size={17}
                          aria-hidden="true"
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
            {selectedStep && (
              <div className="workflow-step-detail" aria-live="polite">
                <span>
                  Step {(selectedIndex ?? 0) + 1} of {selectedRun.steps.length}{" "}
                  / {selectedStep.actor}
                </span>
                <h3>{selectedStep.action}</h3>
                <p>{selectedStep.detail}</p>
                <SourceList sources={selectedStep.sources} />
              </div>
            )}
            {selectedRun.status === "awaiting_review" && (
              <Link
                className="workflow-review-link"
                to={reviewPath(selectedRun.kind)}
              >
                {reviewLabel(selectedRun.kind)} <ArrowRight size={15} aria-hidden="true" />
              </Link>
            )}
          </>
        )}
      </section>
      <p className="workflow-note">
        Recorded steps show system actions and evidence, not private model
        reasoning.
      </p>
    </div>
  );
}
