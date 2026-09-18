import { randomBytes } from "node:crypto";
import type { Store } from "./db.js";

// No 0, 1, I or O: codes are read aloud and typed by students.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 8;

/** Returns a join code not used by any class. */
export function classCode(store: Store): string {
  for (;;) {
    const code = Array.from(
      randomBytes(JOIN_CODE_LENGTH),
      (value) => JOIN_CODE_ALPHABET[value % JOIN_CODE_ALPHABET.length],
    ).join("");
    if (!store.one("SELECT id FROM classes WHERE join_code=?", [code]))
      return code;
  }
}

/** Assigns a join code to every class that has none. */
export function backfillJoinCodes(store: Store): void {
  for (const course of store.all<{ id: string }>(
    "SELECT id FROM classes WHERE join_code IS NULL",
  ))
    store.run("UPDATE classes SET join_code=? WHERE id=?", [
      classCode(store),
      course.id,
    ]);
}
