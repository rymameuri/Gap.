import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  isBackendPath,
  scanCommitMessage,
  scanFile,
  type Finding,
} from "./forbidden.js";

const USAGE = [
  "Usage: check-forbidden [mode]",
  "  --all                  scan tracked backend files (default)",
  "  --staged               scan staged backend files",
  "  --commit-msg <file>    scan a commit message if the commit touches backend files",
  "  --commits <range>      scan messages of commits in <range> that touch backend files",
].join("\n");

const NUL = String.fromCharCode(0);
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;

class UsageError extends Error {}

interface Report {
  readonly source: string;
  readonly findings: readonly Finding[];
}

function git(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
}

function nulSeparated(output: string): string[] {
  return output.split(NUL).filter((entry) => entry.length > 0);
}

function stagedPaths(): string[] {
  return nulSeparated(
    git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"),
  );
}

function scanTrackedFiles(): Report[] {
  return nulSeparated(git("ls-files", "-z"))
    .filter(isBackendPath)
    .map((path) => ({
      source: path,
      findings: scanFile(path, readFileSync(path, "utf8")),
    }));
}

function scanStagedFiles(): Report[] {
  return stagedPaths()
    .filter(isBackendPath)
    .map((path) => ({
      source: path,
      findings: scanFile(path, git("show", ":" + path)),
    }));
}

function scanMessageFile(file: string): Report[] {
  if (!stagedPaths().some(isBackendPath)) return [];
  return [
    {
      source: "commit message",
      findings: scanCommitMessage(readFileSync(file, "utf8")),
    },
  ];
}

function scanCommitRange(range: string): Report[] {
  return git("rev-list", "--no-merges", range)
    .split("\n")
    .filter((sha) => sha.length > 0)
    .filter((sha) =>
      nulSeparated(
        git("diff-tree", "--no-commit-id", "--name-only", "-r", "-z", sha),
      ).some(isBackendPath),
    )
    .map((sha) => ({
      source: "commit " + sha.slice(0, 12),
      findings: scanCommitMessage(git("log", "-1", "--format=%B", sha)),
    }));
}

function requireValue(args: readonly string[], flag: string): string {
  const value = args.at(1);
  if (value === undefined || value.startsWith("--"))
    throw new UsageError(flag + " requires a value");
  return value;
}

function run(args: readonly string[]): Report[] {
  const mode = args.at(0) ?? "--all";
  switch (mode) {
    case "--all":
      return scanTrackedFiles();
    case "--staged":
      return scanStagedFiles();
    case "--commit-msg":
      return scanMessageFile(requireValue(args, mode));
    case "--commits":
      return scanCommitRange(requireValue(args, mode));
    default:
      throw new UsageError("Unknown mode " + mode);
  }
}

function main(): void {
  let reports: Report[];
  try {
    reports = run(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(error.message + "\n" + USAGE + "\n");
    process.exitCode = EXIT_USAGE;
    return;
  }
  const failures = reports.filter((report) => report.findings.length > 0);
  for (const { source, findings } of failures)
    for (const finding of findings)
      process.stderr.write(
        `${source}:${String(finding.line)}:${String(finding.column)} ${finding.reason} (${finding.match})\n`,
      );
  if (failures.length > 0) {
    process.stderr.write(
      "Forbidden characters or phrases found. Use plain ASCII punctuation and neutral wording.\n",
    );
    process.exitCode = EXIT_FINDINGS;
  }
}

main();
