import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, loadConfig } from "./config.js";

function issuesOf(env: Record<string, string>): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.issues;
  }
  assert.fail("expected ConfigError");
}

describe("loadConfig", () => {
  test("applies development defaults", () => {
    assert.deepEqual(loadConfig({}), {
      environment: "development",
      host: "127.0.0.1",
      port: 3001,
      databasePath: ".runtime/gap.sqlite",
      demoPassword: "GapDemo!2026",
      logLevel: "info",
      secureCookies: false,
      trustProxyHops: 0,
      allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
    });
  });

  test("treats empty and whitespace values as unset", () => {
    assert.equal(loadConfig({ API_PORT: "", APP_ORIGIN: "  " }).port, 3001);
  });

  test("reads explicit values", () => {
    const config = loadConfig({
      API_HOST: "0.0.0.0",
      API_PORT: "8080",
      WEB_PORT: "5173",
      APP_ORIGIN: "https://app.example.com",
      DATABASE_PATH: "/data/app.sqlite",
      DEMO_PASSWORD: "a-long-password",
      LOG_LEVEL: "warn",
    });
    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.port, 8080);
    assert.equal(config.databasePath, "/data/app.sqlite");
    assert.equal(config.demoPassword, "a-long-password");
    assert.equal(config.logLevel, "warn");
    assert.deepEqual(config.allowedOrigins, [
      "https://app.example.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
  });

  test("requires DEMO_PASSWORD in production and enables secure cookies", () => {
    assert.deepEqual(issuesOf({ NODE_ENV: "production" }), [
      "DEMO_PASSWORD is required in production",
    ]);
    const config = loadConfig({
      NODE_ENV: "production",
      DEMO_PASSWORD: "a-long-password",
    });
    assert.equal(config.secureCookies, true);
  });

  test("reports every invalid variable at once", () => {
    const issues = issuesOf({
      API_PORT: "70000",
      WEB_PORT: "abc",
      APP_ORIGIN: "https://app.example.com/path",
      LOG_LEVEL: "verbose",
      NODE_ENV: "staging",
      DEMO_PASSWORD: "short",
    });
    const variables = issues.map((issue) => issue.split(" ")[0]).sort();
    assert.deepEqual(variables, [
      "API_PORT",
      "APP_ORIGIN",
      "DEMO_PASSWORD",
      "LOG_LEVEL",
      "NODE_ENV",
      "WEB_PORT",
    ]);
  });

  test("rejects APP_ORIGIN values that are not URLs", () => {
    assert.deepEqual(issuesOf({ APP_ORIGIN: "nope" }), [
      "APP_ORIGIN must be an origin such as https://app.example.com",
    ]);
  });

  test("reads TRUST_PROXY as a small hop count", () => {
    assert.equal(loadConfig({ TRUST_PROXY: "2" }).trustProxyHops, 2);
    for (const value of ["-1", "11", "1.5", "yes"])
      assert.equal(issuesOf({ TRUST_PROXY: value }).length, 1, value);
  });

  test("rejects non-integer ports", () => {
    assert.equal(issuesOf({ API_PORT: "30.5" }).length, 1);
  });
});
