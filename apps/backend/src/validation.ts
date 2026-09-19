import { z } from "zod";

// Request body schemas. Services parse at the same step the API always has,
// so ownership and state checks keep answering before body validation.

export const loginBody = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(128),
});

export const createClassBody = z.object({
  name: z.string().min(3).max(150),
  syllabus: z.string().max(50000).default(""),
});

export const updateClassBody = z.object({
  name: z.string().min(3).max(150),
  syllabus: z.string().min(10).max(50000),
});

export const enrollBody = z.object({ email: z.string().email() });

export const inviteStudentsBody = z.object({
  students: z
    .array(
      z.object({
        email: z.string().trim().toLowerCase().email().max(200),
        name: z.string().trim().max(150).default(""),
      }),
    )
    .min(1)
    .max(1000),
});

export const draftAssessmentBody = z.object({
  topic: z.string().min(3).max(200),
});

export const reviewBody = z.object({
  scores: z.record(z.number().min(0)),
  feedback: z.string().max(2000).default("Reviewed by teacher."),
});

export const interventionBody = z.object({
  content: z.string().min(30).max(8000),
});

export const joinBody = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z2-9]{8}$/)),
});

export const submitBody = z.object({
  answers: z.record(z.string().max(4000)),
});

export const recheckBody = z.object({ answer: z.string().max(2000) });

export const questionBody = z.object({
  classId: z.string(),
  text: z.string().min(5).max(2000),
});

export const studyAssistantBody = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(16_000),
      }),
    )
    .max(20)
    .default([]),
});

export const agentReviewBody = z.object({
  action: z.enum(["publish", "reject"]),
  content: z.string().max(10_000).optional(),
});
