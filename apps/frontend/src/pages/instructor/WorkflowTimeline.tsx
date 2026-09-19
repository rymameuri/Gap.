import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { ClassLink as Link } from "../../components/ClassLink";
import type { WorkflowRun } from "../../services/types";
import {
  WorkflowDiagram,
  type DiagramEdge,
  type DiagramNode,
} from "./WorkflowDiagram";
import { pathways, type PathwayId } from "./workflow-pathways";

type Filter = "all" | PathwayId;
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "study", label: "Study Assistant" },
  { id: "assessment", label: "Assessments" },
  { id: "teaching", label: "Targeted support" },
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
  const [selected, setSelected] = useState<PathwayId>("study");
  const [nodeId, setNodeId] = useState("question");
  const pathway = pathways.find((item) => item.id === selected) ?? pathways[0];
  const node =
    pathway.nodes.find((item) => item.id === nodeId) ?? pathway.nodes[0];
  return (
    <section className="workflow-map" aria-labelledby="workflow-map-heading">
      <div className="workflow-heading">
        <div>
          <h2 id="workflow-map-heading">Workflow map</h2>
          <p>Course context, agent handoffs, and instructor decisions.</p>
        </div>
        <span>Process overview</span>
      </div>
      <div className="workflow-filters" role="group" aria-label="Workflow path">
        {pathways.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            className={selected === item.id ? "active" : ""}
            onClick={() => {
              setSelected(item.id);
              setNodeId(item.nodes[0].id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <WorkflowDiagram
        nodes={pathway.nodes}
        edges={pathway.edges}
        selectedId={node.id}
        onSelect={setNodeId}
        label={`${pathway.label} workflow map`}
      />
      <div className="workflow-step-detail" aria-live="polite">
        <span>{node.actor}</span>
        <h3>{node.label}</h3>
        <p>{node.detail}</p>
      </div>
    </section>
  );
}

function RecordedRun({ run }: { run: WorkflowRun }) {
  const [stepId, setStepId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const index = Math.max(
    0,
    stepId
      ? run.steps.findIndex((step) => step.id === stepId)
      : run.steps.length - 1,
  );
  const step = run.steps[index];

  useEffect(() => {
    if (!replaying) return;
    const timer = window.setTimeout(() => {
      if (index >= run.steps.length - 1) setReplaying(false);
      else setStepId(run.steps[index + 1].id);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [replaying, index, run.steps]);

  const nodes: DiagramNode[] = run.steps.map((item, i) => {
    const row = Math.floor(i / 3);
    return {
      id: item.id,
      actor: item.actor,
      label: item.action,
      detail: item.detail,
      column: row % 2 === 0 ? i % 3 : 2 - (i % 3),
      row,
      state: item.state,
      type: /teacher|student/i.test(item.actor)
        ? "person"
        : /review|express/i.test(item.actor)
          ? "decision"
          : /retriev/i.test(item.actor)
            ? "source"
            : "agent",
    };
  });
  const edges: DiagramEdge[] = nodes.slice(1).map((node, i) => {
    const from = nodes[i];
    if (from.row !== node.row)
      return { from: from.id, to: node.id, fromSide: "bottom", toSide: "top" };
    return {
      from: from.id,
      to: node.id,
      fromSide: from.column < node.column ? "right" : "left",
      toSide: from.column < node.column ? "left" : "right",
    };
  });
  function select(id: string) {
    setReplaying(false);
    setStepId(id);
  }
  if (!step)
    return (
      <p className="workflow-empty">Waiting for the first recorded step.</p>
    );

  return (
    <>
      <div className="workflow-playback">
        <div
          className="workflow-playback-controls"
          role="group"
          aria-label="Replay recorded steps"
        >
          <button
            type="button"
            className="btn small workflow-play-toggle"
            disabled={run.steps.length < 2}
            onClick={() => {
              if (replaying) setReplaying(false);
              else {
                if (index === run.steps.length - 1) setStepId(run.steps[0].id);
                setReplaying(true);
              }
            }}
          >
            {replaying ? <Pause size={15} /> : <Play size={15} />}
            {replaying ? "Pause" : "Replay"}
          </button>
          <button
            type="button"
            title="First recorded step"
            aria-label="First recorded step"
            disabled={index === 0}
            onClick={() => select(run.steps[0].id)}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            title="Previous recorded step"
            aria-label="Previous recorded step"
            disabled={index === 0}
            onClick={() => select(run.steps[index - 1].id)}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            title="Next recorded step"
            aria-label="Next recorded step"
            disabled={index === run.steps.length - 1}
            onClick={() => select(run.steps[index + 1].id)}
          >
            <ArrowRight size={15} />
          </button>
          <span>
            {replaying ? "Replaying" : "Step"} {index + 1} / {run.steps.length}
          </span>
        </div>
        <div className="workflow-legend" aria-label="Step status legend">
          <span className="complete">Complete</span>
          <span className="pending">Pending</span>
          <span className="failed">Failed</span>
        </div>
      </div>
      <WorkflowDiagram
        nodes={nodes}
        edges={edges}
        selectedId={step.id}
        onSelect={select}
        label="Recorded workflow steps"
        recorded
        replaying={replaying}
      />
      <div className="workflow-step-detail" aria-live="polite">
        <span>
          Step {index + 1} of {run.steps.length} / {step.actor} / {step.state}
        </span>
        <h3>{step.action}</h3>
        <p>{step.detail}</p>
        <SourceList sources={step.sources} />
      </div>
      {run.status === "awaiting_review" && (
        <Link
          className="workflow-review-link"
          to={
            run.kind === "quiz_draft"
              ? "/teacher/assessments"
              : run.kind === "explanation"
                ? "/teacher/content"
                : "/teacher/review"
          }
        >
          {run.kind === "quiz_draft"
            ? "Review quiz draft"
            : run.kind === "explanation"
              ? "Review explanation"
              : "Open review queue"}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </>
  );
}

export function WorkflowTimeline({ runs }: { runs: WorkflowRun[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [runId, setRunId] = useState<string | null>(null);
  const visible = runs.filter((run) => matches(run, filter));
  const selectedRun = visible.find((run) => run.id === runId) ?? visible[0];
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
            <p>Actual steps observed in this class, newest first.</p>
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
                  onChange={(event) => setRunId(event.target.value)}
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
            <RecordedRun key={selectedRun.id} run={selectedRun} />
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
