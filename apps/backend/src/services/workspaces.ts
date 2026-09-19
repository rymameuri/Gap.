import type { Store } from "../db.js";
import type { Grade, Question } from "../agents/schemas.js";
import { engineName } from "../agents/provider.js";
import { NotFoundError } from "../errors.js";
import {
  parseAnswers,
  parseEventDetails,
  parseGrades,
  parseIds,
  parseQuestion,
  parseQuestions,
  publicQuestion,
  type PublicQuestion,
} from "../json-columns.js";
import type { ClassRow, EventRow, InterventionRow, QuizRow } from "../rows.js";
import {
  classRoster,
  memberClasses,
  teacherClasses,
  type RosterEntry,
  type StudentCourse,
} from "../repositories/classes.js";
import {
  classQuizzes,
  pendingReviews,
  pendingSubmissionCount,
  publishedQuizzesForStudent,
  studentGrades,
  submissionCount,
  submissionSummary,
  type ReviewRow,
  type StudentGradeRow,
  type StudentQuizRow,
  type SubmissionSummary,
} from "../repositories/assessments.js";
import {
  classGaps,
  classInterventions,
  openClusters,
  studentGaps,
  studentProgress,
  type ClusterRow,
  type ProgressRow,
  type StudentGapRow,
  type TeacherGapRow,
} from "../repositories/learning.js";
import {
  recentEvents,
  recentJobs,
  recentQuestions,
  type AskedQuestionRow,
  type JobSummaryRow,
} from "../repositories/activity.js";
import {
  explainClusterPriorities,
  type PriorityExplanation,
} from "../explain/cluster-priority.js";
import {
  classInvitationList,
  type TeacherInvitation,
} from "../repositories/invitations.js";
import { classFlags, type TeacherFlagRow } from "../repositories/wellbeing.js";
import { requireOwnedClass } from "./classes.js";
import { pendingAgentReviews, type AgentReviewView } from "./agent-reviews.js";
import { recentWorkflowRuns, type WorkflowRun } from "./workflow-traces.js";

type WithJson<T, K extends keyof T, V> = Omit<T, K> & Record<K, V>;

export type TeacherQuizView = WithJson<QuizRow, "questions", Question[]> & {
  submissions: number;
  flagged: number;
};
export type ReviewView = Omit<
  ReviewRow,
  "questions" | "answers" | "results"
> & {
  questions: Question[];
  answers: Record<string, string>;
  results: Grade[];
};
export type InterventionView = Omit<InterventionRow, "probe" | "targets"> & {
  probe: Question;
  targets: string[];
};
export type EventView = WithJson<EventRow, "details", Record<string, unknown>>;

export type ClusterView = ClusterRow & {
  /** Why the cluster ranks where it does; see explain/cluster-priority.ts. */
  priorityExplanation: PriorityExplanation;
};

function explainedClusters(rows: ClusterRow[]): ClusterView[] {
  const explanations = explainClusterPriorities(rows);
  return rows.map((row, index) => {
    const priorityExplanation = explanations[index];
    if (priorityExplanation === undefined)
      throw new Error("Missing explanation for a gap cluster");
    return { ...row, priorityExplanation };
  });
}

export interface TeacherWorkspace {
  classes: ClassRow[];
  course: ClassRow;
  clusters: ClusterView[];
  gaps: TeacherGapRow[];
  roster: RosterEntry[];
  invitations: TeacherInvitation[];
  flags: TeacherFlagRow[];
  quizzes: TeacherQuizView[];
  reviews: ReviewView[];
  agentReviews: AgentReviewView[];
  interventions: InterventionView[];
  events: EventView[];
  asked: AskedQuestionRow[];
  engine: string;
  jobs: JobSummaryRow[];
  workflows: WorkflowRun[];
}

export interface EmptyTeacherWorkspace {
  classes: [];
  course: null;
}

/**
 * Everything the teacher workspace renders for one owned class, defaulting to
 * the teacher's first class.
 * @throws NotFoundError when `classId` is not owned by the teacher.
 */
