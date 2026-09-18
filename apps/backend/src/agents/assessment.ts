import { initialTopics } from "../seed.js";
import {
  quizSchema,
  gradeSchema,
  type Question,
  type Grade,
} from "./schemas.js";
import { engineName, modelJSON } from "./provider.js";
export async function draftAssessment(topic: string, syllabus: string) {
  if (engineName() === "live-ai")
    return modelJSON(
      'Create a syllabus-grounded quiz with 2 or 3 questions, including one multiple-choice and one short-answer question. JSON shape: {title,questions:[{id,prompt,topic,tag,section,kind:"choice"|"text",options:string[],correctAnswer:string,keywords:string[],rubric:string,maxPoints:2}]}. correctAnswer for choice must exactly match an option. Each tag identifies a misconception. Text questions require meaningful keywords. Sections must cite the syllabus.',
      { topic, syllabus },
      quizSchema,
    );
  const t = initialTopics.find(
    (t) => t.title.toLowerCase() === topic.toLowerCase(),
  );
  if (!t)
    throw new Error(
      "The local engine supports Force and motion, Energy and work, and Electric circuits. Connect live AI to use other topics.",
    );
  if (
    !syllabus.toLowerCase().includes(t.title.toLowerCase()) &&
    !syllabus
      .toLowerCase()
      .includes(
        t.title === "Force and motion"
          ? "forces and motion"
          : t.title.toLowerCase(),
      )
  )
    throw new Error(
      "Add this topic to the syllabus before drafting an assessment.",
    );
  return quizSchema.parse({
    title: topic + " · Understanding check",
    questions: [
      {
        id: "q1",
        prompt: t.question,
        topic: t.title,
        tag: t.tag,
        section: t.section,
        kind: "choice",
        options: t.options,
        correctAnswer: t.options[t.answer],
        keywords: [],
        rubric:
          "2 points: identifies the correct physical principle. 0 points: selects a misconception.",
        maxPoints: 2,
      },
      {
        id: "q2",
        prompt:
          "Explain in your own words why the correct principle applies to " +
          topic.toLowerCase() +
          ".",
        topic: t.title,
        tag: t.tag,
        section: t.section,
        kind: "text",
        options: [],
        correctAnswer: t.explanation,
        keywords: t.keywords,
        rubric:
          "2 points: explains the principle and applies it. 1 point: partially explains it. 0 points: reinforces the misconception. Ambiguous wording must be reviewed.",
        maxPoints: 2,
      },
    ],
  });
}
export async function gradeAssessment(
  questions: Question[],
  answers: Record<string, string>,
): Promise<Grade[]> {
  if (engineName() === "live-ai") {
    const output = await modelJSON(
      "Grade every question against its rubric. JSON shape {results:[{questionId,score:number,confidence:number between 0 and 1,tag:string|null,reason:string}]}. Use the question misconception tag on incorrect or incomplete answers, null on full marks. Lower confidence below 0.8 when wording is ambiguous. Do not claim certainty for unclear responses.",
      { questions, answers },
      gradeSchema,
    );
    if (
      output.results.length !== questions.length ||
      new Set(output.results.map((x) => x.questionId)).size !== questions.length
    )
      throw new Error("AI grading returned incomplete results");
    for (const result of output.results) {
      const q = questions.find((q) => q.id === result.questionId);
      if (!q || result.score > q.maxPoints)
        throw new Error("AI grading returned an invalid score");
      result.tag = result.score < q.maxPoints ? q.tag : null;
    }
    return output.results;
  }
  return questions.map((q) => {
    const answer = (answers[q.id] || "").trim().toLowerCase();
    if (q.kind === "choice") {
      const correct = answer === q.correctAnswer.toLowerCase();
      return {
        questionId: q.id,
        score: correct ? q.maxPoints : 0,
        confidence: 1,
        tag: correct ? null : q.tag,
        reason: correct
          ? "Matches the answer key."
          : "Selected an option that reflects the misconception.",
      };
    }
    const hits = q.keywords.filter((word) =>
      answer.includes(word.toLowerCase()),
    ).length;
    // Lexical evidence is deliberately never published as a confident semantic judgment.
    const score =
      answer.length < 8
        ? 0
        : Math.min(q.maxPoints, hits >= 2 ? q.maxPoints : hits ? 1 : 0);
    return {
      questionId: q.id,
      score,
      confidence: answer.length < 8 ? 0.96 : 0.65,
      tag: score < q.maxPoints ? q.tag : null,
      reason:
        "Local rubric check found " +
        hits +
        " key concepts. Teacher review is required to assess meaning and possible contradictions.",
    };
  });
}
