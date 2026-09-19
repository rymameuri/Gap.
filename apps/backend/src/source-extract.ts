import { unzipSync } from "fflate";
import { BadRequestError } from "./errors.js";

export const MAX_DECK_BYTES = 50_000_000;
export const MAX_SOURCE_TEXT = 200_000;
const MAX_ENTRY_BYTES = 20_000_000;

function xmlText(xml: string): string {
  return [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
    .map((m) =>
      (m[1] ?? "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    )
    .join(" ")
    .trim();
}

const slideNumber = (name: string) =>
  Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);

/** Slide text and speaker notes, in slide order. */
export function extractPptx(data: Uint8Array): string {
  const files = unzipSync(data, {
    filter: (f) =>
      f.originalSize <= MAX_ENTRY_BYTES &&
      /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(f.name),
  });
  const decode = new TextDecoder();
  const pick = (dir: string) =>
    Object.keys(files)
      .filter((n) => n.startsWith(dir))
      .sort((a, b) => slideNumber(a) - slideNumber(b));
  const notes = new Map(
    pick("ppt/notesSlides/").map((n) => [
      slideNumber(n),
      xmlText(decode.decode(files[n])),
    ]),
  );
  return pick("ppt/slides/")
    .map((n, i) => {
      const body = xmlText(decode.decode(files[n]));
      const note = notes.get(slideNumber(n));
      return `Slide ${String(i + 1)}: ${body}${note ? `\nNotes: ${note}` : ""}`;
    })
    .join("\n\n")
    .slice(0, MAX_SOURCE_TEXT);
}

const startsWith = (data: Uint8Array, magic: string) =>
  magic.split("").every((c, i) => data[i] === c.charCodeAt(0));

/**
 * Validates a deck upload and pulls out its text. PDFs are stored without
 * text because there is no PDF reader yet.
 * @throws BadRequestError for the wrong type or an unreadable file.
 */
export function readDeck(name: string, data: Uint8Array): string {
  if (/\.pptx$/i.test(name)) {
    if (!startsWith(data, "PK"))
      throw new BadRequestError("That isn't a valid .pptx file.");
    try {
      return extractPptx(data);
    } catch {
      throw new BadRequestError("Could not read that presentation.");
    }
  }
  if (/\.pdf$/i.test(name)) {
    if (!startsWith(data, "%PDF"))
      throw new BadRequestError("That isn't a valid PDF.");
    return "";
  }
  throw new BadRequestError("Only .pptx and .pdf files are supported.");
}
