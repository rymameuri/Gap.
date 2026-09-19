# Demo readiness audit (2026-09-19)

This records the original walkthrough. See the [updated fix ownership map](fix-ownership-map.md)
for current implementation status after the backend/data work.

## Scope and setup

The interactive checks used a fresh, isolated SQLite database and the local
teaching engine on ports 3002/3003. They did not change the existing database
used by the development site on port 3000. The existing site reported
`engine: live-ai` from its read-only health endpoint. No current course content
was sent to the external model during this audit.

The three available demo identities are teacher, Sara, and Omar. This is an
action-based walkthrough, not a claim that every browser, file type, or model
response has been exercised.

## Interactive coverage

| Area                       | Checked result                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public and auth            | Landing-to-login navigation, invalid password feedback, all three sign-ins, sign-out, and role mismatch after a second tab changes the shared session.                                                             |
| Teacher classes            | Create class and invitation code, open class, edit name and syllabus with material version increment, enroll a student, roster and empty-class overview.                                                           |
| Teacher assessment         | Draft a local Physics quiz, edit and save, publish, and see it appear for a student. A new non-Physics class now starts with a blank topic; attempting unsupported local generation reports the engine limitation. |
| Teacher review and content | Review seeded and newly submitted uncertain grades, publish feedback, prepare and approve an explanation, inspect activity and learning-gap pages.                                                                 |
| Student Sara               | Invalid and valid join codes, both courses, materials, explanation and follow-up, quiz navigation/submission, pending and approved feedback, progress, assistant source panel and browser-saved draft.             |
| Student Omar               | Separate sign-in and course data; teacher routes deny access and Sara's targeted explanation is unavailable.                                                                                                       |
| Layout                     | Checked the new-class form at narrow and desktop widths. Opening a different page now starts at its top.                                                                                                           |

Automated checks: frontend/backend build passed; backend check suite passed
(175 tests); student/speech suite passed (13 tests); Python AI suite passed
(71 tests). The first backend run was blocked by sandbox loopback permissions;
it passed when rerun with local test-server binding allowed. Python tests must
run from `apps/backend` so the `app` package is importable.

## Instructor AI and agent capabilities today

- Assessment drafts quizzes and grades submissions. Low-confidence grades go
  to the teacher's review queue before the student sees them. The local engine
  deliberately marks short-answer grades as uncertain.
- Diagnostic groups and ranks observed learning gaps. The dashboard presents
  class patterns, but its current prioritization is deterministic rather than
  a free-form model conversation.
- Content prepares focused explanations and a follow-up question for a gap.
  The teacher reviews and approves them before targeted students receive them.
- Agent activity shows queued work and an audit trail. The Study Assistant is
  student-facing and requires the live Python sidecar for answers.

These are more than quiz generation/checking, but none currently drafts from
uploaded PDF/DOCX/PPTX files. Local quiz drafts come from the Physics teaching
bank; live quiz drafts receive the stored syllabus text and selected topic.

## Issues requiring backend or product work

1. **P1: A later correct quiz does not resolve an earlier gap.** Sara received
   full credit (4/4) on a newly published, teacher-reviewed Force and motion
   quiz. Results show the correct score, but My Progress still says "Needs
   practice" and the topic remains in "Topics to revisit". The assessment
   review path records new incorrect-answer gaps but does not reconcile a
   previously open gap after later full-credit work. Agree on the evidence
   rule, then update durable gap state and student/instructor views together.
   See `apps/backend/src/services/assessments.ts` and
   `apps/frontend/src/pages/student/course-model.ts`.
2. **P1: Uploaded course files are not indexed end to end.** Course creation
   and Class materials can import a `.txt` file into an editable syllabus text
   field. Express stores that text, not the original file. There is no
   teacher-facing PDF/DOCX/PPTX upload, storage, extraction, or indexing route.
   The Python loaders exist but are not wired to that workflow. See
   `apps/backend/AI_HANDOFF.md`.
3. **P1: Study Assistant requires the live sidecar.** On the isolated local
   engine, asking a question returned HTTP 503 and the UI reported that the
   assistant was unavailable. Browser-saved drafts and the source panel still
   worked. The existing development server reports live AI configured, but an
   end-to-end course-question smoke test was not run with current course data.
   Run that only with an approved, non-private fixture or explicit permission
   to transmit the selected course material to the gateway.
4. **P2: Local quiz generation is demo-specific.** The fallback generates from
   three seeded Physics topics and checks that the topic occurs in syllabus
   text. It does not generate novel questions from arbitrary uploaded material.
   Live AI receives the topic and stored syllabus text, not uploaded files.
   See `apps/backend/src/agents/assessment.ts`.
5. **P2: Assistant drafts are browser-local.** Saved prompts can be resumed in
   that browser, but they are not durable server-side chat history and do not
   follow a student across devices. See the Study Assistant UI/storage path.
6. **P2: Python's in-memory review queue is not the teacher screen's queue.**
   The instructor review screen uses the Express/SQLite submission workflow.
   The Python agent review state should not be presented as integrated with it
   until there is a durable bridge. See `apps/backend/AI_HANDOFF.md`.

## Authorization finding

The reproduced "Teacher access is required" message occurred when a second
browser tab signed in as a student. Tabs on one origin share the session cookie,
while the first tab had continued to render its stale teacher state. Backend
denial was correct. The frontend now refreshes session state across tabs and
on focus, replacing stale teacher UI with an explicit role-switch screen.
Teacher quiz publication and other teacher actions succeeded with a stable
teacher session in the isolated run. This does not establish that every
production session issue is impossible; capture the request and active role if
the warning recurs without an account switch.

## Not exercised interactively

- Native file-picker selection could not be driven by the available browser
  automation; the `.txt` import handler was typechecked and build-checked.
- Microphone dictation needs a browser/device permission and was not used.
- A live course-grounded model response, non-Physics live quiz generation, and
  PDF/DOCX/PPTX ingestion remain unverified end to end.
