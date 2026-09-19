import type { Migration } from "./migration.js";

export const workflowTraces: Migration = {
  id: "0007-workflow-traces",
  up(store) {
    store.run(`CREATE TABLE workflow_runs(
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id),
      kind TEXT NOT NULL CHECK(kind IN ('study','quiz_draft','quiz_submission','explanation','follow_up')),
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','awaiting_review','complete','failed','rejected')),
      student_id TEXT REFERENCES users(id),
      job_id TEXT UNIQUE REFERENCES jobs(id) ON DELETE SET NULL,
      entity_id TEXT,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    store.run(
      "CREATE INDEX workflow_runs_class ON workflow_runs(class_id,created_at DESC)",
    );
    store.run(
      "CREATE INDEX workflow_runs_entity ON workflow_runs(kind,entity_id)",
    );
    store.run(`CREATE TABLE workflow_steps(
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK(position > 0),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('complete','pending','failed')),
      sources TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      UNIQUE(run_id,position)
    )`);
  },
  down(store) {
    store.run("DROP TABLE workflow_steps");
    store.run("DROP TABLE workflow_runs");
  },
};
