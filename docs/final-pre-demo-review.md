# Final pre-demo review - 2026-09-19

## Verdict

**Conditionally ready for a rehearsed, bounded demo; not fully complete or production-ready.**
The student-to-instructor learning loop works with real gateway responses. The
latest instructor tools, course-file retrieval, streaming, and equation rendering
are integrated. Do not describe all uploads as input to every agent, or the system
as an autonomous planner. Presentation delivery and actual educational impact
cannot be certified by software tests.

This report supersedes the older audit and ownership map where they disagree.

## Merge and verification

- Integrated `origin/rymedits` through `d3ecc1c`, retaining its dashboard, course
  setup, presentations, teaching companion, wellbeing flags, and tabbed hubs.
- Integrated the new `origin/main` through `ef0280c`, which arrived during QA:
  shared-file indexing, streamed Study Assistant responses, and KaTeX equations.
- Merge commits: `d7eaffb` and `c1d3195`. No force push or wholesale replacement
  of either branch. Migration tests cover old main, main with file indexing,
  rymedits, and the first combined instructor-tools schema.
- Final automated results: **241 backend tests, 109 Python AI tests, 18 student
  tests**, all passing. Backend lint, formatting, type checks, forbidden-content
  checks, and production build pass. These 368 tests are not all browser tests;
  many model calls in the suites are mocked.
- Non-blocking warnings: large frontend bundles (about 778 kB app and 501 kB lazy
  DOCX import, before gzip); one Starlette/AnyIO deprecation warning.
- Repeated 22 live API permission, isolation and privacy checks against the
  final combined code; all passed.
- Real interaction tests used an isolated database on ports 3002/3003/8002 with
  synthetic greenhouse course material. They did not populate the main demo DB.
- Restarted the normal stack on 3000/3001/8001. Frontend/API health passed;
  authenticated AI health and synthetic document extraction passed; streaming
  route validated an incomplete request with 422. Anonymous AI health correctly
  returns 401. The previous Python process was stale.

## Action-based coverage

| Area                | Actions actually exercised                                                                                                                    | Result / limit                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication      | Invalid password, teacher/Sara/Omar sign-in, sign-out, student opening teacher UI                                                             | Correct error/role states; no admin role exists                                                                                                     |
| Permissions         | Anonymous requests, cross-role mutations, cross-origin mutation, unenrolled course access, conversation ownership, private presentation notes | Denied appropriately; answer keys and teacher notes not sent to students                                                                            |
| Course setup        | Empty syllabus, rename, five-step DOCX/PPTX/link setup, real join code, invalid code                                                          | Passed; new setup accepts DOCX/TXT syllabus, broader formats are available after creation                                                           |
| Enrolment           | CSV preview, invalid/duplicate rows, invitations, Sara accepts, Omar declines, Omar joins another course                                      | Passed                                                                                                                                              |
| Materials           | Actual file chooser; TXT/DOCX/PPTX/PDF imports; oversized TXT; malformed PDF; save/discard; stored-file download byte comparison              | Passed; scanned PDFs still require OCR                                                                                                              |
| New source library  | PPTX source, PDF extraction, real public URL, blocked private IPv6-mapped address                                                             | Passed after integration fixes; retry/delete UI still missing                                                                                       |
| AI quiz             | Two live non-Physics drafts from synthetic syllabus; review answer keys/keywords, edit, save, publish                                         | Content checked against supplied facts; not a general accuracy evaluation                                                                           |
| Student assessment  | Answer, back/next, incomplete-answer restriction, submit, grade/feedback, progress                                                            | Passed                                                                                                                                              |
| Teacher review      | Seeded uncertain grade edited and approved; empty queue; held-answer API contract                                                             | Grade workflow passed; a live model-triggered held answer was not forced                                                                            |
| Quiz preview        | New View as student modal, option/text inputs, close, To review tab at 820px                                                                  | Passed; preview is explicitly non-submitting                                                                                                        |
| Learning loop       | Wrong quiz answer, teacher gap, live explanation draft/edit/approve, wrong follow-up, second explanation, correct follow-up                   | Teacher sees Resolved; student sees Completed with support, not independent mastery                                                                 |
| Student assistant   | Live syllabus questions, absent-information question, out-of-course question, citations, saved conversation, local draft, instructor question | Passed on sampled prompts                                                                                                                           |
| New file RAG / math | Upload an addendum containing unique gain/checksum facts absent from syllabus; ask from student UI                                            | Correct 0.375 and cobalt-seven; cites calibration-addendum.txt; equations render                                                                    |
| Streaming           | Real NDJSON request through Express, Python, gateway                                                                                          | Status at 4 ms; four deltas; completion at 4.19 s in one run. Timing is illustrative, not an SLA                                                    |
| AI outage           | Stop only QA sidecar, ask a question, restart, retry                                                                                          | Unavailable message, retained question, successful cited recovery; exercised before the final streaming merge, whose errors have automated coverage |
| Presentations       | Live six-slide generation, review/edit/save/publish, present mode, notes toggle, previous/next, student viewing                               | Passed; private notes removed by API. Print window opens; actual PDF-save/device print not completed                                                |
| Teaching companion  | Real class-grounded response and saved-chat reopen                                                                                            | Passed; suggestions remain advisory, not validated teaching decisions                                                                               |
| Wellbeing           | Explicitly fictional concern, teacher private note, New -> Reached out -> Resolved, resolved filter                                           | Passed; keyword heuristic, not a clinical classifier                                                                                                |
| Explainability      | Recorded workflow diagram, replay controls/filter, source details, raw event log                                                              | Passed for existing quiz/study/content workflows; not full tracing of new companion/slides                                                          |
| Responsive UI       | Desktop and 390px phone checks, assistant/form/lesson/workflow/slide viewer, equation scroll/overflow                                         | Inspected routes fit; not exhaustive across devices, zoom levels, or assistive technology                                                           |

