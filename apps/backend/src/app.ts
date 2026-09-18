import express, { type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store, Row } from "./db.js";
import {
  authenticated,
  teacherOnly,
  checkPassword,
  setSession,
  sessionToken,
  tokenHash,
} from "./auth.js";
import { AgentQueue } from "./jobs.js";
import { quizSchema, type Question, type Grade } from "./agents/schemas.js";
import { gradeAssessment } from "./agents/assessment.js";
import { diagnose, recordLearningGaps } from "./agents/diagnostic.js";
import { engineName } from "./agents/provider.js";
const asyncRoute =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
export const publicQuestion = (q: Question) => {
  const { correctAnswer, keywords, ...rest } = q;
  return rest;
};
const date = () => new Date().toISOString();
export function createApp(store: Store) {
  const app = express();
  app.disable("x-powered-by");
  const queue = new AgentQueue(store);
  app.use(express.json({ limit: "250kb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method) && req.headers.origin) {
      const origins = [
        req.protocol + "://" + req.get("host"),
        process.env.APP_ORIGIN,
        "http://localhost:" + (process.env.WEB_PORT || 3000),
        "http://127.0.0.1:" + (process.env.WEB_PORT || 3000),
      ];
      if (!origins.includes(req.headers.origin)) {
        res
          .status(403)
          .json({ error: "This request origin is not permitted." });
        return;
      }
    }
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, engine: engineName(), database: "sqlite" }),
  );
  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    asyncRoute((req, res) => {
      const body = z
        .object({
          email: z.string().email().max(200),
          password: z.string().min(1).max(128),
        })
        .parse(req.body);
      const user = store.one("SELECT * FROM users WHERE email=?", [
        body.email.trim().toLowerCase(),
      ]);
      if (!user || !checkPassword(body.password, user.password)) {
        res.status(401).json({ error: "Email or password is incorrect." });
        return;
      }
      setSession(store, res, user.id);
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    }),
  );
  app.use("/api", authenticated(store));
  app.get("/api/auth/me", (req, res) => res.json(req.user));
  app.post("/api/auth/logout", (req, res) => {
    store.run("DELETE FROM sessions WHERE token_hash=?", [
      tokenHash(sessionToken(req.headers.cookie)),
    ]);
    res.clearCookie("gap_session", { path: "/" });
    res.json({ ok: true });
  });
  const ownClass = (teacherId: string, classId: string) => {
    const course = store.one(
      "SELECT * FROM classes WHERE id=? AND teacher_id=?",
      [classId, teacherId],
    );
    if (!course)
      throw Object.assign(new Error("Class not found."), { status: 404 });
    return course;
  };
  const quizWithQuestions = (row: Row, publicOnly = false) => ({
    ...row,
    questions: JSON.parse(row.questions).map((q: Question) =>
      publicOnly ? publicQuestion(q) : q,
    ),
  });
  app.get("/api/teacher/workspace", teacherOnly, (req, res) => {
    const courses = store.all("SELECT * FROM classes WHERE teacher_id=?", [
      req.user.id,
    ]);
    const requested =
      typeof req.query.classId === "string"
        ? req.query.classId
        : courses[0]?.id;
    if (!requested) {
      res.json({ classes: [], course: null });
      return;
    }
    const course = ownClass(req.user.id, requested);
    const gaps = store.all(
      "SELECT g.*,u.name AS student_name FROM gaps g JOIN users u ON u.id=g.student_id WHERE g.class_id=? ORDER BY g.severity DESC",
      [course.id],
    );
    const clusters = store.all(
      "SELECT topic,tag,section,MIN(id) AS gapId,COUNT(*) AS students,SUM(severity) AS priority,SUM(CASE WHEN status='struggling' THEN 1 ELSE 0 END) AS struggling FROM gaps WHERE class_id=? AND status!='resolved' GROUP BY topic,tag,section ORDER BY priority DESC",
      [course.id],
    );
    const roster = store.all(
      "SELECT u.id,u.name,u.email,(SELECT COUNT(*) FROM gaps g WHERE g.student_id=u.id AND g.class_id=m.class_id AND g.status!='resolved') AS open_gaps,(SELECT COUNT(*) FROM questions q WHERE q.student_id=u.id AND q.class_id=m.class_id) AS activity FROM memberships m JOIN users u ON u.id=m.student_id WHERE m.class_id=? ORDER BY open_gaps DESC,activity DESC",
      [course.id],
    );
    const quizzes = store
      .all("SELECT * FROM quizzes WHERE class_id=? ORDER BY created_at DESC", [
        course.id,
      ])
      .map((row) => ({
        ...quizWithQuestions(row),
        submissions: store.one(
          "SELECT COUNT(*) AS count FROM submissions WHERE quiz_id=?",
          [row.id],
        )!.count,
        flagged: store.one(
          "SELECT COUNT(*) AS count FROM submissions WHERE quiz_id=? AND status='pending'",
          [row.id],
        )!.count,
      }));
    const reviews = store
      .all(
        "SELECT s.*,u.name AS student_name,q.title AS quiz_title,q.questions FROM submissions s JOIN users u ON u.id=s.student_id JOIN quizzes q ON q.id=s.quiz_id WHERE q.class_id=? AND s.status='pending' ORDER BY s.created_at",
        [course.id],
      )
      .map((row) => ({
        ...row,
        questions: JSON.parse(row.questions),
        answers: JSON.parse(row.answers),
        results: JSON.parse(row.results),
      }));
    const interventions = store
      .all(
        "SELECT * FROM interventions WHERE class_id=? ORDER BY created_at DESC",
        [course.id],
      )
      .map((row) => ({
        ...row,
        probe: JSON.parse(row.probe),
        targets: JSON.parse(row.targets),
      }));
    const events = store
      .all(
        "SELECT * FROM events WHERE class_id=? ORDER BY created_at DESC LIMIT 60",
        [course.id],
      )
      .map((row) => ({ ...row, details: JSON.parse(row.details) }));
    const asked = store.all(
      "SELECT q.*,u.name AS student_name FROM questions q JOIN users u ON u.id=q.student_id WHERE q.class_id=? ORDER BY q.created_at DESC LIMIT 20",
      [course.id],
    );
    res.json({
      classes: courses,
      course,
      clusters,
      gaps,
      roster,
      quizzes,
      reviews,
      interventions,
      events,
      asked,
      engine: engineName(),
      jobs: store.all(
        "SELECT id,kind,status,error,created_at FROM jobs WHERE class_id=? ORDER BY created_at DESC LIMIT 10",
        [course.id],
      ),
    });
  });
  app.post(
    "/api/teacher/classes",
    teacherOnly,
    asyncRoute((req, res) => {
      const body = z
          .object({
            name: z.string().min(3).max(150),
            syllabus: z.string().min(10).max(50000),
          })
          .parse(req.body),
        id = randomUUID();
      store.transaction(() => {
        store.run("INSERT INTO classes VALUES(?,?,?,?,?)", [
          id,
          req.user.id,
          body.name,
          body.syllabus,
          1,
        ]);
        store.event(id, "Teacher", "Class created", { name: body.name });
      });
      res.status(201).json({ id });
    }),
  );
  app.put(
    "/api/teacher/classes/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      ownClass(req.user.id, req.params.id);
      const body = z
        .object({
          name: z.string().min(3).max(150),
          syllabus: z.string().min(10).max(50000),
        })
        .parse(req.body);
      store.transaction(() => {
        store.run(
          "UPDATE classes SET name=?,syllabus=?,material_version=material_version+1 WHERE id=?",
          [body.name, body.syllabus, req.params.id],
        );
        store.event(req.params.id, "Teacher", "Class materials updated", {
          name: body.name,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/teacher/classes/:id/enroll",
    teacherOnly,
    asyncRoute((req, res) => {
      ownClass(req.user.id, req.params.id);
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const user = store.one(
        "SELECT id FROM users WHERE email=? AND role='student'",
        [email.toLowerCase()],
      );
      if (!user) {
        res
          .status(404)
          .json({
            error: "Student account not found. Use a seeded demo account.",
          });
        return;
      }
      store.run("INSERT OR IGNORE INTO memberships VALUES(?,?)", [
        req.params.id,
        user.id,
      ]);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/teacher/classes/:id/assessments",
    teacherOnly,
    asyncRoute((req, res) => {
      ownClass(req.user.id, req.params.id);
      const body = z
        .object({ topic: z.string().min(3).max(200) })
        .parse(req.body);
      res
        .status(202)
        .json({
          jobId: queue.enqueue(req.params.id, req.user.id, "assessment", body),
        });
    }),
  );
  app.get("/api/teacher/jobs/:id", teacherOnly, (req, res) => {
    const job = store.one("SELECT * FROM jobs WHERE id=? AND actor_id=?", [
      req.params.id,
      req.user.id,
    ]);
    if (!job) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    res.json({
      ...job,
      payload: undefined,
      result: job.result ? JSON.parse(job.result) : null,
    });
  });
  app.put(
    "/api/teacher/quizzes/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      const quiz = store.one("SELECT * FROM quizzes WHERE id=?", [
        req.params.id,
      ]);
      if (!quiz) {
        res.status(404).json({ error: "Quiz not found." });
        return;
      }
      ownClass(req.user.id, quiz.class_id);
      if (quiz.status !== "draft") {
        res.status(409).json({ error: "Published quizzes cannot be edited." });
        return;
      }
      const body = quizSchema.parse(req.body);
      store.run("UPDATE quizzes SET title=?,questions=? WHERE id=?", [
        body.title,
        JSON.stringify(body.questions),
        quiz.id,
      ]);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/teacher/quizzes/:id/publish",
    teacherOnly,
    asyncRoute((req, res) => {
      const quiz = store.one("SELECT * FROM quizzes WHERE id=?", [
        req.params.id,
      ]);
      if (!quiz) {
        res.status(404).json({ error: "Quiz not found." });
        return;
      }
      ownClass(req.user.id, quiz.class_id);
      quizSchema.parse({
        title: quiz.title,
        questions: JSON.parse(quiz.questions),
      });
      store.transaction(() => {
        store.run("UPDATE quizzes SET status='published' WHERE id=?", [
          quiz.id,
        ]);
        store.event(quiz.class_id, "Teacher", "Assessment published", {
          quizId: quiz.id,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/teacher/reviews/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      const sub = store.one(
        "SELECT s.*,q.class_id,q.questions FROM submissions s JOIN quizzes q ON q.id=s.quiz_id WHERE s.id=?",
        [req.params.id],
      );
      if (!sub) {
        res.status(404).json({ error: "Submission not found." });
        return;
      }
      ownClass(req.user.id, sub.class_id);
      if (sub.status !== "pending") {
        res
          .status(409)
          .json({ error: "This submission has already been published." });
        return;
      }
      const { scores, feedback } = z
        .object({
          scores: z.record(z.number().min(0)),
          feedback: z.string().max(2000).default("Reviewed by teacher."),
        })
        .parse(req.body);
      const questions: Question[] = JSON.parse(sub.questions),
        results: Grade[] = JSON.parse(sub.results);
      for (const q of questions) {
        const score = scores[q.id];
        if (score === undefined || score > q.maxPoints) {
          res
            .status(400)
            .json({ error: "Provide a valid score for each question." });
          return;
        }
        const result = results.find((r) => r.questionId === q.id)!;
        result.score = score;
        result.tag = score < q.maxPoints ? q.tag : null;
        result.reason = feedback;
        result.confidence = 1;
      }
      store.transaction(() => {
        store.run(
          "UPDATE submissions SET results=?,score=?,confidence=1,status='reviewed',reason=? WHERE id=?",
          [
            JSON.stringify(results),
            results.reduce((n, r) => n + r.score, 0),
            feedback,
            sub.id,
          ],
        );
        recordLearningGaps(
          store,
          sub.class_id,
          sub.student_id,
          questions,
          results,
          "Reviewed assessment",
        );
        store.event(
          sub.class_id,
          "Teacher",
          "Grade approved",
          { submissionId: sub.id },
          sub.student_id,
        );
        diagnose(store, sub.class_id, sub.student_id);
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/teacher/gaps/:id/explainer",
    teacherOnly,
    asyncRoute((req, res) => {
      const gap = store.one("SELECT * FROM gaps WHERE id=?", [req.params.id]);
      if (!gap) {
        res.status(404).json({ error: "Gap not found." });
        return;
      }
      ownClass(req.user.id, gap.class_id);
      res
        .status(202)
        .json({
          jobId: queue.enqueue(gap.class_id, req.user.id, "content", {
            gapId: gap.id,
          }),
        });
    }),
  );
  app.put(
    "/api/teacher/interventions/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      const item = store.one("SELECT * FROM interventions WHERE id=?", [
        req.params.id,
      ]);
      if (!item) {
        res.status(404).json({ error: "Explanation not found." });
        return;
      }
      ownClass(req.user.id, item.class_id);
      if (item.status !== "draft") {
        res
          .status(409)
          .json({ error: "Shared explanations cannot be edited." });
        return;
      }
      const body = z
        .object({ content: z.string().min(30).max(8000) })
        .parse(req.body);
      store.run("UPDATE interventions SET content=? WHERE id=?", [
        body.content,
        item.id,
      ]);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/teacher/interventions/:id/approve",
    teacherOnly,
    asyncRoute((req, res) => {
      const item = store.one("SELECT * FROM interventions WHERE id=?", [
        req.params.id,
      ]);
      if (!item) {
        res.status(404).json({ error: "Explanation not found." });
        return;
      }
      ownClass(req.user.id, item.class_id);
      if (item.status !== "draft") {
        res.status(409).json({ error: "This explanation is already shared." });
        return;
      }
      store.transaction(() => {
        store.run(
          "UPDATE interventions SET status='approved',approved_at=? WHERE id=?",
          [date(), item.id],
        );
        for (const id of JSON.parse(item.targets))
          store.run(
            "UPDATE gaps SET intervention_id=?,status='ready',updated_at=? WHERE id=? AND status!='resolved'",
            [item.id, date(), id],
          );
        store.event(
          item.class_id,
          "Teacher",
          "Explanation approved and shared",
          {
            interventionId: item.id,
            targetCount: JSON.parse(item.targets).length,
          },
        );
      });
      res.json({ ok: true });
    }),
  );
  app.get("/api/student/workspace", (req, res) => {
    if (req.user.role !== "student") {
      res.status(403).json({ error: "Student access is required." });
      return;
    }
    const courses = store.all(
      "SELECT c.* FROM memberships m JOIN classes c ON c.id=m.class_id WHERE m.student_id=?",
      [req.user.id],
    );
    const gaps = store
      .all(
        "SELECT g.*,i.content,i.probe,i.status AS content_status,c.name AS class_name FROM gaps g JOIN classes c ON c.id=g.class_id LEFT JOIN interventions i ON i.id=g.intervention_id AND i.status='approved' WHERE g.student_id=? ORDER BY g.updated_at DESC",
        [req.user.id],
      )
      .map((g) => ({
        ...g,
        probe: g.probe ? publicQuestion(JSON.parse(g.probe)) : null,
      }));
    const quizzes = store
      .all(
        "SELECT q.*,c.name AS class_name FROM quizzes q JOIN classes c ON c.id=q.class_id JOIN memberships m ON m.class_id=q.class_id WHERE m.student_id=? AND q.status='published' ORDER BY q.created_at DESC",
        [req.user.id],
      )
      .map((q) => ({
        ...quizWithQuestions(q, true),
        submission: store.one(
          "SELECT id,status,score,total FROM submissions WHERE student_id=? AND quiz_id=?",
          [req.user.id, q.id],
        ),
      }))
      .map((q) =>
        q.submission?.status === "pending"
          ? { ...q, submission: { id: q.submission.id, status: "pending" } }
          : q,
      );
    const grades = store
      .all(
        "SELECT s.*,q.title FROM submissions s JOIN quizzes q ON q.id=s.quiz_id WHERE s.student_id=? AND s.status!='pending' ORDER BY s.created_at DESC",
        [req.user.id],
      )
      .map((s) => ({
        ...s,
        answers: JSON.parse(s.answers),
        results: JSON.parse(s.results),
      }));
    const progress = store.all(
      "SELECT p.*,g.topic FROM probes p JOIN gaps g ON g.id=p.gap_id WHERE p.student_id=? ORDER BY p.created_at DESC",
      [req.user.id],
    );
    res.json({
      courses,
      gaps,
      quizzes,
      grades,
      progress,
      engine: engineName(),
    });
  });
  app.post(
    "/api/student/quizzes/:id/submit",
    asyncRoute(async (req, res) => {
      if (req.user.role !== "student") {
        res.status(403).json({ error: "Student access is required." });
        return;
      }
      const quiz = store.one(
        "SELECT q.* FROM quizzes q JOIN memberships m ON m.class_id=q.class_id WHERE q.id=? AND q.status='published' AND m.student_id=?",
        [req.params.id, req.user.id],
      );
      if (!quiz) {
        res.status(404).json({ error: "Assessment not found." });
        return;
      }
      if (
        store.one(
          "SELECT id FROM submissions WHERE quiz_id=? AND student_id=?",
          [quiz.id, req.user.id],
        )
      ) {
        res
          .status(409)
          .json({ error: "You have already submitted this assessment." });
        return;
      }
      const { answers } = z
          .object({ answers: z.record(z.string().max(4000)) })
          .parse(req.body),
        questions: Question[] = JSON.parse(quiz.questions);
      for (const q of questions)
        if (
          !answers[q.id]?.trim() ||
          (q.kind === "choice" && !q.options.includes(answers[q.id]))
        ) {
          res
            .status(400)
            .json({ error: "Answer every question using a valid option." });
          return;
        }
      const results = await gradeAssessment(questions, answers),
        confidence = Math.min(...results.map((r) => r.confidence)),
        pending = confidence < 0.8,
        score = results.reduce((n, r) => n + r.score, 0),
        total = questions.reduce((n, q) => n + q.maxPoints, 0),
        id = randomUUID();
      // A second request could arrive while the model was running; enforce uniqueness again before publication.
      if (
        store.one(
          "SELECT id FROM submissions WHERE quiz_id=? AND student_id=?",
          [quiz.id, req.user.id],
        )
      ) {
        res
          .status(409)
          .json({ error: "You have already submitted this assessment." });
        return;
      }
      store.transaction(() => {
        store.run("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
          id,
          quiz.id,
          req.user.id,
          JSON.stringify(answers),
          JSON.stringify(results),
          score,
          total,
          confidence,
          pending ? "pending" : "graded",
          pending
            ? "Uncertain grading awaits teacher review."
            : "Graded against the rubric.",
          date(),
        ]);
        store.event(
          quiz.class_id,
          "Assessment",
          pending ? "Grade held for review" : "Assessment graded",
          { submissionId: id, confidence, engine: engineName() },
          req.user.id,
        );
        if (!pending) {
          recordLearningGaps(
            store,
            quiz.class_id,
            req.user.id,
            questions,
            results,
            quiz.title,
          );
          diagnose(store, quiz.class_id, req.user.id);
        }
      });
      res
        .status(201)
        .json(
          pending
            ? {
                id,
                status: "pending",
                message:
                  "Submitted. Your teacher will review the uncertain grade before it is published.",
              }
            : { id, status: "graded", score, total, results },
        );
    }),
  );
  app.post(
    "/api/student/gaps/:id/recheck",
    asyncRoute((req, res) => {
      if (req.user.role !== "student") {
        res.status(403).json({ error: "Student access is required." });
        return;
      }
      const gap = store.one(
        "SELECT g.*,i.probe,i.content FROM gaps g JOIN interventions i ON i.id=g.intervention_id AND i.status='approved' WHERE g.id=? AND g.student_id=?",
        [req.params.id, req.user.id],
      );
      if (!gap) {
        res
          .status(404)
          .json({ error: "Teacher-approved explanation not found." });
        return;
      }
      const { answer } = z
          .object({ answer: z.string().max(2000) })
          .parse(req.body),
        probe: Question = JSON.parse(gap.probe);
      if (!probe.options.includes(answer)) {
        res.status(400).json({ error: "Select one of the answer options." });
        return;
      }
      const correct = answer === probe.correctAnswer;
      store.transaction(() => {
        store.run("INSERT INTO probes VALUES(?,?,?,?,?,?)", [
          randomUUID(),
          gap.id,
          req.user.id,
          answer,
          correct ? 1 : 0,
          date(),
        ]);
        store.run("UPDATE gaps SET status=?,updated_at=? WHERE id=?", [
          correct ? "resolved" : "struggling",
          date(),
          gap.id,
        ]);
        store.event(
          gap.class_id,
          "Content",
          correct
            ? "Follow-up verified understanding"
            : "Follow-up escalated for teacher support",
          { gapId: gap.id, correct },
          req.user.id,
        );
        diagnose(store, gap.class_id, req.user.id);
      });
      res.json({
        correct,
        status: correct ? "resolved" : "struggling",
        message: correct
          ? "Correct. Your gap is resolved, and your teacher’s dashboard has been updated."
          : "Not quite. The gap stays open, and your teacher has been notified for more support.",
      });
    }),
  );
  app.post(
    "/api/student/questions",
    asyncRoute((req, res) => {
      if (req.user.role !== "student") {
        res.status(403).json({ error: "Student access is required." });
        return;
      }
      const body = z
        .object({ classId: z.string(), text: z.string().min(5).max(2000) })
        .parse(req.body);
      if (
        !store.one(
          "SELECT 1 FROM memberships WHERE class_id=? AND student_id=?",
          [body.classId, req.user.id],
        )
      ) {
        res.status(404).json({ error: "Class not found." });
        return;
      }
      store.transaction(() => {
        store.run("INSERT INTO questions VALUES(?,?,?,?,?)", [
          randomUUID(),
          body.classId,
          req.user.id,
          body.text,
          date(),
        ]);
        store.event(
          body.classId,
          "Diagnostic",
          "Informal question received",
          { question: body.text },
          req.user.id,
        );
        diagnose(store, body.classId, req.user.id);
      });
      res.status(201).json({ ok: true });
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: error.issues.map((i) => i.message).join(" ") });
        return;
      }
      res
        .status(error.status || 500)
        .json({
          error: error.status
            ? error.message
            : "The operation failed. Please retry.",
        });
      if (!error.status)
        console.error(
          "API operation failed:",
          error instanceof Error ? error.message : "unknown error",
        );
    },
  );
  return app;
}
