import { z } from "zod";
import {
  gradeSchema,
  questionSchema,
  type Grade,
  type Question,
} from "./agents/schemas.js";

const questionList = z.array(questionSchema);
const gradeList = gradeSchema.shape.results;
const answerMap = z.record(z.string());
const idList = z.array(z.string());
const eventDetails = z.record(z.unknown());
const assessmentPayload = z.object({ topic: z.string() });
const contentPayload = z.object({ gapId: z.string() });
const jobResult = z.union([
  z.object({ quizId: z.string() }),
  z.object({ interventionId: z.string() }),
]);

export type JobResult = z.infer<typeof jobResult>;

// Stored JSON was validated when written; parsing again turns a corrupted
// column into an explicit error instead of an untyped value.
function parse<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  text: string,
): T {
  return schema.parse(JSON.parse(text));
}

export const parseQuestions = (text: string): Question[] =>
  parse(questionList, text);
export const parseQuestion = (text: string): Question =>
  parse(questionSchema, text);
export const parseGrades = (text: string): Grade[] => parse(gradeList, text);
export const parseAnswers = (text: string): Record<string, string> =>
  parse(answerMap, text);
export const parseIds = (text: string): string[] => parse(idList, text);
export const parseEventDetails = (text: string): Record<string, unknown> =>
  parse(eventDetails, text);
export const parseAssessmentPayload = (text: string): { topic: string } =>
  parse(assessmentPayload, text);
export const parseContentPayload = (text: string): { gapId: string } =>
  parse(contentPayload, text);
export const parseJobResult = (text: string): JobResult =>
  parse(jobResult, text);

/** A question with its answer key and grading keywords removed. */
export type PublicQuestion = Omit<Question, "correctAnswer" | "keywords">;

export function publicQuestion(question: Question): PublicQuestion {
  const { correctAnswer, keywords, ...rest } = question;
  return rest;
}
