import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkPassword, sessionToken } from "./auth.js";
import { hashPassword } from "./db.js";

describe("checkPassword", () => {
  const stored = hashPassword("correct horse");

  test("accepts the matching password", () => {
    assert.equal(checkPassword("correct horse", stored), true);
  });

  test("rejects a different password", () => {
    assert.equal(checkPassword("wrong horse", stored), false);
  });

  const separator = stored.indexOf(":");
  const salt = stored.slice(0, separator);
  const hash = stored.slice(separator + 1);
  const malformed: readonly (readonly [string, string])[] = [
    ["empty value", ""],
    ["missing separator", `${salt}${hash}`],
    ["extra segment", `${stored}:extra`],
    ["short hash", `${salt}:${hash.slice(2)}`],
    ["non-hex hash", `${salt}:${"z".repeat(128)}`],
    ["uppercase hex", stored.toUpperCase()],
  ];
  for (const [name, value] of malformed)
    test(`rejects a stored value with ${name}`, () => {
      assert.equal(checkPassword("correct horse", value), false);
    });
});

describe("sessionToken", () => {
  test("extracts the session cookie among others", () => {
    assert.equal(sessionToken("a=1; gap_session=abc123; b=2"), "abc123");
  });

  test("returns an empty token when the cookie is absent", () => {
    assert.equal(sessionToken("a=1"), "");
    assert.equal(sessionToken(undefined), "");
  });
});
