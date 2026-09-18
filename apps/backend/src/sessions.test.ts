import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { tokenHash } from "./auth.js";
import { startTestServer, type TestServer } from "../test/support.js";

const HOUR_MS = 60 * 60 * 1000;

describe("session cleanup", () => {
  let app: TestServer;
  before(async () => {
    app = await startTestServer();
  });
  after(() => app.close());

  const sessionExists = (token: string): boolean =>
    app.store.one("SELECT 1 FROM sessions WHERE token_hash=?", [
      tokenHash(token),
    ]) !== undefined;

  test("signing in deletes expired sessions of every user and keeps live ones", async () => {
    const now = Date.now();
    for (const [token, user, expires] of [
      ["expired-omar", "omar", now - HOUR_MS],
      ["expired-sara", "sara", now - 1],
      ["live-omar", "omar", now + HOUR_MS],
    ] as const)
      app.store.run("INSERT INTO sessions VALUES(?,?,?)", [
        tokenHash(token),
        user,
        expires,
      ]);
    await app.login("teacher@gap.demo");
    assert.equal(sessionExists("expired-omar"), false);
    assert.equal(sessionExists("expired-sara"), false);
    assert.equal(sessionExists("live-omar"), true);
  });

  test("a live session still authenticates after cleanup", async () => {
    const response = await app.request("/api/auth/me", {
      cookie: "gap_session=live-omar",
    });
    assert.equal(response.status, 200);
  });
});
