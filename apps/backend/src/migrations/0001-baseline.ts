import type { Migration } from "./migration.js";

// Schema that data/schema.sql applied at startup before migrations existed.
const TABLES = [
  `CREATE TABLE users(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK(role IN ('teacher','student')),
  password TEXT NOT NULL
)`,
  `CREATE TABLE sessions(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  expires_at INTEGER NOT NULL
)`,
  `CREATE TABLE classes(
  id TEXT PRIMARY KEY,
  teacher_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  syllabus TEXT NOT NULL,
  material_version INTEGER NOT NULL DEFAULT 1
)`,
  `CREATE TABLE memberships(
  class_id TEXT REFERENCES classes(id),
  student_id TEXT REFERENCES users(id),
  PRIMARY KEY(class_id,student_id)
)`,
  `CREATE TABLE quizzes(
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  title TEXT,
  questions TEXT,
  status TEXT,
  engine TEXT,
  created_at TEXT
)`,
  `CREATE TABLE submissions(
  id TEXT PRIMARY KEY,
  quiz_id TEXT REFERENCES quizzes(id),
  student_id TEXT REFERENCES users(id),
  answers TEXT,
  results TEXT,
  score REAL,
  total REAL,
  confidence REAL,
  status TEXT,
  reason TEXT,
  created_at TEXT,
  UNIQUE(quiz_id,student_id)
)`,
  `CREATE TABLE gaps(
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  student_id TEXT REFERENCES users(id),
  topic TEXT,
  tag TEXT,
  section TEXT,
  status TEXT,
  severity INTEGER,
  source TEXT,
  intervention_id TEXT,
  updated_at TEXT,
  UNIQUE(class_id,student_id,tag)
)`,
  `CREATE TABLE interventions(
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  topic TEXT,
  tag TEXT,
  content TEXT,
  probe TEXT,
  targets TEXT,
  status TEXT,
  engine TEXT,
  created_at TEXT,
  approved_at TEXT
)`,
  `CREATE TABLE probes(
  id TEXT PRIMARY KEY,
  gap_id TEXT REFERENCES gaps(id),
  student_id TEXT REFERENCES users(id),
  answer TEXT,
  correct INTEGER,
  created_at TEXT
)`,
  `CREATE TABLE questions(
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  student_id TEXT REFERENCES users(id),
  text TEXT,
  created_at TEXT
)`,
  `CREATE TABLE events(
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  agent TEXT,
  action TEXT,
  details TEXT,
  student_id TEXT,
  job_id TEXT,
  created_at TEXT
)`,
  `CREATE TABLE jobs(
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id),
  actor_id TEXT REFERENCES users(id),
  kind TEXT,
  payload TEXT,
  status TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT,
  updated_at TEXT
)`,
];

const INDEXES = [
  "CREATE INDEX gap_class ON gaps(class_id,status)",
  "CREATE INDEX submission_student ON submissions(student_id)",
  "CREATE INDEX event_class ON events(class_id,created_at)",
];

// Children before parents, so foreign keys never point at a dropped table.
const DROP_ORDER = [
  "jobs",
  "events",
  "questions",
  "probes",
  "interventions",
  "gaps",
  "submissions",
  "quizzes",
  "memberships",
  "classes",
  "sessions",
  "users",
];

export const baseline: Migration = {
  id: "0001-baseline",
  up(store) {
    for (const statement of [...TABLES, ...INDEXES]) store.run(statement);
  },
  down(store) {
    for (const table of DROP_ORDER) store.run(`DROP TABLE ${table}`);
  },
};
