import { initialTopics } from "../seed.js";
import { contentSchema } from "./schemas.js";
import { engineName, modelJSON } from "./provider.js";
export async function prepareContent(
  topic: string,
  tag: string,
  section: string,
  syllabus: string,
) {
  if (engineName() === "live-ai")
    return modelJSON(
      'Explain the specific misconception in clear student-friendly language, using only syllabus-grounded concepts. Then create a different multiple-choice question re-testing the same idea. JSON shape {explanation:string,probe:{id,prompt,topic,tag,section,kind:"choice",options:string[],correctAnswer:string,keywords:[],rubric:string,maxPoints:1}}. correctAnswer must exactly match an option.',
      { topic, tag, section, syllabus },
      contentSchema,
    );
  const t = initialTopics.find((t) => t.title === topic);
  if (!t)
    throw new Error(
      "Connect live AI to explain topics outside the local teaching bank.",
    );
  return contentSchema.parse({
    explanation: t.explanation,
    probe: {
      id: "recheck",
      prompt: t.followup,
      topic,
      tag,
      section,
      kind: "choice",
      options: t.followOptions,
      correctAnswer: t.followOptions[t.followAnswer],
      keywords: [],
      rubric: "1 point: correctly applies the concept to a new situation.",
      maxPoints: 1,
    },
  });
}
