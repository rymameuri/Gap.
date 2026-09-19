import { strToU8, zipSync } from "fflate";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** The package parts Excel writes around a worksheet, with its XML supplied by the test. */
export function xlsxArchive(
  sheetXml: string,
  sharedStringsXml?: string,
): Buffer {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roster" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
    "xl/worksheets/sheet2.xml": strToU8(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Not the roster</t></is></c></row></sheetData></worksheet>',
    ),
  };
  if (sharedStringsXml !== undefined)
    files["xl/sharedStrings.xml"] = strToU8(sharedStringsXml);
  return Buffer.from(zipSync(files));
}

/** A one-sheet workbook with every cell stored as a shared string, as Excel saves text. */
export function rosterXlsx(rows: string[][]): Buffer {
  const strings: string[] = [];
  const sheetRows = rows.map((cells, rowIndex) => {
    const xmlCells = cells.map((value, column) => {
      strings.push(value);
      const reference = String.fromCharCode(65 + column) + String(rowIndex + 1);
      return `<c r="${reference}" t="s"><v>${String(strings.length - 1)}</v></c>`;
    });
    return `<row r="${String(rowIndex + 1)}">${xmlCells.join("")}</row>`;
  });
  return xlsxArchive(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(strings.length)}">${strings.map((value) => `<si><t>${escape(value)}</t></si>`).join("")}</sst>`,
  );
}