Not exhaustively tested: microphone hardware/permission behaviour, every delete
confirmation, all generated-content lengths, mobile Safari, real printing,
concurrent multi-user load, deployment/recovery, real safeguarding operations.
No claim that every button on every browser is certified.

## Fixed during this review

| Problem / cause                                                                                         | Layers                       | Change and scope                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Rename rejected an empty syllabus because update validation disagreed with creation                     | Backend/API                  | Allow optional empty syllabus; contract regression; isolated validation change                                  |
| Teacher could not inspect/edit short-answer grading keys                                                | Frontend                     | Added expected answer and keyword editing before save/publish                                                   |
| Failed supported practice offered another attempt that the API correctly rejected                       | Frontend                     | Persistent waiting-for-instructor state; no backend one-attempt bypass                                          |
| New instructor layout hid existing enrollment, syllabus/file management, and activity access            | Frontend/integration         | Preserved those controls while retaining new navigation; included held AI answers in review counts              |
| Both branches introduced migrations in the same numbered positions                                      | Database/startup             | Recognize known released histories and apply missing migrations without deleting data; four upgrade regressions |
| Student had no UI for published presentations; API leaked speaker notes                                 | Frontend/backend/permissions | Added published viewer and stripped notes in student API; contract and live role tests                          |
| Source PDF marked ready without extraction; public links failed with Node DNS lookup shape              | Backend/integration          | Use existing extraction service; reject empty text; support all-address DNS callback                            |
| Mapped private IPv6 links bypassed source protection                                                    | Backend/security             | Normalize mapped addresses and reject private targets; regression tests                                         |
| Safe-at-home text incorrectly became urgent wellbeing flag                                              | Backend rules                | Tightened unsafe/not-safe matching; not a complete safety classifier                                            |
| Old failed quiz overrode later successful supported practice                                            | Frontend evidence model      | Prefer newer supported evidence when all gaps resolved; preserve newer failures/independent distinctions        |
| Slide editor retained state when course/id changed; misleading PDF-download label; repeated page titles | Frontend                     | Reset editor load state, label print action accurately, suppress duplicate embedded headings                    |
| Numbered explanation steps reset after bullets; bold math rendered raw                                  | Frontend                     | Preserve list starts, render nested math in emphasis, constrain equation overflow                               |
| Main Python process was old despite healthy-looking configuration                                       | Runtime                      | Restart full stack; verify extraction and streaming route, not merely engine label                              |

## Critical - must address before submission

1. **Make content claims accurate and rehearse the exact input path.**
   Study Assistant now uses syllabus plus `course_files`; quiz generation still
   receives only syllabus. Slide generation reads a separate `sources` table.
   Cause: independent features were wired to different data contracts.
   Ownership: backend + database/content contracts + RAG + agent tools + UI.
   Now: clearly distinguish these paths in the demo and use a reviewed syllabus
   for quizzes. Full fix: unify approved content selection, provenance and
   versioning across generators. Broad change, needs coordinated tests; do not
   rush it or silently imply that storing a PDF grounds a quiz.

2. **Rehearse on the actual presentation machine with isolated role sessions.**
   Main runtime is refreshed, but the end-to-end test course lives in the QA DB.
   Prepare a demo course and saved outputs using the accompanying script. Use
   separate browser profiles/private windows for teacher/student; tabs share
   cookies. Verify one live answer immediately before presenting, retain saved
   evidence for gateway failure. Ownership: integration/operations/presentation.
   Isolated setup work; dependency is gateway availability and credentials.

