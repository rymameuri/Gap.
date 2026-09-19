import { randomUUID } from "node:crypto";
import type { Store } from "./db.js";
import type { Logger } from "./logger.js";
import { draftAssessment } from "./agents/assessment.js";
import { prepareContent } from "./agents/content.js";
import { engineName } from "./agents/provider.js";
import {
  parseAssessmentPayload,
  parseContentPayload,
  type JobResult,
} from "./json-columns.js";
import type { ClassRow, JobKind, JobRow } from "./rows.js";
import { findClass } from "./repositories/classes.js";
import { insertQuiz } from "./repositories/assessments.js";
import {
  findGapInClass,
  insertIntervention,
  openGapIdsForTag,
} from "./repositories/learning.js";
import {
  insertJob,
  markJobFailed,
  markJobRunning,
  markJobSucceeded,
  nextQueuedJob,
  requeueRunningJobs,
} from "./repositories/activity.js";
import {
  appendWorkflowStep,
  createWorkflowRun,
  setWorkflowEntity,
} from "./services/workflow-traces.js";

const now = (): string => new Date().toISOString();

/**
 * Runs agent generation tasks one at a time. Jobs are stored before they run,
 * so tasks interrupted by a restart run again on the next start.
 */
export class AgentQueue {
  private active = false;

  constructor(
    private readonly store: Store,
    private readonly logger: Logger,
  ) {
    requeueRunningJobs(store);
    this.startDrain();
  }

  /** Stores a job and starts it when the queue is idle. Returns the job id. */
  enqueue(
    classId: string,
    actorId: string,
    kind: JobKind,
    payload: unknown,
  ): string {
    const id = randomUUID();
    this.store.transaction(() => {
      insertJob(this.store, {
        id,
        class_id: classId,
        actor_id: actorId,
        kind,
        payload: JSON.stringify(payload),
        now: now(),
      });
      createWorkflowRun(this.store, {
        id,
        classId,
        kind: kind === "assessment" ? "quiz_draft" : "explanation",
        title: kind === "assessment" ? "Quiz draft" : "Targeted explanation",
        jobId: id,
      });
      appendWorkflowStep(this.store, id, {
        actor: "Teacher",
        action: "Requested a draft",
        detail: "A generation task was added to the class queue.",
      });
    });
    this.startDrain();
    return id;
  }

  // drain() handles task failures itself; this catches failures of the queue
  // bookkeeping, such as a database write error, which would otherwise be an
  // unhandled rejection.
  private startDrain(): void {
    this.drain().catch((error: unknown) => {
      this.logger.error({ err: error }, "agent queue stopped");
    });
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      for (;;) {
        const job = nextQueuedJob(this.store);
        if (!job) break;
        markJobRunning(this.store, job.id, now());
        await this.runJob(job);
      }
    } finally {
      this.active = false;
    }
  }

  private async runJob(job: JobRow): Promise<void> {
    try {
      const course = findClass(this.store, job.class_id);
      if (!course) throw new Error("Class is unavailable");
      appendWorkflowStep(this.store, job.id, {
        actor: job.kind === "assessment" ? "Assessment" : "Content",
        action: "Started draft generation",
        detail: `Syllabus version ${String(course.material_version)} checked. Generation mode: ${engineName() === "local" ? "local teaching bank" : "live AI"}. Uploaded course files are not indexed.`,
      });
      // Each task marks the job succeeded in the transaction that stores its
      // output, so a restart never repeats a task whose output was saved.
      if (job.kind === "assessment") await this.draftQuiz(job, course);
      else await this.prepareExplanation(job, course);
      this.logger.info(
        { jobId: job.id, kind: job.kind },
        "agent task succeeded",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Agent task failed";
      this.logger.warn(
        { jobId: job.id, kind: job.kind, err: error },
        "agent task failed",
      );
      markJobFailed(this.store, job.id, message, now());
      appendWorkflowStep(
        this.store,
        job.id,
        {
          actor: job.kind === "assessment" ? "Assessment" : "Content",
          action: "Draft failed",
          detail: "No draft was saved. The task can be retried.",
          state: "failed",
        },
        "failed",
      );
      this.store.event(
        job.class_id,
        job.kind === "assessment" ? "Assessment" : "Content",
        "Task failed",
        { message },
        null,
        job.id,
      );
    }
  }

  private async draftQuiz(job: JobRow, course: ClassRow): Promise<void> {
    const { topic } = parseAssessmentPayload(job.payload);
    const draft = await draftAssessment(topic, course.syllabus);
    const id = randomUUID();
    const result: JobResult = { quizId: id };
    this.store.transaction(() => {
      insertQuiz(this.store, {
        id,
        class_id: course.id,
        title: draft.title,
        questions: JSON.stringify(draft.questions),
        status: "draft",
        engine: engineName(),
        created_at: now(),
      });
      this.store.event(
        course.id,
        "Assessment",
        "Quiz drafted",
        {
          quizId: id,
          topic,
          questions: draft.questions.length,
          engine: engineName(),
        },
        null,
        job.id,
      );
      setWorkflowEntity(this.store, job.id, id, draft.title);
      appendWorkflowStep(
        this.store,
        job.id,
        {
          actor: "Assessment",
          action: "Quiz draft created",
          detail: `${String(draft.questions.length)} questions were saved for teacher review.`,
        },
        "awaiting_review",
      );
      markJobSucceeded(this.store, job.id, JSON.stringify(result), now());
    });
  }

  private async prepareExplanation(
    job: JobRow,
    course: ClassRow,
  ): Promise<void> {
    const { gapId } = parseContentPayload(job.payload);
    const gap = findGapInClass(this.store, gapId, course.id);
    if (!gap) throw new Error("Learning gap is unavailable");
    const targets = openGapIdsForTag(this.store, course.id, gap.tag);
    if (!targets.length) throw new Error("This gap has already been resolved");
    const content = await prepareContent(
      gap.topic,
      gap.tag,
      gap.section,
      course.syllabus,
    );
    const id = randomUUID();
    const result: JobResult = { interventionId: id };
    this.store.transaction(() => {
      insertIntervention(this.store, {
        id,
        class_id: course.id,
        topic: gap.topic,
        tag: gap.tag,
        content: content.explanation,
        probe: JSON.stringify(content.probe),
        targets: JSON.stringify(targets),
        status: "draft",
        engine: engineName(),
        created_at: now(),
        approved_at: null,
      });
      this.store.event(
        course.id,
        "Content",
        "Explanation prepared for teacher approval",
        { interventionId: id, targets: targets.length, engine: engineName() },
        null,
        job.id,
      );
      setWorkflowEntity(this.store, job.id, id, gap.topic);
      appendWorkflowStep(
        this.store,
        job.id,
        {
          actor: "Content",
          action: "Explanation draft created",
          detail: `Prepared for ${String(targets.length)} learning gaps; teacher approval is required.`,
        },
        "awaiting_review",
      );
      markJobSucceeded(this.store, job.id, JSON.stringify(result), now());
    });
  }
}
