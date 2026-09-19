import type { Express } from "express";
import { studentOnly } from "../auth.js";
import { JOIN_ATTEMPTS_PER_WINDOW } from "../constants.js";
import { asyncRoute, attemptLimit } from "../http/middleware.js";
import { submitQuiz } from "../services/assessments.js";
import { joinClass } from "../services/classes.js";
import {
  respondToInvitation,
  studentInvitations,
} from "../services/invitations.js";
import { askQuestion, recheckGap } from "../services/learning.js";
import { studentWorkspace } from "../services/workspaces.js";
import { askStudyAssistant } from "../services/study-assistant.js";
import {
  deleteConversation,
  getConversation,
  listConversations,
} from "../services/conversations.js";
import { param, queryString, type RouteContext } from "./context.js";

export function registerStudentRoutes(
  app: Express,
  { store, aiService }: RouteContext,
): void {
  app.post(
    "/api/student/classes/join",
    attemptLimit(JOIN_ATTEMPTS_PER_WINDOW),
    studentOnly,
    asyncRoute((req, res) => {
      const result = joinClass(store, req.user.id, req.body);
      res.status(result.alreadyJoined ? 200 : 201).json(result);
    }),
  );

  app.get("/api/student/invitations", studentOnly, (req, res) => {
    res.json({ invitations: studentInvitations(store, req.user.id) });
  });

  app.post(
    "/api/student/invitations/:id/accept",
    studentOnly,
    asyncRoute((req, res) => {
      res.json(respondToInvitation(store, req.user.id, param(req, "id"), true));
    }),
  );

  app.post(
    "/api/student/invitations/:id/decline",
    studentOnly,
    asyncRoute((req, res) => {
      respondToInvitation(store, req.user.id, param(req, "id"), false);
      res.json({ ok: true });
    }),
  );

  app.get("/api/student/workspace", studentOnly, (req, res) => {
    res.json(studentWorkspace(store, req.user.id, queryString(req, "classId")));
  });

  app.get("/api/student/classes/:id/conversations", studentOnly, (req, res) => {
    res.json({
      conversations: listConversations(store, req.user.id, param(req, "id")),
    });
  });

  app.get("/api/student/conversations/:id", studentOnly, (req, res) => {
    res.json(getConversation(store, req.user.id, param(req, "id")));
  });

  app.delete("/api/student/conversations/:id", studentOnly, (req, res) => {
    deleteConversation(store, req.user.id, param(req, "id"));
    res.json({ ok: true });
  });

  app.post(
    "/api/student/classes/:id/assistant",
    studentOnly,
    asyncRoute(async (req, res) => {
      res.json(
        await askStudyAssistant(
          store,
          aiService,
          req.user.id,
          param(req, "id"),
          req.body,
        ),
      );
    }),
  );

  app.post(
    "/api/student/quizzes/:id/submit",
    studentOnly,
    asyncRoute(async (req, res) => {
      res
        .status(201)
        .json(await submitQuiz(store, req.user.id, param(req, "id"), req.body));
    }),
  );

  app.post(
    "/api/student/gaps/:id/recheck",
    studentOnly,
    asyncRoute((req, res) => {
      res.json(recheckGap(store, req.user.id, param(req, "id"), req.body));
    }),
  );

  app.post(
    "/api/student/questions",
    studentOnly,
    asyncRoute((req, res) => {
      askQuestion(store, req.user.id, req.body);
      res.status(201).json({ ok: true });
    }),
  );
}
