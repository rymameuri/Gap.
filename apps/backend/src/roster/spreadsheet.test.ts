import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import {
  MAX_UNZIPPED_BYTES,
  SpreadsheetError,
  decodeXml,
  parseCsv,
  readSpreadsheet,
} from "./spreadsheet.js";
import { rosterLines } from "./roster.js";
import { rosterXlsx, xlsxArchive } from "../../test/xlsx.js";

const csv = (text: string) => readSpreadsheet("roster.csv", Buffer.from(text));
const cells = (rows: { cells: string[] }[]) => rows.map((row) => row.cells);
const WORKSHEET =
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

describe("CSV", () => {
  test("handles quotes, embedded delimiters, line breaks and CRLF", () => {
    const rows = parseCsv(
      'Name,Email\r\n"Doe, Jane",jane@uni.edu\r\n"Line\nbreak","say ""hi"""\r\n',
    );
    assert.deepEqual(rows, [
      { row: 1, cells: ["Name", "Email"] },
      { row: 2, cells: ["Doe, Jane", "jane@uni.edu"] },
      { row: 3, cells: ["Line\nbreak", 'say "hi"'] },
    ]);
  });

  test("keeps the file row number after a quoted line break", () => {
    const rows = csv('Name,Email\n"Two\nlines",a@uni.edu\nB,b@uni.edu');
    assert.deepEqual(
      rows.map((row) => row.row),
      [1, 2, 4],
    );
  });

  test("detects semicolon and tab delimiters from the header", () => {
    assert.deepEqual(cells(csv("Name;Email\nAmina;a@uni.edu")), [
      ["Name", "Email"],
      ["Amina", "a@uni.edu"],
    ]);
    assert.deepEqual(cells(csv("Name\tEmail\nAmina\ta@uni.edu")), [
      ["Name", "Email"],
      ["Amina", "a@uni.edu"],
    ]);
  });

  test("drops a byte order mark, blank rows and surrounding spaces", () => {
    assert.deepEqual(
      cells(csv("\uFEFFName,Email\n\n , \n Amina , a@uni.edu ")),
      [
        ["Name", "Email"],
        ["Amina", "a@uni.edu"],
      ],
    );
  });

  test("rejects an unclosed quote and text that is not UTF-8", () => {
    assert.throws(() => csv('Name,Email\n"Amina,a@uni.edu'), SpreadsheetError);
    assert.throws(
      () => readSpreadsheet("roster.csv", Buffer.from([0x4e, 0xff, 0xfe])),
      /UTF-8/,
    );
  });
});

