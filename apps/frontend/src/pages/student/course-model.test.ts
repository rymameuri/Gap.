import { test } from "node:test";
import assert from "node:assert/strict";
import type { Course, Gap, Quiz, StudentData } from "../../services/types";
import {
  coursePath,
  courseTopics,
  selectCourse,
  topicEvidence,
} from "./course-model";

const course: Course = {
  id: "physics",
  name: "Physics",
  syllabus: "Motion",
  material_version: 1,
};
const gap: Gap = {
  id: "gap-1",
  class_id: "physics",
  student_id: "sara",
  topic: "Motion",
  tag: "Force",
  section: "Unit 1",
  source: "Quiz 1",
  status: "open",
};
const quiz: Quiz = {
  id: "quiz-1",
  class_id: "physics",
  title: "Motion check",
  engine: "local",
  status: "published",
  questions: [
    {
      id: "q1",
      prompt: "What is net force?",
      topic: "Motion",
      tag: "Force",
      section: "Unit 1",
      kind: "choice",
      options: ["Zero", "Nonzero"],
      rubric: "2 points",
      maxPoints: 2,
    },
  ],
};
const empty: StudentData = {
  courses: [course],
  gaps: [],
  quizzes: [quiz],
  grades: [],
  progress: [],
  engine: "local",
};
const grade: StudentData["grades"][number] = {
  id: "grade-1",
  quiz_id: quiz.id,
  title: quiz.title,
  score: 2,
  total: 2,
  reason: "Correct",
  created_at: "2026-09-18T10:00:00Z",
  results: [
    { questionId: "q1", score: 2, confidence: 1, tag: null, reason: "Correct" },
  ],
};

test("course selection isolates gaps, quizzes, grades, and follow-ups by stable IDs", () => {
  const otherQuiz = {
    ...quiz,
    id: "quiz-2",
    class_id: "chemistry",
    class_name: course.name,
  };
  const result = selectCourse(
    {
      ...empty,
      gaps: [gap, { ...gap, id: "gap-2", class_id: "chemistry" }],
      quizzes: [quiz, otherQuiz],
      grades: [grade, { ...grade, id: "other-grade", quiz_id: "quiz-2" }],
      progress: [
        {
          id: "p1",
          gap_id: gap.id,
          topic: gap.topic,
          correct: 1,
          created_at: "2026-09-18",
        },
        {
          id: "p2",
          gap_id: "gap-2",
          topic: gap.topic,
          correct: 1,
          created_at: "2026-09-18",
        },
      ],
    },
    course,
  );
  assert.deepEqual(
    result.gaps.map((item) => item.id),
    [gap.id],
  );
  assert.deepEqual(
    result.quizzes.map((item) => item.id),
    [quiz.id],
  );
  assert.deepEqual(
    result.grades.map((item) => item.id),
    [grade.id],
  );
  assert.deepEqual(
    result.progress.map((item) => item.id),
    ["p1"],
  );
});

test("ungraded questions never become evidence of understanding", () => {
  const result = topicEvidence("Motion", selectCourse(empty, course));
  assert.equal(result.status, "unassessed");
});

test("a correct recheck after an explanation is supported, not independent", () => {
  const result = topicEvidence(
    "Motion",
    selectCourse(
      {
        ...empty,
        gaps: [{ ...gap, status: "resolved" }],
        progress: [
          {
            id: "p1",
            gap_id: gap.id,
            topic: gap.topic,
            correct: 1,
            created_at: "2026-09-18T10:00:00Z",
          },
        ],
      },
      course,
    ),
  );
  assert.equal(result.status, "supported");
});

test("the latest follow-up result determines whether another review is needed", () => {
  const result = topicEvidence(
    "Motion",
    selectCourse(
      {
        ...empty,
        gaps: [gap],
        progress: [
          {
            id: "old",
            gap_id: gap.id,
            topic: gap.topic,
            correct: 1,
            created_at: "2026-09-18T09:00:00Z",
          },
          {
            id: "new",
            gap_id: gap.id,
            topic: gap.topic,
            correct: 0,
            created_at: "2026-09-18T10:00:00Z",
          },
        ],
      },
      course,
    ),
  );
  assert.equal(result.status, "practice");
});

test("a resolved follow-up supersedes the older failed quiz without claiming independence", () => {
  const data: StudentData = {
    ...empty,
    gaps: [{ ...gap, status: "resolved" }],
    grades: [{ ...grade, results: [{ ...grade.results[0], score: 0 }] }],
    progress: [
      {
        id: "p1",
        gap_id: gap.id,
        topic: gap.topic,
        correct: 1,
        created_at: "2026-09-18T11:00:00Z",
      },
    ],
  };
  assert.equal(
    topicEvidence("Motion", selectCourse(data, course)).status,
    "supported",
  );
  data.grades[0].created_at = "2026-09-18T12:00:00Z";
  assert.equal(
    topicEvidence("Motion", selectCourse(data, course)).status,
    "practice",
  );
});

test("only published full-credit topic results count as independent evidence", () => {
  assert.equal(
    topicEvidence("Motion", selectCourse({ ...empty, grades: [grade] }, course))
      .status,
    "independent",
  );
  assert.equal(
    topicEvidence(
      "Motion",
      selectCourse(
        {
          ...empty,
          grades: [{ ...grade, results: [{ ...grade.results[0], score: 1 }] }],
        },
        course,
      ),
    ).status,
    "practice",
  );
});

test("a later full-credit assessment resolves the old gap as independent evidence", () => {
  const result = topicEvidence(
    "Motion",
    selectCourse(
      {
        ...empty,
        grades: [grade],
        gaps: [
          { ...gap, status: "resolved", resolved_by_submission_id: grade.id },
        ],
      },
      course,
    ),
  );
  assert.equal(result.status, "independent");
});

test("an unresolved assessment gap is not hidden by an older correct quiz", () => {
  assert.equal(
    topicEvidence(
      "Motion",
      selectCourse({ ...empty, grades: [grade], gaps: [gap] }, course),
    ).status,
    "practice",
  );
});

test("all topic questions must receive full credit, including repeated topics", () => {
  const repeated = {
    ...quiz,
    questions: [...quiz.questions, { ...quiz.questions[0], id: "q2" }],
  };
  const mixed = {
    ...grade,
    results: [
      ...grade.results,
      { ...grade.results[0], questionId: "q2", score: 0 },
    ],
  };
  assert.equal(
    topicEvidence(
      "Motion",
      selectCourse({ ...empty, quizzes: [repeated], grades: [mixed] }, course),
    ).status,
    "practice",
  );
  assert.deepEqual(courseTopics([gap], [repeated]), ["Motion"]);
});

test("course IDs are encoded in routes", () => {
  assert.equal(
    coursePath("physics / A", "assistant"),
    "/student/courses/physics%20%2F%20A/assistant",
  );
});
