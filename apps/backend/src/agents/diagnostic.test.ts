import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../db.js";
import { seed } from "../seed.js";
import { recordLearningGaps } from "./diagnostic.js";
import type { Grade, Question } from "./schemas.js";

const question = (id: string): Question => ({
  id,
  prompt: "Choose the correct answer for this concept.",
  topic: "Force and motion",
  tag: "force-motion",
  section: "Motion",
  kind: "choice",
  options: ["Correct", "Incorrect"],
  correctAnswer: "Correct",
  keywords: [],
  rubric: "Correct answer",
  maxPoints: 1,
});
const grade = (questionId: string, score: number): Grade => ({
  questionId,
  score,
  confidence: 1,
  tag: score ? null : "force-motion",
  reason: "Checked",
});

test("later full-credit evidence resolves a gap only when every same-tag item is correct", async () => {
  const store = await openStore(":memory:");
  seed(store, "demo-password");
  const course = store.one<{ id: string }>("SELECT id FROM classes LIMIT 1");
  assert.ok(course);
  const student = store.one<{ id: string }>(
    "SELECT id FROM users WHERE email='student@gap.demo'",
  );
  assert.ok(student);
  const questions = [question("q1"), question("q2")];
  const status = () =>
    store.one<{ status: string }>(
      "SELECT status FROM gaps WHERE class_id=? AND student_id=? AND tag=?",
      [course.id, student.id, "force-motion"],
    )?.status;
  store.transaction(() =>
    recordLearningGaps(
      store,
      course.id,
      student.id,
      questions,
      [grade("q1", 1), grade("q2", 0)],
      "Mixed quiz",
    ),
  );
  assert.equal(status(), "open");
  store.transaction(() =>
    recordLearningGaps(
      store,
      course.id,
      student.id,
      questions,
      [grade("q1", 1), grade("q2", 1)],
      "Later quiz",
    ),
  );
  assert.equal(status(), "resolved");
  const event = store.one<{ action: string }>(
    "SELECT action FROM events WHERE action='Assessment resolved learning gap' LIMIT 1",
  );
  assert.equal(event?.action, "Assessment resolved learning gap");
  store.db.close();
});
