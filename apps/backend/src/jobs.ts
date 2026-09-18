import { randomUUID } from "node:crypto";
import type { Store } from "./db.js";
import { draftAssessment } from "./agents/assessment.js";
import { prepareContent } from "./agents/content.js";
import { engineName } from "./agents/provider.js";
import { diagnose } from "./agents/diagnostic.js";
export class AgentQueue {
  private active = false;
  constructor(private store: Store) {
    store.run("UPDATE jobs SET status='queued' WHERE status='running'");
    void this.drain();
  }
  enqueue(
    classId: string,
    actorId: string,
    kind: "assessment" | "content",
    payload: unknown,
  ) {
    const id = randomUUID(),
      now = new Date().toISOString();
    this.store.run("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?)", [
      id,
      classId,
      actorId,
      kind,
      JSON.stringify(payload),
      "queued",
      null,
      null,
      now,
      now,
    ]);
    void this.drain();
    return id;
  }
  private async drain() {
    if (this.active) return;
    this.active = true;
    try {
      for (;;) {
        const job = this.store.one(
          "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1",
        );
        if (!job) break;
        this.store.run(
          "UPDATE jobs SET status='running',updated_at=? WHERE id=?",
          [new Date().toISOString(), job.id],
        );
        try {
          const course = this.store.one("SELECT * FROM classes WHERE id=?", [
            job.class_id,
          ]);
          if (!course) throw new Error("Class is unavailable");
          const payload = JSON.parse(job.payload);
          let result: unknown;
          if (job.kind === "assessment") {
            const draft = await draftAssessment(payload.topic, course.syllabus),
              id = randomUUID();
            this.store.transaction(() => {
              this.store.run("INSERT INTO quizzes VALUES(?,?,?,?,?,?,?)", [
                id,
                course.id,
                draft.title,
                JSON.stringify(draft.questions),
                "draft",
                engineName(),
                new Date().toISOString(),
              ]);
              this.store.event(
                course.id,
                "Assessment",
                "Quiz drafted",
                {
                  quizId: id,
                  topic: payload.topic,
                  questions: draft.questions.length,
                  engine: engineName(),
                },
                null,
                job.id,
              );
              this.store.run(
                "UPDATE jobs SET status='succeeded',result=?,updated_at=? WHERE id=?",
                [
                  JSON.stringify({ quizId: id }),
                  new Date().toISOString(),
                  job.id,
                ],
              );
            });
            result = { quizId: id };
          } else {
            const gap = this.store.one(
              "SELECT * FROM gaps WHERE id=? AND class_id=?",
              [payload.gapId, course.id],
            );
            if (!gap) throw new Error("Learning gap is unavailable");
            const targets = this.store
              .all(
                "SELECT id FROM gaps WHERE class_id=? AND tag=? AND status!='resolved'",
                [course.id, gap.tag],
              )
              .map((g) => g.id);
            if (!targets.length)
              throw new Error("This gap has already been resolved");
            const content = await prepareContent(
                gap.topic,
                gap.tag,
                gap.section,
                course.syllabus,
              ),
              id = randomUUID();
            this.store.transaction(() => {
              this.store.run(
                "INSERT INTO interventions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                [
                  id,
                  course.id,
                  gap.topic,
                  gap.tag,
                  content.explanation,
                  JSON.stringify(content.probe),
                  JSON.stringify(targets),
                  "draft",
                  engineName(),
                  new Date().toISOString(),
                  null,
                ],
              );
              this.store.event(
                course.id,
                "Content",
                "Explanation prepared for teacher approval",
                {
                  interventionId: id,
                  targets: targets.length,
                  engine: engineName(),
                },
                null,
                job.id,
              );
              this.store.run(
                "UPDATE jobs SET status='succeeded',result=?,updated_at=? WHERE id=?",
                [
                  JSON.stringify({ interventionId: id }),
                  new Date().toISOString(),
                  job.id,
                ],
              );
            });
            result = { interventionId: id };
          }
          this.store.run(
            "UPDATE jobs SET status='succeeded',result=?,updated_at=? WHERE id=?",
            [JSON.stringify(result), new Date().toISOString(), job.id],
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Agent task failed";
          this.store.run(
            "UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=?",
            [message, new Date().toISOString(), job.id],
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
    } finally {
      this.active = false;
    }
  }
}