3. **Be precise about autonomy and explanation.**
   There is bounded routing, retrieval, model drafting, checking, and teacher
   approval, not a self-directed multi-step planning loop. Workflow replay is a
   recorded trace, not live agent execution or hidden chain-of-thought. New
   companion/slides lack equivalent workflow traces. Ownership: agent workflow,
   backend telemetry, UI and pitch. Fix claims now; more autonomy/tracing is a
   broader follow-up, not a deadline refactor. It directly affects rubric credit.

4. **Do not claim all streamed text waits for whole-answer human review.**
   Citation-checked blocks can be displayed before generation completes. A later
   bad citation/provider failure can hold the final answer after earlier blocks
   were visible. Ownership: AI workflow + streaming API/UI. Decide the review
   policy before making safety guarantees; label progressive text provisional
   or buffer until final review if a strict pre-release gate is required.
   Buffering sacrifices progressive delivery. Use synthetic, non-sensitive
   demo material and do not promise factual verification from citation checks.

## Important - fix if time allows

| Open problem and cause                                                                                                           | Owner / specific change                                                                                              | Scope, risk, timing                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Misconception tags drift between live quiz drafts: two observed variants described the same ordering error                       | Database + assessment prompts/tools + diagnostic backend: stable concept/misconception IDs, versioned mappings       | Cross-cutting; fragile automatic reconciliation across independently generated quizzes. Use the tested follow-up loop for the demo; prioritize next |
| Source library cannot add/remove/retry after setup; processing URLs may stick after process loss                                 | UI + backend job queue/data: management endpoints, durable retry/recovery, refresh/poll statuses                     | Affects presentation context; avoid failed links in demo, implement next                                                                            |
| One unreadable stored course file blocks the whole assistant                                                                     | Backend/RAG/UI: explicit teacher repair/retry and documented exclusion policy, preserve failure visibility           | Do not silently omit material; repair/remove test file before demo                                                                                  |
| Filename citations lose original page/slide provenance and do not open the cited chunk; source panel still mainly shows syllabus | Extraction/data/API/UI: carry page/slide metadata, labelled source IDs and excerpt links                             | Medium cross-layer work; useful explainability improvement, not required for the tested answer path                                                 |
| New slides/companion not represented as detailed workflow runs                                                                   | Backend trace producers + UI: record source selection, model request/result and teacher approval                     | Additive, but do not manufacture unseen agent reasoning; useful rubric coverage                                                                     |
| Grading/teaching output reliability not evaluated beyond smoke tests                                                             | AI prompts/tools + evaluation: diverse courses, ground-truth rubrics, hallucination checks, adversarial source tests | Requires team/domain review. One successful novel course is not proof of general accuracy                                                           |
| Student wellbeing flags use keyword rules; false positives/negatives and privacy process unresolved                              | Product/safeguarding + backend retention/permissions + UI transparency                                               | Real-user rollout blocker, not a synthetic hackathon demo feature to emphasize. No clinical claims                                                  |
| Study guide shows Coming soon; no student self-selected quiz topic/length generator                                              | Frontend + backend + agent APIs for a real implementation, or remove unsupported demo claims                         | Product scope; do not click unfinished affordances in pitch or imply they exist                                                                     |
| No registration/password reset/admin lifecycle for non-demo users                                                                | Authentication + database + email/invitation onboarding                                                              | Production deployment blocker; demo accounts work                                                                                                   |
| Recent-chat deletes lack a confirmation/undo in teaching companion; race handling on course switch needs stress QA               | Frontend + chat API tests                                                                                            | Isolated polish/reliability work; not exhaustively tested here                                                                                      |
| Health reports configuration, not real model readiness                                                                           | Operations/API: bounded authenticated provider preflight with clear cost/timeout behaviour                           | Useful before demo; manual real-answer check currently required                                                                                     |

## Nice to have

- Split large JS bundles; lazily load math on non-chat pages.
- Improve long-slide pagination and direct export beyond browser Print / Save PDF.
- Native microphone/device QA, keyboard/screen-reader audit, tablet/zoom matrix.
- Teacher/client usability sessions and measured learning/time outcomes. Present
  these as an evaluation plan, not results already achieved.

## Rubric coverage checklist

Source: the user's attached `IMG_1632.heic`, headed "Your projects will be
assessed across 4 criteria". It contains 17 bullets and no numerical weights.
Statuses reflect evidence in this review, not a predicted judge score.

