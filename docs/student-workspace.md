# Student workspace

The student flow is `/student` (My Courses), then `/student/courses/:courseId`.
Each course has Overview, Study Assistant, Practice & Quizzes, Materials, and My Progress.
Existing `/student/gaps/:id`, `/student/assessments`, and `/student/progress` links redirect to the appropriate course screen.

## Current behavior

- The workspace, materials, published quizzes, reviewed grades, and rechecks use the existing authenticated API. Data is scoped by course IDs, quiz IDs, and gap IDs, never course names.
- Study Assistant is deliberately not connected to an AI endpoint. Students can compose and save question/topic drafts, resume them, and view their real syllabus or approved explanations alongside the editor. Drafts are stored only in this browser, under keys scoped to user and course, with a maximum of 20 drafts. They are not uploaded and never change progress.
- The separate "Ask your instructor" form uses the existing question endpoint, only after explicit submission. Saving an assistant draft does not send an instructor question.
- Quiz filters reflect actual published topic coverage and question counts. The interface does not generate, truncate, or fabricate a 5-15 question quiz: the existing submit endpoint requires every original question. Students answer one question at a time, review answers, and submit. Uncertain grades remain withheld until instructor approval.
- Progress distinguishes unassessed, needs practice, supported, and independent evidence. The current recheck always follows an explanation, so it is labeled "Completed with support". It cannot reliably distinguish hint use; it is not labeled independent. A published full-credit quiz result can provide independent evidence. Unresolved gaps remain visible conservatively.
- Materials contain only the actual syllabus and approved explanations returned by the API. Slides, files, and announcements have not been invented.

## Agent integration boundaries

Backend and agent implementation is unchanged. Future Study Assistant integration needs an authenticated, course-scoped conversation API with session IDs, messages, available/pending/error states, source references, and structured practice evidence. Replace the offline editor state with that API when available; do not repurpose the instructor question endpoint as a chatbot.

Personalized quiz setup needs an endpoint accepting topic IDs and question count, returning a quiz ID with server-owned answer keys. Extend progress data with attempt time, activity type, hint use, independent-assessment status, and source question IDs before applying the full workflow's evidence policy. A source-backed topic catalog is also needed to include topics that have no activities yet.

Student components are in `apps/frontend/src/pages/student/`; the persistent layout is `apps/frontend/src/layouts/StudentLayout.tsx`. The `s-` CSS namespace isolates the changes from teacher and landing pages.

## Run and verify

From the repository root: `npm ci`, then `npm run dev`. Open the printed URL and sign in using the student demo account. The frontend normally runs at `http://127.0.0.1:3000`.

Run `npm run test:student` for course isolation and evidence logic, `npm test` for the existing backend workflow, and `npm run build` for type checking and production compilation.
