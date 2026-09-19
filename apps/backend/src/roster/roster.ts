import { z } from "zod";
import { SpreadsheetError, type SheetRow } from "./spreadsheet.js";

export const MAX_ROSTER_STUDENTS = 1000;

/** A data row of a roster file, before it is compared with the class. */
export interface RosterLine {
  row: number;
  name: string;
  email: string;
  /** Why the row cannot be used; absent when the email is valid. */
  problem?: string;
}

const HEADERS = {
  email: ["email", "emailaddress", "mail", "studentemail", "universityemail"],
  name: ["name", "fullname", "studentname"],
  first: ["firstname", "givenname", "forename"],
  last: ["lastname", "surname", "familyname"],
} as const;

const email = z.string().email().max(200);

const normalize = (header: string) =>
  header.toLowerCase().replace(/[^a-z]/g, "");

function column(header: string[], names: readonly string[]): number {
  return header.findIndex((cell) => names.includes(normalize(cell)));
}

/**
 * Maps spreadsheet rows to roster lines using the first row as the header.
 * An Email column is required; names come from a Name column or from first
 * and last name columns.
 * @throws SpreadsheetError when the header or the size is not usable.
 */
export function rosterLines(rows: SheetRow[]): RosterLine[] {
  const [header, ...data] = rows;
  if (header === undefined) throw new SpreadsheetError("The file has no rows.");
  const emailColumn = column(header.cells, HEADERS.email);
  if (emailColumn < 0)
    throw new SpreadsheetError(
      "The first row must be a header with an Email column.",
    );
  if (data.length === 0)
    throw new SpreadsheetError("The file has a header but no students.");
  if (data.length > MAX_ROSTER_STUDENTS)
    throw new SpreadsheetError(
      `A roster file can hold at most ${MAX_ROSTER_STUDENTS.toLocaleString("en-US")} students.`,
    );
  const nameColumn = column(header.cells, HEADERS.name);
  const firstColumn = column(header.cells, HEADERS.first);
  const lastColumn = column(header.cells, HEADERS.last);
  const cell = (cells: string[], index: number) =>
    index < 0 ? "" : (cells[index] ?? "");
  return data.map(({ row, cells }) => {
    const name = (
      nameColumn >= 0
        ? cell(cells, nameColumn)
        : `${cell(cells, firstColumn)} ${cell(cells, lastColumn)}`
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 150);
    const address = cell(cells, emailColumn).toLowerCase();
    if (address === "")
      return { row, name, email: "", problem: "Email is missing." };
    if (!email.safeParse(address).success)
      return { row, name, email: address, problem: "Email is not valid." };
    return { row, name, email: address };
  });
}
