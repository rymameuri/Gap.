import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedAddress, parseLink } from "./safe-fetch.js";

test("source links reject private IPv4-mapped IPv6 addresses", () => {
  for (const host of [
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:c0a8:1",
    "::ffff:a00:1",
    "::1",
    "fc00::1",
    "fe80::1",
  ])
    assert.ok(isBlockedAddress(host), host);
  for (const host of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a00:1"])
    assert.throws(() => parseLink(`http://[${host}]/private`));
  assert.equal(isBlockedAddress("::ffff:808:808"), false);
  assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
  assert.equal(
    parseLink("https://example.com/lesson#slide").href,
    "https://example.com/lesson",
  );
});
