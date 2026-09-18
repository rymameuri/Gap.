export interface Finding {
  readonly line: number;
  readonly column: number;
  readonly match: string;
  readonly reason: string;
}

const NAMED_CHARACTERS: ReadonlyMap<number, string> = new Map([
  [0x2014, "em dash"],
  [0x2013, "en dash"],
  [0x2018, "curly single quote"],
  [0x2019, "curly single quote"],
  [0x201c, "curly double quote"],
  [0x201d, "curly double quote"],
  [0x2026, "ellipsis character"],
  [0x00b7, "middle dot"],
  [0xfe0f, "emoji variation selector"],
]);

const ARROW_RANGES: readonly (readonly [number, number])[] = [
  [0x2190, 0x21ff],
  [0x27f0, 0x27ff],
  [0x2900, 0x297f],
  [0x2b00, 0x2bff],
];

const EMOJI = /\p{Extended_Pictographic}/u;

const FORBIDDEN_PHRASES: readonly RegExp[] = [
  /\bhere['\u2019]s\b/i,
  /\blet['\u2019]s\b/i,
  /\bnow we\b/i,
  /\bthis ensures\b/i,
  /\brobust\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bcomprehensive(?:ly)?\b/i,
  /\bleverag(?:e|es|ed|ing)\b/i,
  /\bstreamlin(?:e|es|ed|ing)\b/i,
  /\belegant(?:ly)?\b/i,
  /\bpowerful(?:ly)?\b/i,
  /\bdelv(?:e|es|ed|ing)\b/i,
  /\bcrucial(?:ly)?\b/i,
  /\bin this updated version\b/i,
  /\bas requested\b/i,
  /\bnote that\b/i,
  /^co-authored-by:/i,
  /\bgenerated with\b/i,
];

// Paths owned by the backend team. Agent code (TypeScript under src/agents and
// the Python service from feat/ai-orchestration-rag) has a separate owner.
const SCOPE_PREFIXES: readonly string[] = [
  "apps/backend/",
  "data/",
  ".github/",
  ".githooks/",
];
const SCOPE_FILES: readonly string[] = [
  "eslint.config.js",
  "eslint-suppressions.json",
];
const EXCLUDED_PREFIXES: readonly string[] = [
  "apps/backend/src/agents/",
  "apps/backend/app/",
  "apps/backend/tests/ai/",
  "apps/backend/requirements-ai",
  "apps/backend/build/",
];

// These files define the phrase rules and their fixtures, so they necessarily
// contain the phrases. Character rules still apply to them.
const PHRASE_RULE_SOURCES: readonly string[] = [
  "apps/backend/tools/forbidden.ts",
  "apps/backend/tools/forbidden.test.ts",
];

const NUL = String.fromCharCode(0);

const SCISSORS_LINE = "# ------------------------ >8 ------------------------";

function characterReason(codePoint: number, character: string): string | null {
  const named = NAMED_CHARACTERS.get(codePoint);
  if (named !== undefined) return named;
  if (ARROW_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high))
    return "decorative arrow";
  if (EMOJI.test(character)) return "emoji";
  return null;
}

function formatCodePoint(codePoint: number): string {
  return "U+" + codePoint.toString(16).toUpperCase().padStart(4, "0");
}

/** Returns every forbidden character in `text` with 1-based line and column. */
export function findForbiddenCharacters(text: string): Finding[] {
  const findings: Finding[] = [];
  let line = 1;
  let column = 1;
  for (const character of text) {
    if (character === "\n") {
      line += 1;
      column = 1;
      continue;
    }
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) {
      const reason = characterReason(codePoint, character);
      if (reason !== null)
        findings.push({
          line,
          column,
          match: formatCodePoint(codePoint),
          reason,
        });
    }
    column += 1;
  }
  return findings;
}

/** Returns every forbidden phrase in `text`, one finding per phrase per line. */
export function findForbiddenPhrases(text: string): Finding[] {
  const findings: Finding[] = [];
  text.split("\n").forEach((content, index) => {
    for (const phrase of FORBIDDEN_PHRASES) {
      const match = phrase.exec(content);
      if (match !== null)
        findings.push({
          line: index + 1,
          column: match.index + 1,
          match: match[0],
          reason: "forbidden phrase",
        });
    }
  });
  return findings;
}

/** True when `path` (repository-relative, forward slashes) is backend-owned. */
export function isBackendPath(path: string): boolean {
  if (EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  return (
    SCOPE_FILES.includes(path) ||
    SCOPE_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

/** Scans one file. Binary content (containing NUL) is skipped. */
export function scanFile(path: string, text: string): Finding[] {
  if (text.includes(NUL)) return [];
  const characters = findForbiddenCharacters(text);
  if (PHRASE_RULE_SOURCES.includes(path)) return characters;
  return [...characters, ...findForbiddenPhrases(text)];
}

/**
 * Blanks git comment lines and drops everything below the scissors line, so
 * findings keep the line numbers of the message as the author wrote it.
 */
export function commitMessageBody(raw: string): string {
  const lines = raw.split("\n");
  const scissors = lines.indexOf(SCISSORS_LINE);
  return (scissors === -1 ? lines : lines.slice(0, scissors))
    .map((line) => (line.startsWith("#") ? "" : line))
    .join("\n");
}

/** Scans a commit message for forbidden characters and phrases. */
export function scanCommitMessage(raw: string): Finding[] {
  const body = commitMessageBody(raw);
  return [...findForbiddenCharacters(body), ...findForbiddenPhrases(body)];
}
