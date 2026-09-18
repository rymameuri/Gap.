// Column shapes as the application writes them. JSON columns stay strings
// here; json-columns.ts parses them.

export type Role = "teacher" | "student";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  password: string;
}

export interface ClassRow {
  id: string;
  teacher_id: string;
  name: string;
  syllabus: string;
  material_version: number;
  join_code: string | null;
}

export interface QuizRow {
  id: string;
  class_id: string;
  title: string;
  questions: string;
  status: string;
  engine: string;
  created_at: string;
}

export interface SubmissionRow {
  id: string;
  quiz_id: string;
  student_id: string;
  answers: string;
  results: string;
  score: number;
  total: number;
  confidence: number;
  status: string;
  reason: string;
  created_at: string;
}

export interface GapRow {
  id: string;
  class_id: string;
  student_id: string;
  topic: string;
  tag: string;
  section: string;
  status: string;
  severity: number;
  source: string;
  intervention_id: string | null;
  updated_at: string;
}

export interface InterventionRow {
  id: string;
  class_id: string;
  topic: string;
  tag: string;
  content: string;
  probe: string;
  targets: string;
  status: string;
  engine: string;
  created_at: string;
  approved_at: string | null;
}

export interface ProbeRow {
  id: string;
  gap_id: string;
  student_id: string;
  answer: string;
  correct: number;
  created_at: string;
}

export interface QuestionRow {
  id: string;
  class_id: string;
  student_id: string;
  text: string;
  created_at: string;
}

export interface EventRow {
  id: string;
  class_id: string;
  agent: string;
  action: string;
  details: string;
  student_id: string | null;
  job_id: string | null;
  created_at: string;
}

export type JobKind = "assessment" | "content";

export interface JobRow {
  id: string;
  class_id: string;
  actor_id: string;
  kind: JobKind;
  payload: string;
  status: string;
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}
