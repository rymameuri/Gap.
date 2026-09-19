import type { Migration } from "./migration.js";

export const companionChats: Migration = {
  id: "0011-companion-chats",
  up(store) {
    store.run(`CREATE TABLE companion_chats(
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  teacher_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
    store.run(
      "CREATE INDEX companion_chats_owner ON companion_chats(class_id,teacher_id,updated_at)",
    );
    store.run("ALTER TABLE companion_messages ADD COLUMN chat_id TEXT");
    // Earlier single-thread history becomes one chat per class and teacher.
    store.run(`INSERT INTO companion_chats
      SELECT lower(hex(randomblob(16))),class_id,teacher_id,'Earlier chat',MIN(created_at),MAX(created_at)
        FROM companion_messages GROUP BY class_id,teacher_id`);
    store.run(`UPDATE companion_messages SET chat_id=(
      SELECT id FROM companion_chats c
       WHERE c.class_id=companion_messages.class_id AND c.teacher_id=companion_messages.teacher_id)`);
    store.run(
      "CREATE INDEX companion_messages_chat ON companion_messages(chat_id)",
    );
  },
  down(store) {
    store.run("DROP INDEX companion_messages_chat");
    store.run("ALTER TABLE companion_messages DROP COLUMN chat_id");
    store.run("DROP TABLE companion_chats");
  },
};
