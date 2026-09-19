import { unzipSync } from "fflate";

/** One non-empty spreadsheet row with its 1-based row number in the file. */
export interface SheetRow {
  row: number;
  cells: string[];
}

export class SpreadsheetError extends Error {}

// A roster of a few thousand rows unzips to well under a megabyte, so this
// only stops archives that expand far beyond their upload size.
export const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;

const WORKBOOK = "xl/workbook.xml";
const WORKBOOK_RELS = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS = "xl/sharedStrings.xml";
const DELIMITERS = [",", ";", "\t"] as const;

/**
 * Reads the rows of a .csv file or of the first worksheet of an .xlsx file.
 * Empty rows are dropped; cell text is trimmed.
 * @throws SpreadsheetError when the file cannot be read.
 */
export function readSpreadsheet(filename: string, content: Buffer): SheetRow[] {
  return /\.xlsx$/i.test(filename) ? readXlsx(content) : readCsv(content);
}

function compact(rows: SheetRow[]): SheetRow[] {
  return rows
    .map(({ row, cells }) => ({ row, cells: cells.map((cell) => cell.trim()) }))
    .filter(({ cells }) => cells.some((cell) => cell !== ""));
}

// CSV

export function readCsv(content: Buffer): SheetRow[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new SpreadsheetError(
      "Save the CSV file with UTF-8 encoding and try again.",
    );
  }
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  return compact(parseCsv(text, detectDelimiter(text)));
}

// Spreadsheet programs in many locales export with semicolons, so the header
// line decides the delimiter.
function detectDelimiter(text: string): string {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  let best: string = DELIMITERS[0];
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = header.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 parsing: quoted fields may hold delimiters, quotes and line breaks. */
export function parseCsv(text: string, delimiter = ","): SheetRow[] {
  const rows: SheetRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push({ row: rowStart, cells });
    cells = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"' && text.charAt(index + 1) === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else {
        if (char === "\n") line++;
        cell += char;
      }
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) endCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text.charAt(index + 1) === "\n") index++;
      endRow();
      line++;
      rowStart = line;
    } else cell += char;
  }
  if (quoted)
    throw new SpreadsheetError(
      `Row ${String(rowStart)} has a quote that is never closed.`,
    );
  if (cell !== "" || cells.length > 0) endRow();
  return rows;
}

// XLSX (Office Open XML spreadsheet)

function unzip(content: Buffer): Record<string, Uint8Array> {
  let expanded = 0;
  try {
    return unzipSync(content, {
      filter(file) {
        expanded += file.originalSize;
        if (expanded > MAX_UNZIPPED_BYTES)
          throw new SpreadsheetError("The spreadsheet is too large to read.");
        return (
          file.name === WORKBOOK ||
          file.name === WORKBOOK_RELS ||
          file.name === SHARED_STRINGS ||
          file.name.startsWith("xl/worksheets/")
        );
      },
    });
  } catch (error) {
    if (error instanceof SpreadsheetError) throw error;
    throw new SpreadsheetError(
      "This file is not a valid Excel workbook. Save it as .xlsx or .csv.",
    );
  }
}

function xmlText(files: Record<string, Uint8Array>, name: string): string {
  const file = files[name];
  if (file === undefined)
    throw new SpreadsheetError(
      "This file is not a valid Excel workbook. Save it as .xlsx or .csv.",
    );
  return new TextDecoder("utf-8").decode(file);
}

