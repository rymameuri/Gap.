import type { Migration } from "./migration.js";

export const presentations: Migration = {
  id: "0008-presentations",
  up(store) {
    store.run(`CREATE TABLE presentations(
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  title TEXT NOT NULL,
  slides TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
)`);
    store.run("CREATE INDEX presentations_class ON presentations(class_id)");
  },
  down(store) {
    store.run("DROP TABLE presentations");
  },
};
