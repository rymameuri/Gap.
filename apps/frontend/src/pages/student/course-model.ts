import type { Course, Gap, Quiz, StudentData } from "../../services/types";

export const coursePath = (id: string, page = "") =>
  `/student/courses/${encodeURIComponent(id)}${page ? `/${page}` : ""}`;

export type CourseData = ReturnType<typeof selectCourse>;

export function selectCourse(data: StudentData, course: Course) {
  const gaps = data.gaps.filter((gap) => gap.class_id === course.id);
  const quizzes = data.quizzes.filter((quiz) => quiz.class_id === course.id);
  const quizIds = new Set(quizzes.map((quiz) => quiz.id));
  const gapIds = new Set(gaps.map((gap) => gap.id));
  return {
    course,
    gaps,
    quizzes,
    grades: data.grades.filter((grade) => quizIds.has(grade.quiz_id)),
    progress: data.progress.filter((entry) => gapIds.has(entry.gap_id)),
  };
}

export function courseTopics(gaps: Gap[], quizzes: Quiz[]) {
  return Array.from(
    new Set([
      ...gaps.map((gap) => gap.topic),
      ...quizzes.flatMap((quiz) =>
        quiz.questions.map((question) => question.topic),
      ),
    ]),
  );
}

export type EvidenceStatus =
  "unassessed" | "practice" | "supported" | "independent";
export const evidenceLabels: Record<EvidenceStatus, string> = {
  unassessed: "Not assessed",
  practice: "Needs practice",
  supported: "Completed with support",
  independent: "Demonstrated independently",
};

export function topicEvidence(
  topic: string,
  data: CourseData,
): {
  status: EvidenceStatus;
  detail: string;
} {
  const gaps = data.gaps.filter((gap) => gap.topic === topic);
  const gapIds = new Set(gaps.map((gap) => gap.id));
  if (gaps.some((gap) => gap.status !== "resolved")) {
    return {
      status: "practice",
      detail: "Your assessment identified a topic to revisit.",
    };
  }
  const latestProbe = data.progress
    .filter((entry) => gapIds.has(entry.gap_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const latestGrade = data.grades
    .flatMap((grade) => {
      const quiz = data.quizzes.find((item) => item.id === grade.quiz_id);
      const results = grade.results.flatMap((result) => {
        const question = quiz?.questions.find(
          (item) => item.id === result.questionId && item.topic === topic,
        );
        return question
          ? [
              {
                correct: result.score === question.maxPoints,
              },
            ]
          : [];
      });
      return results.length
        ? [{ id: grade.id, date: grade.created_at, results }]
        : [];
    })
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latestGrade) {
    const fullCredit = latestGrade.results.every((result) => result.correct);
    if (
      !fullCredit &&
      (!latestProbe?.correct || latestGrade.date >= latestProbe.created_at)
    )
      return {
        status: "practice",
        detail: "Review the feedback on your latest quiz.",
      };
    if (
      fullCredit &&
      gaps.every((gap) => gap.resolved_by_submission_id === latestGrade.id)
    )
      return {
        status: "independent",
        detail:
          "Full credit on the latest published quiz questions for this topic.",
      };
  }
  if (latestProbe && !latestProbe.correct)
    return {
      status: "practice",
      detail: "The latest follow-up suggests another review would help.",
    };
  if (gaps.length > 0) {
    return {
      status: "supported",
      detail: "Follow-up completed after an instructor explanation.",
    };
  }
  return {
    status: "unassessed",
    detail: "No published result for this topic yet.",
  };
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
