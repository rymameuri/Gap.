import type { Migration } from "./migration.js";

export const learningRecords: Migration = {
  id: "0005-learning-records",
  up(store) {
    store.run(`CREATE TABLE course_files(
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id),
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
      sha256 TEXT NOT NULL,
      content BLOB NOT NULL,
      status TEXT NOT NULL DEFAULT 'stored' CHECK(status IN ('stored','indexed','failed')),
      created_at TEXT NOT NULL
    )`);
    store.run(
      "CREATE INDEX course_files_class ON course_files(class_id,created_at)",
    );
    store.run(`CREATE TABLE conversations(
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id),
      student_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    store.run(
      "CREATE INDEX conversations_student ON conversations(student_id,class_id,updated_at)",
    );
    store.run(`CREATE TABLE conversation_messages(
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      sources TEXT,
      grounded INTEGER,
      requires_human_review INTEGER,
      created_at TEXT NOT NULL
    )`);
    store.run(
      "CREATE INDEX conversation_messages_order ON conversation_messages(conversation_id,created_at)",
    );
    store.run(`CREATE TABLE agent_reviews(
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id),
      student_id TEXT NOT NULL REFERENCES users(id),
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT NOT NULL,
      issues TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','published','rejected')),
      final_content TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT REFERENCES users(id)
    )`);
    store.run(
      "CREATE INDEX agent_reviews_class ON agent_reviews(class_id,status,created_at)",
    );
  },
  down(store) {
    store.run("DROP TABLE agent_reviews");
    store.run("DROP TABLE conversation_messages");
    store.run("DROP TABLE conversations");
    store.run("DROP TABLE course_files");
  },
};
