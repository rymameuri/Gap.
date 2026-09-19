import type { Migration } from "./migration.js";

export const companionMessages: Migration = {
  id: "0010-companion-messages",
  up(store) {
    store.run(`CREATE TABLE companion_messages(
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  teacher_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
)`);
    store.run(
      "CREATE INDEX companion_messages_thread ON companion_messages(class_id,teacher_id)",
    );
  },
  down(store) {
    store.run("DROP TABLE companion_messages");
  },
};
