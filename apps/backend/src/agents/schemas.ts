import { z } from "zod";
export const questionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(10).max(2000),
    topic: z.string().min(1),
    tag: z.string().min(1),
    section: z.string(),
    kind: z.enum(["choice", "text"]),
    options: z.array(z.string()).max(6),
    correctAnswer: z.string(),
    keywords: z.array(z.string()).max(20),
    rubric: z.string().min(1),
    maxPoints: z.number().int().min(1).max(10),
  })
  .superRefine((q, ctx) => {
    if (
      q.kind === "choice" &&
      (q.options.length < 2 || !q.options.includes(q.correctAnswer))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choice answer must be one of the options",
      });
    if (q.kind === "text" && q.keywords.length === 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Text questions need rubric keywords",
      });
  });
export const quizSchema = z
  .object({
    title: z.string().min(1).max(200),
    questions: z.array(questionSchema).min(1).max(5),
  })
  .superRefine((q, ctx) => {
    if (new Set(q.questions.map((x) => x.id)).size !== q.questions.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Question IDs must be unique",
      });
  });
export const contentSchema = z
  .object({ explanation: z.string().min(30).max(8000), probe: questionSchema })
  .superRefine((c, ctx) => {
    if (c.probe.kind !== "choice")
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Follow-up must be multiple choice",
      });
  });
export const gradeSchema = z.object({
  results: z.array(
    z.object({
      questionId: z.string(),
      score: z.number().min(0),
      confidence: z.number().min(0).max(1),
      tag: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});
export type Question = z.infer<typeof questionSchema>;
export type QuizDraft = z.infer<typeof quizSchema>;
export type Grade = z.infer<typeof gradeSchema>["results"][number];
export type TeachingContent = z.infer<typeof contentSchema>;
