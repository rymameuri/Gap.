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
  student_id: string;
  resolved_by_submission_id?: string | null;
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
export type AgentReview = {
  id: string;
  student_name: string;
  kind: string;
  content: string;
  sources: StudySource[];
  issues: string[];
  status: "pending" | "published" | "rejected";
  created_at: string;
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
export type TeacherInvitation = {
  id: string;
  email: string;
  name: string;
  status: "pending" | "declined";
  created_at: string;
  responded_at: string | null;
};
export type StudentInvitation = {
  id: string;
  class_id: string;
  class_name: string;
  teacher_name: string;
  created_at: string;
};
export type RosterRowStatus =
  "new" | "invited" | "enrolled" | "duplicate" | "invalid";
export type RosterPreview = {
  rows: {
    row: number;
    name: string;
    email: string;
    status: RosterRowStatus;
    hasAccount: boolean;
    message?: string;
  }[];
  summary: Record<RosterRowStatus, number>;
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
  invitations: TeacherInvitation[];
  quizzes: Quiz[];
  reviews: Review[];
  agentReviews: AgentReview[];
  interventions: Intervention[];
  events: AgentEvent[];
  asked: { id: string; text: string; student_name: string }[];
  flags: WellbeingFlag[];
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

export type StudySource = {
  documentId: string;
  title: string;
  page: number | null;
  slide: number | null;
  chunkId: string | null;
};

export type StudyAssistantResponse = {
  content: string;
  sources: StudySource[];
  grounded: boolean;
  requiresHumanReview: boolean;
  conversationId: string;
};

export type ConversationSummary = {
  id: string;
  class_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = {
  conversation: ConversationSummary;
  messages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources: StudySource[];
    grounded: boolean | null;
    requiresHumanReview: boolean | null;
    created_at: string;
  }[];
};

export type CourseFile = {
  id: string;
  class_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: "stored" | "indexed" | "failed";
  created_at: string;
};

export type Slide = { title: string; bullets: string[]; notes: string };
export type Presentation = {
  id: string;
  class_id: string;
  title: string;
  slides: Slide[];
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
export type Source = {
  id: string;
  type: "deck" | "link";
  name: string;
  url: string | null;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chars: number;
  created_at: string;
};

export type FlagSeverity = "urgent" | "high" | "medium" | "low";
export type FlagStatus = "new" | "reached_out" | "resolved";
export type FlagCategory =
  | "self_harm"
  | "safety"
  | "distress"
  | "low_mood"
  | "anxiety"
  | "isolation"
  | "quitting";
export type WellbeingFlag = {
  id: string;
  student_id: string;
  student_name: string;
  source: "question" | "assistant";
  text: string;
  category: FlagCategory;
  severity: FlagSeverity;
  status: FlagStatus;
  note: string;
  created_at: string;
  updated_at: string;
};