describe("XLSX", () => {
  test("reads shared strings from the first worksheet", () => {
    const rows = readSpreadsheet(
      "Roster.XLSX",
      rosterXlsx([
        ["Name", "Email"],
        ["Amina & Co", "amina@uni.edu"],
      ]),
    );
    assert.deepEqual(rows, [
      { row: 1, cells: ["Name", "Email"] },
      { row: 2, cells: ["Amina & Co", "amina@uni.edu"] },
    ]);
  });

  test("reads inline, formula, number, boolean and error cells in sparse rows", () => {
    const sheet = `${WORKSHEET}<sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Email</t></is></c><c r="C1" t="inlineStr"><is><r><t>Full </t></r><r><t xml:space="preserve">name</t></r><rPh><t>x</t></rPh></is></c></row>
      <row r="2" spans="1:3"><c r="A2" t="str"><f>LOWER("B@UNI.EDU")</f><v>b@uni.edu</v></c><c r="B2"><v>2024001</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="e"><v>#N/A</v></c><c r="E2" s="1"/></row>
      <row r="4"><c r="C4" t="inlineStr"><is><t>Line_x000D_end &#233;</t></is></c></row>
      <row r="5"/>
    </sheetData></worksheet>`;
    assert.deepEqual(readSpreadsheet("r.xlsx", xlsxArchive(sheet)), [
      { row: 1, cells: ["Email", "", "Full name"] },
      { row: 2, cells: ["b@uni.edu", "2024001", "TRUE", "", ""] },
      { row: 4, cells: ["", "", "Line\rend \u00e9"] },
    ]);
  });

  test("reads namespace-prefixed elements and cells without references", () => {
    const sheet =
      '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row><x:c t="inlineStr"><x:is><x:t>Email</x:t></x:is></x:c><x:c t="inlineStr"><x:is><x:t>Name</x:t></x:is></x:c></x:row><x:row><x:c t="s"><x:v>0</x:v></x:c></x:row></x:sheetData></x:worksheet>';
    const strings =
      '<x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>a@uni.edu</x:t></x:si><x:si/></x:sst>';
    assert.deepEqual(
      cells(readSpreadsheet("r.xlsx", xlsxArchive(sheet, strings))),
      [["Email", "Name"], ["a@uni.edu"]],
    );
  });

  test("follows an absolute worksheet target", () => {
    const archive = zipSync({
      "xl/workbook.xml": strToU8(
        '<workbook><sheets><sheet name="A" sheetId="1" r:id="rId9"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId9" Target="/xl/worksheets/data.xml"/></Relationships>',
      ),
      "xl/worksheets/data.xml": strToU8(
        `${WORKSHEET}<sheetData><row r="3"><c r="B3"><v>7</v></c></row></sheetData></worksheet>`,
      ),
    });
    assert.deepEqual(readSpreadsheet("r.xlsx", Buffer.from(archive)), [
      { row: 3, cells: ["", "7"] },
    ]);
  });

  test("rejects files that are not workbooks", () => {
    assert.throws(
      () => readSpreadsheet("r.xlsx", Buffer.from("Name,Email")),
      /not a valid Excel workbook/,
    );
    const noWorkbook = Buffer.from(
      zipSync({ "word/document.xml": strToU8("<w/>") }),
    );
    assert.throws(() => readSpreadsheet("r.xlsx", noWorkbook), /not a valid/);
  });

  test("rejects a workbook without worksheets", () => {
    const empty = (workbook: string, rels: string) =>
      Buffer.from(
        zipSync({
          "xl/workbook.xml": strToU8(workbook),
          "xl/_rels/workbook.xml.rels": strToU8(rels),
        }),
      );
    assert.throws(
      () =>
        readSpreadsheet(
          "r.xlsx",
          empty("<workbook><sheets/></workbook>", "<Relationships/>"),
        ),
      /no worksheets/,
    );
    assert.throws(
      () =>
        readSpreadsheet(
          "r.xlsx",
          empty(
            '<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>',
            '<Relationships><Relationship Id="rId2" Target="x.xml"/></Relationships>',
          ),
        ),
      /no worksheets/,
    );
  });

  test("stops archives that expand beyond the limit", () => {
    const archive = zipSync(
      {
        "xl/worksheets/sheet1.xml": new Uint8Array(MAX_UNZIPPED_BYTES + 1),
      },
      { level: 9 },
    );
    assert.ok(archive.length < 100_000);
    assert.throws(
      () => readSpreadsheet("r.xlsx", Buffer.from(archive)),
      /too large/,
    );
  });

  test("decodes XML entities", () => {
    assert.equal(
      decodeXml("&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos; &#65;&#x42;"),
      "<a> & \"b\" 'c' AB",
    );
  });
});

describe("roster lines", () => {
  const lines = (rows: string[][]) =>
    rosterLines(rows.map((row, index) => ({ row: index + 1, cells: row })));

  test("maps common header spellings and combines first and last names", () => {
    assert.deepEqual(
      lines([
        ["First Name", "Last name", "E-mail Address"],
        ["Amina", " Haddad", "AMINA@Uni.edu"],
      ]),
      [{ row: 2, name: "Amina Haddad", email: "amina@uni.edu" }],
    );
    assert.deepEqual(
      lines([
        ["Student Name", "Email"],
        ["  Omar   Ali ", "omar@uni.edu"],
      ]),
      [{ row: 2, name: "Omar Ali", email: "omar@uni.edu" }],
    );
    assert.deepEqual(lines([["email"], ["x@uni.edu"]]), [
      { row: 2, name: "", email: "x@uni.edu" },
    ]);
  });

  test("marks missing and invalid emails", () => {
    assert.deepEqual(
      lines([
        ["Name", "Email"],
        ["No email", ""],
        ["Bad", "not-an-email"],
        ["Short row"],
      ]).map((line) => line.problem),
      ["Email is missing.", "Email is not valid.", "Email is missing."],
    );
  });

  test("requires a header with an Email column and at least one student", () => {
    assert.throws(() => lines([]), /no rows/);
    assert.throws(
      () =>
        lines([
          ["Name", "Phone"],
          ["A", "1"],
        ]),
      /Email column/,
    );
    assert.throws(() => lines([["Email"]]), /no students/);
  });

  test("accepts at most 1,000 students", () => {
    const header = [["Email"]];
    const many = (count: number) =>
      header.concat(
        Array.from({ length: count }, (_, index) => [
          `s${String(index)}@uni.edu`,
        ]),
      );
    assert.equal(lines(many(1000)).length, 1000);
    assert.throws(() => lines(many(1001)), /at most 1,000 students/);
  });
});
