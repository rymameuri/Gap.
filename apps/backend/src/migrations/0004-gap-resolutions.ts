import type { Migration } from "./migration.js";

export const gapResolutions: Migration = {
  id: "0004-gap-resolutions",
  up(store) {
    store.run(`CREATE TABLE gap_resolutions(
      gap_id TEXT PRIMARY KEY REFERENCES gaps(id) ON DELETE CASCADE,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      created_at TEXT NOT NULL
    )`);
  },
  down(store) {
    store.run("DROP TABLE gap_resolutions");
  },
};
