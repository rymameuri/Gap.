import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "./db.js";

test("foreign keys stay enforced after the database is saved to a file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "db-"));
  const store = await openStore(join(directory, "app.sqlite"));
  try {
    store.save();
    assert.equal(
      store.one<{ foreign_keys: number }>("PRAGMA foreign_keys")?.foreign_keys,
      1,
    );
    assert.throws(() => {
      store.run("INSERT INTO memberships VALUES(?,?)", [
        "no-such-class",
        "no-such-user",
      ]);
    }, /FOREIGN KEY constraint failed/);
  } finally {
    store.db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
