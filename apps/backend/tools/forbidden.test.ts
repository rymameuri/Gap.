import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  commitMessageBody,
  findForbiddenCharacters,
  findForbiddenPhrases,
  isBackendPath,
  scanCommitMessage,
  scanFile,
} from "./forbidden.js";

// Fixtures are built from code points so this file stays free of the
// characters it checks for.
const NUL = String.fromCharCode(0);
const char = (codePoint: number): string => String.fromCodePoint(codePoint);

describe("findForbiddenCharacters", () => {
  const cases: readonly (readonly [number, string, string])[] = [
    [0x2014, "U+2014", "em dash"],
    [0x2013, "U+2013", "en dash"],
    [0x2018, "U+2018", "curly single quote"],
    [0x2019, "U+2019", "curly single quote"],
    [0x201c, "U+201C", "curly double quote"],
    [0x201d, "U+201D", "curly double quote"],
    [0x2026, "U+2026", "ellipsis character"],
    [0x00b7, "U+00B7", "middle dot"],
    [0x2192, "U+2192", "decorative arrow"],
    [0x27f6, "U+27F6", "decorative arrow"],
    [0x2934, "U+2934", "decorative arrow"],
    [0x2b05, "U+2B05", "decorative arrow"],
    [0x1f680, "U+1F680", "emoji"],
    [0x2705, "U+2705", "emoji"],
  ];
  for (const [codePoint, match, reason] of cases)
    test(`reports ${reason} ${match}`, () => {
      assert.deepEqual(findForbiddenCharacters("ab" + char(codePoint)), [
        { line: 1, column: 3, match, reason },
      ]);
    });

  test("reports 1-based line and column across lines", () => {
    const findings = findForbiddenCharacters("one\ntwo " + char(0x2014));
    assert.deepEqual(findings, [
      { line: 2, column: 5, match: "U+2014", reason: "em dash" },
    ]);
  });

  test("counts astral characters as one column", () => {
    const findings = findForbiddenCharacters(char(0x1f600) + char(0x2014));
    assert.equal(findings[1]?.column, 2);
  });

  test("accepts ASCII punctuation and non-forbidden letters", () => {
    assert.deepEqual(
      findForbiddenCharacters('It\'s -- "fine"... -> caf' + char(0xe9)),
      [],
    );
  });
});

describe("findForbiddenPhrases", () => {
  test("reports phrases case-insensitively with position", () => {
    assert.deepEqual(findForbiddenPhrases("ok\nA Robust parser"), [
      { line: 2, column: 3, match: "Robust", reason: "forbidden phrase" },
    ]);
  });

  test("reports curly-apostrophe contractions", () => {
    assert.equal(findForbiddenPhrases("let" + char(0x2019) + "s go").length, 1);
  });

  test("reports inflected verb forms", () => {
    assert.equal(findForbiddenPhrases("leveraged and streamlines").length, 2);
  });

  test("ignores words that only contain a phrase", () => {
    assert.deepEqual(findForbiddenPhrases("lets robustness notes"), []);
  });
});

describe("isBackendPath", () => {
  const inScope = [
    "apps/backend/src/app.ts",
    "apps/backend/tools/forbidden.ts",
    "data/schema.sql",
    ".github/workflows/backend.yml",
    ".githooks/pre-commit",
    "eslint.config.js",
  ];
  const outOfScope = [
    "apps/backend/src/agents/provider.ts",
    "apps/backend/app/ai/llm/client.py",
    "apps/backend/tests/ai/test_router.py",
    "apps/backend/requirements-ai.txt",
    "apps/frontend/src/main.tsx",
    "README.md",
    "package.json",
  ];
  for (const path of inScope)
    test(`includes ${path}`, () => {
      assert.equal(isBackendPath(path), true);
    });
  for (const path of outOfScope)
    test(`excludes ${path}`, () => {
      assert.equal(isBackendPath(path), false);
    });
});

describe("scanFile", () => {
  test("applies character and phrase rules", () => {
    const findings = scanFile(
      "apps/backend/src/x.ts",
      "a crucial" + char(0x2026),
    );
    assert.deepEqual(
      findings.map((finding) => finding.reason),
      ["ellipsis character", "forbidden phrase"],
    );
  });

  test("applies only character rules to the rule sources", () => {
    const findings = scanFile(
      "apps/backend/tools/forbidden.ts",
      "robust " + char(0x2014),
    );
    assert.deepEqual(
      findings.map((finding) => finding.reason),
      ["em dash"],
    );
  });

  test("skips binary content", () => {
    assert.deepEqual(scanFile("apps/backend/x.bin", NUL + char(0x2014)), []);
  });
});

describe("commit messages", () => {
  test("ignores comment lines and text below the scissors line", () => {
    const raw = [
      "feat(api): add route",
      "# robust comment " + char(0x2014),
      "# ------------------------ >8 ------------------------",
      "diff with a crucial change",
    ].join("\n");
    assert.equal(commitMessageBody(raw), "feat(api): add route\n");
    assert.deepEqual(scanCommitMessage(raw), []);
  });

  test("reports co-author and generator trailers", () => {
    const raw =
      "fix(db): close handle\n\nCo-Authored-By: someone\nGenerated with a tool";
    assert.deepEqual(
      scanCommitMessage(raw).map((finding) => finding.line),
      [3, 4],
    );
  });

  test("keeps original line numbers when comments are blanked", () => {
    const raw = "# comment\nchore: tidy" + char(0x2026);
    assert.equal(scanCommitMessage(raw)[0]?.line, 2);
  });
});
