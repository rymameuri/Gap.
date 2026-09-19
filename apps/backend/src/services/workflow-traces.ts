import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";
import type { StudySource } from "../agents/python-service.js";

export type WorkflowKind =
  "study" | "quiz_draft" | "quiz_submission" | "explanation" | "follow_up";
export type WorkflowStatus =
  "running" | "awaiting_review" | "complete" | "failed" | "rejected";
export type StepState = "complete" | "pending" | "failed";

export interface WorkflowStep {
  id: string;
  actor: string;
  action: string;
  detail: string;
  state: StepState;
  sources: StudySource[];
  created_at: string;
}

export interface WorkflowRun {
  id: string;
  kind: WorkflowKind;
  title: string;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
  steps: WorkflowStep[];
}

interface RunRow extends Omit<WorkflowRun, "steps"> {
  class_id: string;
}

interface StepRow extends Omit<WorkflowStep, "sources"> {
  run_id: string;
  sources: string;
}

export function createWorkflowRun(
  store: Store,
  input: {
    id?: string;
    classId: string;
    kind: WorkflowKind;
    title: string;
    status?: WorkflowStatus;
    studentId?: string;
    jobId?: string;
    entityId?: string;
    conversationId?: string;
  },
): string {
  const id = input.id ?? randomUUID();
  const timestamp = new Date().toISOString();
  store.run(
    "INSERT INTO workflow_runs(id,class_id,kind,title,status,student_id,job_id,entity_id,conversation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      input.classId,
      input.kind,
      input.title,
      input.status ?? "running",
      input.studentId ?? null,
      input.jobId ?? null,
      input.entityId ?? null,
      input.conversationId ?? null,
      timestamp,
      timestamp,
    ],
  );
  return id;
}

export function appendWorkflowStep(
  store: Store,
  runId: string,
  step: {
    actor: string;
    action: string;
    detail: string;
    state?: StepState;
    sources?: readonly StudySource[];
  },
  nextStatus?: WorkflowStatus,
): void {
  const position =
    store.one<{ position: number }>(
      "SELECT COALESCE(MAX(position),0)+1 AS position FROM workflow_steps WHERE run_id=?",
      [runId],
    )?.position ?? 1;
  const timestamp = new Date().toISOString();
  store.run(
    "INSERT INTO workflow_steps(id,run_id,position,actor,action,detail,state,sources,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [
      randomUUID(),
      runId,
      position,
      step.actor,
      step.action,
      step.detail,
      step.state ?? "complete",
      JSON.stringify((step.sources ?? []).slice(0, 8)),
      timestamp,
    ],
  );
  if (nextStatus)
    store.run("UPDATE workflow_runs SET status=?,updated_at=? WHERE id=?", [
      nextStatus,
      timestamp,
      runId,
    ]);
}

export function setWorkflowEntity(
  store: Store,
  runId: string,
  entityId: string,
  title: string,
): void {
  store.run("UPDATE workflow_runs SET entity_id=?,title=? WHERE id=?", [
    entityId,
    title,
    runId,
  ]);
}

export function workflowRunForEntity(
  store: Store,
  kind: WorkflowKind,
  entityId: string,
): string | undefined {
  return store.one<{ id: string }>(
    "SELECT id FROM workflow_runs WHERE kind=? AND entity_id=? ORDER BY created_at DESC LIMIT 1",
    [kind, entityId],
  )?.id;
}

export function recentWorkflowRuns(
  store: Store,
  classId: string,
  limit = 12,
): WorkflowRun[] {
  const runs = store.all<RunRow>(
    "SELECT id,class_id,kind,title,status,created_at,updated_at FROM workflow_runs WHERE class_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?",
    [classId, limit],
  );
  if (runs.length === 0) return [];
  const ids = runs.map((run) => run.id);
  const placeholders = ids.map(() => "?").join(",");
  const steps = store.all<StepRow>(
    `SELECT id,run_id,actor,action,detail,state,sources,created_at FROM workflow_steps WHERE run_id IN (${placeholders}) ORDER BY position`,
    ids,
  );
  const byRun = new Map<string, WorkflowStep[]>();
  for (const step of steps) {
    const list = byRun.get(step.run_id) ?? [];
    list.push({
      id: step.id,
      actor: step.actor,
      action: step.action,
      detail: step.detail,
      state: step.state,
      sources: JSON.parse(step.sources) as StudySource[],
      created_at: step.created_at,
    });
    byRun.set(step.run_id, list);
  }
  return runs.map((run) => ({
    id: run.id,
    kind: run.kind,
    title: run.title,
    status: run.status,
    created_at: run.created_at,
    updated_at: run.updated_at,
    steps: byRun.get(run.id) ?? [],
  }));
}
