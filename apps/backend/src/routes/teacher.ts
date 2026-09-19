import express, { type Express } from "express";
import { DOCUMENT_UPLOAD_LIMIT, ROSTER_UPLOAD_LIMIT } from "../constants.js";
import { importCourseMaterial } from "../services/material-import.js";
import { teacherOnly } from "../auth.js";
import { NotFoundError } from "../errors.js";
import { asyncRoute } from "../http/middleware.js";
import { parseJobResult } from "../json-columns.js";
import { findJobForActor } from "../repositories/activity.js";
import {
  approveReview,
  publishQuiz,
  queueAssessmentDraft,
  updateQuizDraft,
} from "../services/assessments.js";
import {
  createClass,
  requireOwnedClass,
  enrollByEmail,
  updateClass,
} from "../services/classes.js";
import {
  approveIntervention,
  queueExplainer,
  updateIntervention,
} from "../services/learning.js";
import {
  inviteStudents,
  previewRoster,
  revokeInvitation,
} from "../services/invitations.js";
import { teacherWorkspace } from "../services/workspaces.js";
import { resolveAgentReview } from "../services/agent-reviews.js";
import { param, queryString, type RouteContext } from "./context.js";

export function registerTeacherRoutes(
  app: Express,
  { store, queue, aiService }: RouteContext,
): void {
  const ok = { ok: true } as const;

  app.get("/api/teacher/workspace", teacherOnly, (req, res) => {
    res.json(teacherWorkspace(store, req.user.id, queryString(req, "classId")));
  });

  app.post(
    "/api/teacher/classes",
    teacherOnly,
    asyncRoute((req, res) => {
      res.status(201).json(createClass(store, req.user.id, req.body));
    }),
  );

  app.post(
    "/api/teacher/classes/:id/materials/import",
    teacherOnly,
    (req, _res, next) => {
      requireOwnedClass(store, req.user.id, param(req, "id"));
      next();
    },
    express.raw({
      type: "application/octet-stream",
      limit: DOCUMENT_UPLOAD_LIMIT,
      inflate: false,
    }),
    asyncRoute(async (req, res) => {
      res.json(
        await importCourseMaterial(
          aiService,
          queryString(req, "filename"),
          req.body,
        ),
      );
    }),
  );

  app.put(
    "/api/teacher/classes/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      updateClass(store, req.user.id, param(req, "id"), req.body);
      res.json(ok);
    }),
  );

  app.post(
    "/api/teacher/classes/:id/enroll",
    teacherOnly,
    asyncRoute((req, res) => {
      enrollByEmail(store, req.user.id, param(req, "id"), req.body);
      res.json(ok);
    }),
  );

  app.post(
    "/api/teacher/classes/:id/roster/preview",
    teacherOnly,
    (req, _res, next) => {
      requireOwnedClass(store, req.user.id, param(req, "id"));
      next();
    },
    express.raw({
      type: "application/octet-stream",
      limit: ROSTER_UPLOAD_LIMIT,
      inflate: false,
    }),
    asyncRoute((req, res) => {
      res.json(
        previewRoster(
          store,
          req.user.id,
          param(req, "id"),
          queryString(req, "filename"),
          req.body,
        ),
      );
    }),
  );

  app.post(
    "/api/teacher/classes/:id/invitations",
    teacherOnly,
    asyncRoute((req, res) => {
      res.json(inviteStudents(store, req.user.id, param(req, "id"), req.body));
    }),
  );

  app.post(
    "/api/teacher/invitations/:id/revoke",
    teacherOnly,
    asyncRoute((req, res) => {
      revokeInvitation(store, req.user.id, param(req, "id"));
      res.json(ok);
    }),
  );

  app.post(
    "/api/teacher/classes/:id/assessments",
    teacherOnly,
    asyncRoute((req, res) => {
      const jobId = queueAssessmentDraft(
        store,
        queue,
        req.user.id,
        param(req, "id"),
        req.body,
      );
      res.status(202).json({ jobId });
    }),
  );

  app.get("/api/teacher/jobs/:id", teacherOnly, (req, res) => {
    const job = findJobForActor(store, param(req, "id"), req.user.id);
    if (!job) throw new NotFoundError("Task not found.");
    res.json({
      ...job,
      payload: undefined,
      result: job.result ? parseJobResult(job.result) : null,
    });
  });

  app.put(
    "/api/teacher/quizzes/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      updateQuizDraft(store, req.user.id, param(req, "id"), req.body);
      res.json(ok);
    }),
  );

  app.post(
    "/api/teacher/quizzes/:id/publish",
    teacherOnly,
    asyncRoute((req, res) => {
      publishQuiz(store, req.user.id, param(req, "id"));
      res.json(ok);
    }),
  );

  app.post(
    "/api/teacher/reviews/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      approveReview(store, req.user.id, param(req, "id"), req.body);
      res.json(ok);
    }),
  );

  app.post(
    "/api/teacher/agent-reviews/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      resolveAgentReview(store, req.user.id, param(req, "id"), req.body);
      res.json(ok);
    }),
  );

  app.post(
    "/api/teacher/gaps/:id/explainer",
    teacherOnly,
    asyncRoute((req, res) => {
      const jobId = queueExplainer(store, queue, req.user.id, param(req, "id"));
      res.status(202).json({ jobId });
    }),
  );

  app.put(
    "/api/teacher/interventions/:id",
    teacherOnly,
    asyncRoute((req, res) => {
      updateIntervention(store, req.user.id, param(req, "id"), req.body);
      res.json(ok);
    }),
  );

  app.post(
    "/api/teacher/interventions/:id/approve",
    teacherOnly,
    asyncRoute((req, res) => {
      approveIntervention(store, req.user.id, param(req, "id"));
      res.json(ok);
    }),
  );
}
