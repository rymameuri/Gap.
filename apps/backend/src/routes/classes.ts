import type { Express } from "express";
import express from "express";
import {
  AIServiceRequestError,
  DocumentImportError,
} from "../agents/python-service.js";
import { teacherOnly } from "../auth.js";
import { asyncRoute } from "../http/middleware.js";
import { classCards } from "../services/classes.js";
import { requireOwnedClass } from "../services/classes.js";
import {
  deleteCourseFile,
  getCourseFile,
  listCourseFiles,
  MAX_COURSE_FILE_BYTES,
  failCourseFileIndex,
  saveCourseFileText,
  uploadCourseFile,
} from "../services/materials.js";
import { param, queryString, type RouteContext } from "./context.js";

export function registerClassRoutes(
  app: Express,
  { store, aiService }: RouteContext,
): void {
  app.get("/api/classes", (req, res) => {
    res.json({ courses: classCards(store, req.user.id, req.user.role) });
  });

  app.get("/api/classes/:id/files", (req, res) => {
    res.json({
      files: listCourseFiles(
        store,
        req.user.id,
        req.user.role,
        param(req, "id"),
      ),
    });
  });

  app.get("/api/classes/:id/files/:fileId", (req, res) => {
    const file = getCourseFile(
      store,
      req.user.id,
      req.user.role,
      param(req, "id"),
      param(req, "fileId"),
    );
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(Buffer.from(file.content));
  });

  app.post(
    "/api/teacher/classes/:id/files",
    teacherOnly,
    (req, _res, next) => {
      try {
        requireOwnedClass(store, req.user.id, param(req, "id"));
        next();
      } catch (error) {
        next(error);
      }
    },
    express.raw({
      type: "application/octet-stream",
      limit: MAX_COURSE_FILE_BYTES,
    }),
    asyncRoute(async (req, res) => {
      const filename = queryString(req, "filename");
      const body: unknown = req.body;

      const file = uploadCourseFile(
        store,
        req.user.id,
        param(req, "id"),
        filename,
        body,
      );

      if (aiService === null || filename === undefined) {
        res.status(201).json(file);
        return;
      }

      if (!Buffer.isBuffer(body))
        throw new TypeError("Expected validated course file bytes.");

      try {
        const extracted = await aiService.extractDocument(filename, body);
        saveCourseFileText(store, file.id, extracted.text);
        res.status(201).json({ ...file, status: "indexed" });
      } catch (error) {
        if (error instanceof DocumentImportError) {
          failCourseFileIndex(store, file.id);
          res.status(201).json({ ...file, status: "failed" });
          return;
        }
        if (!(error instanceof AIServiceRequestError)) throw error;
        res.status(201).json(file);
      }
    }),
  );

  app.delete(
    "/api/teacher/classes/:id/files/:fileId",
    teacherOnly,
    asyncRoute((req, res) => {
      deleteCourseFile(
        store,
        req.user.id,
        param(req, "id"),
        param(req, "fileId"),
      );
      res.json({ ok: true });
    }),
  );
}