export function teacherWorkspace(
  store: Store,
  teacherId: string,
  classId: string | undefined,
): TeacherWorkspace | EmptyTeacherWorkspace {
  const courses = teacherClasses(store, teacherId);
  const requested = classId ?? courses.at(0)?.id;
  if (!requested) return { classes: [], course: null };
  const course = requireOwnedClass(store, teacherId, requested);
  return {
    classes: courses,
    course,
    clusters: explainedClusters(openClusters(store, course.id)),
    gaps: classGaps(store, course.id),
    roster: classRoster(store, course.id),
    invitations: classInvitationList(store, course.id),
    flags: classFlags(store, course.id),
    quizzes: classQuizzes(store, course.id).map((row) => ({
      ...row,
      questions: parseQuestions(row.questions),
      submissions: submissionCount(store, row.id),
      flagged: pendingSubmissionCount(store, row.id),
    })),
    reviews: pendingReviews(store, course.id).map((row) => ({
      ...row,
      questions: parseQuestions(row.questions),
      answers: parseAnswers(row.answers),
      results: parseGrades(row.results),
    })),
    agentReviews: pendingAgentReviews(store, course.id),
    interventions: classInterventions(store, course.id).map((row) => ({
      ...row,
      probe: parseQuestion(row.probe),
      targets: parseIds(row.targets),
    })),
    events: recentEvents(store, course.id).map((row) => ({
      ...row,
      details: parseEventDetails(row.details),
    })),
    asked: recentQuestions(store, course.id),
    engine: engineName(),
    jobs: recentJobs(store, course.id),
    workflows: recentWorkflowRuns(store, course.id),
  };
}

export type StudentGapView = WithJson<
  StudentGapRow,
  "probe",
  PublicQuestion | null
>;
export type StudentQuizView = WithJson<
  StudentQuizRow,
  "questions",
  PublicQuestion[]
> & {
  submission: SubmissionSummary | { id: string; status: "pending" } | undefined;
};
export type StudentGradeView = Omit<StudentGradeRow, "answers" | "results"> & {
  answers: Record<string, string>;
  results: Grade[];
};

export interface StudentWorkspace {
  courses: StudentCourse[];
  gaps: StudentGapView[];
  quizzes: StudentQuizView[];
  grades: StudentGradeView[];
  progress: ProgressRow[];
  engine: string;
}

// A pending grade may change on review, so only its id and status are shown.
function visibleSubmission(
  summary: SubmissionSummary | undefined,
): StudentQuizView["submission"] {
  if (summary === undefined) return undefined;
  return summary.status === "pending"
    ? { id: summary.id, status: "pending" }
    : summary;
}

/**
 * Everything the student workspace renders, optionally limited to one class.
 * @throws NotFoundError when `classId` is not a class the student joined.
 */
export function studentWorkspace(
  store: Store,
  studentId: string,
  classId: string | undefined,
): StudentWorkspace {
  const courses = memberClasses(store, studentId);
  const gaps = studentGaps(store, studentId).map((row) => ({
    ...row,
    probe: row.probe ? publicQuestion(parseQuestion(row.probe)) : null,
  }));
  const quizzes = publishedQuizzesForStudent(store, studentId).map((row) => ({
    ...row,
    questions: parseQuestions(row.questions).map(publicQuestion),
    submission: visibleSubmission(submissionSummary(store, studentId, row.id)),
  }));
  const grades = studentGrades(store, studentId).map((row) => ({
    ...row,
    answers: parseAnswers(row.answers),
    results: parseGrades(row.results),
  }));
  const progress = studentProgress(store, studentId);
  if (classId && !courses.some((course) => course.id === classId))
    throw new NotFoundError("Class not found.");
  const inClass = (row: { class_id: string }) =>
    !classId || row.class_id === classId;
  return {
    courses,
    gaps: gaps.filter(inClass),
    quizzes: quizzes.filter(inClass),
    grades: grades.filter(inClass),
    progress: progress.filter(inClass),
    engine: engineName(),
  };
}
