import type { Migration } from "./migration.js";

// Teachers invite students by email; the student accepts before joining.
// Invitations are keyed by email so they wait for students without accounts.
export const classInvitations: Migration = {
  id: "0006-class-invitations",
  up(store) {
    store.run(`CREATE TABLE class_invitations(
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      invited_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','revoked')),
      created_at TEXT NOT NULL,
      responded_at TEXT,
      UNIQUE(class_id,email)
    )`);
    store.run(
      "CREATE INDEX class_invitations_email ON class_invitations(email,status)",
    );
  },
  down(store) {
    store.run("DROP TABLE class_invitations");
  },
};