| Rubric requirement                                           | Status                          | Demonstrable evidence                                                                         | Remaining action / owner / urgency                                                                                      |
| ------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Clarity of the client problem and pain point                 | Addressed                       | Student confusion becomes visible teacher learning-gap data                                   | State target instructor/course and pain in opening; pitch, now                                                          |
| Depth of analysis and assumptions under ambiguity            | Partial                         | Asked-about vs failed-task vs supported/independent evidence are distinguished                | State assumptions, stakeholder evidence and limitations; product/pitch, now                                             |
| Realistic client context and scope                           | Partial                         | Course-scoped teacher/student prototype, review gates, invitations                            | Explain demo accounts, source split, no production validation; product/integration, now                                 |
| Innovativeness of idea and approach                          | Partial                         | Closed feedback loop, not chat alone: assessment -> gap -> teacher response -> follow-up      | Explain differentiation; novelty is a judge assessment, not code-testable; pitch, now                                   |
| Clear articulation of the goal                               | Addressed                       | Identify a difficulty, support it, enable instructor action, check response                   | Use one explicit outcome sentence; pitch, now                                                                           |
| Degree of autonomy: planning, decision-making, action-taking | Partial                         | Routing, retrieval, checks, automatic gap creation and queued generation with approvals       | No autonomous planning loop. Describe bounded autonomy; agent team/pitch, now; expansion later                          |
| Sound agent architecture and reasoning flow                  | Partial                         | Real React -> Express/SQLite -> private Python -> QB path; recorded handoffs                  | TS teacher generators and Python student orchestration are not one unified multi-agent planner; architecture/pitch, now |
| Ambiguity, trade-offs and edge cases                         | Partial                         | Absent-source/out-of-course answers, uncertainty review, outage recovery, access checks       | Stream review semantics, unreadable-file policy, varied-course evaluation; AI/RAG/API, now/next                         |
| Explainability and transparent agent decisions               | Partial                         | Citations, source identities, review reasons, workflow steps and replay                       | No entailment proof; incomplete new-feature traces and page-level provenance; AI/backend/UI, important                  |
| Code quality and structure                                   | Addressed for reviewed scope    | Modular services/repositories/routes, migrations, 368 passing tests, build/lint               | Not a full security/concurrency audit; retain limitations, engineering, ongoing                                         |
| UI clarity and simplicity                                    | Partial                         | Practical teacher dashboard, widened setup, preserved material controls and clear role errors | Split source locations and Coming soon feature need explanation/removal; UI/product, important                          |
| Ease of interaction and navigation                           | Addressed for tested flows      | All three demo identities, complete assessment/support loop, tab navigation, joining          | Browser/device/accessibility matrix incomplete; frontend QA, important                                                  |
| Professional visual quality                                  | Addressed for inspected screens | Desktop/mobile forms, chat, slides and connected workflow diagram                             | Long content/print/tablet edge cases remain; frontend QA, important                                                     |
| UI articulates agent interactions                            | Partial                         | Agent activity diagram with factual steps, status, teacher handoff and replay                 | New companion/slides not fully traced; UI/backend telemetry, important                                                  |
| Storytelling: problem -> solution -> impact                  | Prepared, not verified          | Companion demo script links real actions to the pain point                                    | Rehearse, avoid claiming measured impact; presenters, critical                                                          |
| Smooth live demo of real capabilities                        | Partial                         | Real gateway smoke tests, full support loop, refreshed runtime                                | Rehearse main demo DB/network; saved-output fallback; presenters/integration, critical                                  |
| Presenter engagement and communication                       | Not verified                    | Cannot be assessed from application behaviour                                                 | Time a live rehearsal and prepare handovers/Q&A; presenters, critical                                                   |

## Architecture pointers

- Permissions: `apps/backend/src/auth.ts`, class ownership/membership services.
- Durable evidence/review: `services/assessments.ts`, `learning.ts`,
  `agent-reviews.ts`, `workflow-traces.ts` under `apps/backend/src`.
- Study ingestion/stream: `services/study-assistant.ts`, `services/materials.ts`,
  `app/ai/http_api.py`, `app/ai/agents/study_agent.py`, `app/ai/rag/retriever.py`.
- Teacher quiz context: `apps/backend/src/agents/assessment.ts`.
- Slides and separate sources: `services/presentations.ts`, `services/sources.ts`.
- Companion class context: `apps/backend/src/services/companion.ts`.
- Student evidence display: `apps/frontend/src/pages/student/course-model.ts`.

The strongest honest demo is the closed learning loop plus one genuinely
file-grounded student answer. Prioritize those over a tour of every feature.