/** Decodes XML entities and the _xHHHH_ escapes Excel writes for control characters. */
export function decodeXml(value: string): string {
  return value
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(
      /&(?:#x([0-9A-Fa-f]+)|#(\d+)|(lt|gt|amp|quot|apos));/g,
      (_, hex?: string, decimal?: string, name?: string) => {
        if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
        if (decimal !== undefined)
          return String.fromCodePoint(parseInt(decimal, 10));
        return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[
          name as "lt" | "gt" | "amp" | "quot" | "apos"
        ];
      },
    );
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match?.[1] === undefined ? undefined : decodeXml(match[1]);
}

// Element names may carry a namespace prefix, such as x:row.
const P = "(?:[\\w.-]+:)?";

/** Text of every <t> run, skipping phonetic guides (<rPh>). */
function runText(xml: string): string {
  const withoutPhonetics = xml.replace(
    new RegExp(`<${P}rPh\\b[\\s\\S]*?</${P}rPh>`, "g"),
    "",
  );
  let text = "";
  for (const match of withoutPhonetics.matchAll(
    new RegExp(`<${P}t(?:\\s[^>]*)?>([\\s\\S]*?)</${P}t>`, "g"),
  ))
    text += decodeXml(match[1] ?? "");
  return text;
}

function sharedStrings(files: Record<string, Uint8Array>): string[] {
  if (files[SHARED_STRINGS] === undefined) return [];
  const xml = xmlText(files, SHARED_STRINGS);
  return Array.from(
    xml.matchAll(
      new RegExp(
        `<${P}si(?:\\s[^>]*)?>([\\s\\S]*?)</${P}si>|<${P}si\\s*/>`,
        "g",
      ),
    ),
    (match) => runText(match[1] ?? ""),
  );
}

function firstSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = xmlText(files, WORKBOOK);
  const sheet = new RegExp(`<${P}sheet\\b[^>]*>`).exec(workbook)?.[0];
  const relationId =
    sheet === undefined ? undefined : /\s[\w.-]+:id="([^"]+)"/.exec(sheet)?.[1];
  if (relationId === undefined)
    throw new SpreadsheetError("The workbook has no worksheets.");
  const rels = xmlText(files, WORKBOOK_RELS);
  for (const [tag] of rels.matchAll(
    new RegExp(`<${P}Relationship\\b[^>]*>`, "g"),
  ))
    if (attribute(tag, "Id") === relationId) {
      const target = attribute(tag, "Target") ?? "";
      return target.startsWith("/") ? target.slice(1) : "xl/" + target;
    }
  throw new SpreadsheetError("The workbook has no worksheets.");
}

function columnIndex(reference: string | undefined): number | undefined {
  const letters = reference === undefined ? "" : /^[A-Z]+/.exec(reference)?.[0];
  if (!letters) return undefined;
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function cellValue(tag: string, body: string, strings: string[]): string {
  const type = attribute(tag, "t") ?? "n";
  const value = new RegExp(`<${P}v>([\\s\\S]*?)</${P}v>`).exec(body)?.[1];
  switch (type) {
    case "s":
      return strings[Number(value)] ?? "";
    case "inlineStr":
      return runText(body);
    case "b":
      return value === "1" ? "TRUE" : "FALSE";
    case "e":
      return "";
    default:
      return value === undefined ? "" : decodeXml(value);
  }
}

export function readXlsx(content: Buffer): SheetRow[] {
  const files = unzip(content);
  const strings = sharedStrings(files);
  const sheet = xmlText(files, firstSheetPath(files));
  const rows: SheetRow[] = [];
  const rowPattern = new RegExp(
    `<${P}row\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${P}row>)`,
    "g",
  );
  const cellPattern = new RegExp(
    `<${P}c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${P}c>)`,
    "g",
  );
  for (const rowMatch of sheet.matchAll(rowPattern)) {
    const number = Number(attribute(rowMatch[1] ?? "", "r") ?? NaN);
    const row = Number.isInteger(number) ? number : (rows.at(-1)?.row ?? 0) + 1;
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(cellPattern)) {
      const tag = cellMatch[1] ?? "";
      const column = columnIndex(attribute(tag, "r")) ?? cells.length;
      while (cells.length < column) cells.push("");
      cells[column] = cellValue(tag, cellMatch[2] ?? "", strings);
    }
    rows.push({ row, cells });
  }
  return compact(rows);
}
