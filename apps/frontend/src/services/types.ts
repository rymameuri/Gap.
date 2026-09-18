export type User = {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
};
export type Question = {
  id: string;
  prompt: string;
  topic: string;
  tag: string;
  section: string;
  kind: "choice" | "text";
  options: string[];
  correctAnswer?: string;
  keywords?: string[];
  rubric: string;
  maxPoints: number;
};
export type Quiz = {
  id: string;
  class_id?: string;
  title: string;
  questions: Question[];
  status: string;
  engine: string;
  submissions?: number;
  flagged?: number;
  class_name?: string;
  submission?: { id: string; status: string; score?: number; total?: number };
};
export type Gap = {
  id: string;
  topic: string;
  tag: string;
  section: string;
  status: string;
  source: string;
  class_id: string;
  class_name?: string;
  student_name?: string;
  content?: string;
  probe?: Question;
};
export type Cluster = {
  topic: string;
  tag: string;
  section: string;
  gapId: string;
  students: number;
  priority: number;
  struggling: number;
};
export type Course = {
  id: string;
  name: string;
  syllabus: string;
  material_version: number;
  join_code?: string;
};
export type GradeResult = {
  questionId: string;
  score: number;
  confidence: number;
  tag: string | null;
  reason: string;
};
export type Review = {
  id: string;
  student_name: string;
  quiz_title: string;
  questions: Question[];
  answers: Record<string, string>;
  results: GradeResult[];
  score: number;
  total: number;
  confidence: number;
  reason: string;
};
export type Intervention = {
  id: string;
  topic: string;
  tag: string;
  content: string;
  probe: Question;
  targets: string[];
  status: string;
  engine: string;
};
export type AgentEvent = {
  id: string;
  agent: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  job_id?: string;
};
export type TeacherData = {
  classes: Course[];
  course: Course;
  clusters: Cluster[];
  gaps: Gap[];
  roster: {
    id: string;
    name: string;
    email: string;
    open_gaps: number;
    activity: number;
  }[];
  quizzes: Quiz[];
  reviews: Review[];
  interventions: Intervention[];
  events: AgentEvent[];
  asked: { id: string; text: string; student_name: string }[];
  engine: string;
  jobs: { id: string; kind: string; status: string; error?: string }[];
};
export type StudentData = {
  courses: Course[];
  gaps: Gap[];
  quizzes: Quiz[];
  grades: {
    id: string;
    quiz_id: string;
    created_at: string;
    title: string;
    score: number;
    total: number;
    reason: string;
    results: GradeResult[];
  }[];
  progress: {
    id: string;
    gap_id: string;
    topic: string;
    correct: number;
    created_at: string;
  }[];
  engine: string;
};
