import { z } from "zod";
import { engineName, modelJSON } from "./provider.js";

const MAX_SLIDES = { short: 6, full: 12 } as const;
const MAX_SOURCE_CHARS = 12_000;

export const deckSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slides: z
    .array(
      z.object({
        title: z.string().trim().max(200).default(""),
        bullets: z.array(z.string().trim().max(1000)).max(20).default([]),
        notes: z.string().trim().max(5000).default(""),
      }),
    )
    .min(1)
    .max(30),
});
export type Deck = z.infer<typeof deckSchema>;

export interface DeckRequest {
  title: string;
  focus: string;
  style: "lesson" | "recap";
  length: "short" | "full";
  syllabus: string;
  sources: { name: string; content: string }[];
}

/** Without live AI, turns each syllabus line into a slide so the button still produces a deck. */
function outline(request: DeckRequest): Deck {
  const per = request.style === "lesson" ? 4 : 2;
  const units = request.syllabus
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_SLIDES[request.length]);
  const slides = units.map((unit) => {
    const [head, ...rest] = unit.split(/\s[-–:]\s|:\s/);
    return {
      title: (head ?? unit).trim(),
      bullets: rest.length ? rest.join(" - ").split(/,\s*/).slice(0, per) : [],
      notes: "",
    };
  });
  return deckSchema.parse({
    title: request.title,
    slides: [
      {
        title: request.title,
        bullets: request.focus ? [request.focus] : [],
        notes: "",
      },
      ...slides,
    ],
  });
}

/** Drafts a slide deck from the syllabus, the teacher's sources and their main points. */
export async function generateDeck(request: DeckRequest): Promise<Deck> {
  if (engineName() !== "live-ai") return outline(request);
  const limit = MAX_SLIDES[request.length];
  return modelJSON(
    `Create a teaching slide deck for a class. Ground it in the syllabus and sources; do not invent facts they do not support. ` +
      `Make at most ${String(limit)} slides. The first slide is a title slide. ` +
      (request.style === "lesson"
        ? "Style: lesson deck. Each slide has 3 to 5 short bullet points a teacher can teach from, and speaker notes explaining how to present it. "
        : "Style: quick recap. Each slide has 2 or 3 short bullet points for a fast review, and brief speaker notes. ") +
      "If mainPoints is not empty, make sure the deck covers every one of them. " +
      "JSON shape: {title:string,slides:[{title:string,bullets:string[],notes:string}]}.",
    {
      requestedTitle: request.title,
      mainPoints: request.focus,
      syllabus: request.syllabus,
      sources: request.sources.map((s) => ({
        name: s.name,
        content: s.content.slice(0, MAX_SOURCE_CHARS),
      })),
    },
    // Defaults only change the input type, so the output type is unaffected.
    deckSchema as z.ZodType<Deck>,
  );
}
