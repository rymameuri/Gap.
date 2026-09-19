import type { Migration } from "./migration.js";

export const courseFileIndex: Migration = {
  id: "0008-course-file-index",
  up(store) {
    store.run(`CREATE TABLE course_file_text(
      file_id TEXT PRIMARY KEY REFERENCES course_files(id) ON DELETE CASCADE,
      text TEXT NOT NULL
    )`);
  },
  down(store) {
    store.run("DROP TABLE course_file_text");
  },
};
