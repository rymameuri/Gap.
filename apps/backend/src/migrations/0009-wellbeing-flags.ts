import type { Migration } from "./migration.js";

export const wellbeingFlags: Migration = {
  id: "0009-wellbeing-flags",
  up(store) {
    store.run(`CREATE TABLE wellbeing_flags(
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL CHECK(source IN ('question','assistant')),
  text TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('urgent','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reached_out','resolved')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
    store.run(
      "CREATE INDEX wellbeing_flags_class ON wellbeing_flags(class_id,status)",
    );
  },
  down(store) {
    store.run("DROP TABLE wellbeing_flags");
  },
};
