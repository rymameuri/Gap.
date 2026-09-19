# Fix ownership map (2026-09-19)

Historical ownership map. See the [final pre-demo review](final-pre-demo-review.md)
for current findings after the rymedits merge and live end-to-end checks.

This map builds on the [interactive audit](demo-readiness-audit.md). "Fixed"
means the code is pushed and the relevant checks passed. "Open" means the
behavior or verification still needs work. The backend/data update was checked
against 193 Node tests, 102 Python AI tests, and a production frontend build.
Priority is relative to a demo that presents the full learning loop.

## Quick UI and session fixes

### 1. Instructor dashboard tone and density - fixed

- **Problem:** The large inspirational headline and tall decorative course
  covers delayed access to the actual courses.
- **Why:** The shared dashboard used the student-facing promotional treatment
  for teachers as well.
- **Responsible layers:** Frontend/UI only.
- **Change:** The teacher variant now says "Courses", describes the available
  tasks, and uses compact course cards. The student variant is unchanged.
- **Scope:** Isolated to the instructor course list and its responsive CSS.
- **Dependencies and risks:** Visual regression at narrow widths; verify the
  create-class form remains easy to reach.
- **Timing:** Done in `9cd29ec`.

### 2. Instructor page language and overview metrics - fixed

- **Problem:** Headings such as "A little human judgment" obscured page
  purpose, while four metric cards wrapped awkwardly at medium widths.
- **Why:** Editorial copy and a four-column breakpoint were applied to an
  operational workspace.
- **Responsible layers:** Frontend/UI only.
- **Change:** Page headings now name assessments, grades, explanations,
  materials, and activity; medium-width metrics use a denser two-column grid.
- **Scope:** Instructor pages and overview presentation, not business logic.
- **Dependencies and risks:** Visual checks at desktop and narrow viewports.
- **Timing:** Done in `4d0b0dc`.

### 3. Course creation and navigation friction - fixed, with a file limit

- **Problem:** The create form was narrow, its syllabus label implied more
  than text entry, and opening a course could land halfway down the page.
- **Why:** Form sizing, ambiguous copy, and missing route-scroll handling.
- **Responsible layers:** Frontend/UI only for the fixes already made.
- **Change:** Wider form, focused/visible inputs, explicit syllabus-text
  label, editable `.txt` import, and scroll reset on route changes.
- **Scope:** Teacher creation and shared page navigation; the `.txt` import
  fills a text field, not a document store. Full uploads are issue 7.
- **Dependencies and risks:** Native file-picker and import error paths still
  need hands-on verification (issue 12).
- **Timing:** Done in `304c800` and `88827d9`.

### 4. Physics topic prefilled in every new course - fixed

- **Problem:** A non-Physics course offered "Force and motion" as its initial
  quiz topic.
- **Why:** The field and suggestions were hard-coded to the demo course.
- **Responsible layers:** Frontend/UI for the default; backend/AI for the
  separate inability to generate other local topics (issue 8).
- **Change:** New courses start with a blank topic; the UI explains the local
  engine's limits. The seeded Physics course retains its useful default.
- **Scope:** Assessment setup only; no quiz-generation behavior was changed.
- **Dependencies and risks:** Class switching must reset the topic and draft.
- **Timing:** Done in `3e56173`.

### 5. Stale teacher screen after another tab signs in as student - fixed

- **Problem:** Teacher actions displayed "Teacher access is required" even
  while the old tab still looked signed in as a teacher.
- **Why:** Same-origin tabs share one session cookie, but React had retained
  the old teacher identity. The backend correctly rejected the student cookie.
- **Responsible layers:** Frontend session/UI. Backend role checks were not
  the fault and must remain enforced.
- **Change:** Session refresh on cross-tab sign-in/out, focus, and visibility;
  show a clear role-switch screen rather than a stale teacher workspace.
- **Scope:** All roles and tabs; normal single-role teacher publishing worked
  in the isolated action test.
- **Dependencies and risks:** Simultaneous teacher and student sessions in one
  browser profile remain impossible by design. Changing that would require an
  authentication/session architecture decision, not weaker permissions.
- **Timing:** UI fix done in `677c0b2`; separate simultaneous sessions can wait
  unless the product explicitly requires them.

## Functional and architectural work

### 6. Correct new quiz does not close an older learning gap - fixed

- **Problem:** Sara's teacher-approved 4/4 Force and motion quiz appeared in
  results, but the topic still said "Needs practice" and remained on the
  revisit list.
- **Why:** Assessment grading recorded incorrect-answer gaps but did not
  reconcile older open gaps after later full-credit evidence. The frontend
  prioritized an open gap over a newer quiz result.
- **Responsible layers:** Product evidence rule, backend diagnostic/assessment
  services, persistent gap state, and frontend progress derivation.
- **Change:** A published quiz now resolves a matching existing gap only when
  every question for that misconception tag receives full credit. The
  resolution links to the submission, and student progress uses that evidence
  to distinguish independent success from an instructor-guided follow-up.
- **Scope:** Backend diagnostic state, a new provenance table, and student
  progress labels. Pending grades still wait for teacher approval.
- **Dependencies and risks:** The rule is intentionally conservative, but a
  different mastery policy would need product and cross-role test updates.
- **Timing:** Done in `adb791e`.

### 7. Course-file persistence is implemented; AI indexing remains open

- **Problem:** Teachers can now store and share original files, but those files
  are not searched by the assistant or quiz generator.
- **Why:** Express now has authorized upload/list/download/delete APIs and
  SQLite byte storage. The teammate's document reader can also extract a
  PDF/DOCX/PPTX into editable syllabus text. Neither path indexes stored file
  chunks into the agent retrieval workflow.
- **Responsible layers:** Backend/data and frontend storage are implemented;
  Python RAG, agent source contracts, and cross-service integration remain.
- **Change:** Index stored files per course/version, persist extraction status
  and citation-ready chunk references, then connect retrieval to both study
  and quiz generation. The current file status is explicitly `stored`.
- **Scope:** Cross-cutting and security-sensitive; it changes authoritative
  course content for both roles.
- **Dependencies and risks:** File privacy, format validation, scanning,
  quotas, re-indexing, stale citations, and model data-transfer approval.
- **Timing:** Storage done in `5222bae`; indexing is required before claiming
  uploaded-file-grounded AI.

### 8. Quiz generation beyond the Physics demo bank - open

- **Problem:** The local engine drafts only three seeded Physics topics.
  Live AI receives the topic and current syllabus text, not uploaded files.
- **Why:** The fallback selects fixed questions by topic; the live prompt has
  no document-retrieval tool or file-source contract in this path.
- **Responsible layers:** Backend assessment provider, AI/agent workflow,
  LLM prompt/output validation, RAG/content retrieval, and API integration.
- **Change:** For arbitrary courses, require the live model or an explicitly
  broader local bank. Once issue 7 exists, retrieve authorized material chunks,
  include source IDs in the quiz schema/prompt, and validate that questions and
  answer keys are supported by those sources before teacher review.
- **Scope:** Cross-cutting for non-Physics courses; current demo-bank behavior
  can remain as a clearly labeled offline fallback.
- **Dependencies and risks:** Model hallucinations, unsupported answer keys,
  source-version changes, latency/cost, and evaluation of quiz quality.
- **Timing:** Before demoing novel quizzes for a new subject. Prompt-only
  changes cannot substitute for the missing retrieval and upload path.

### 9. Study Assistant availability and live response verification - open

- **Problem:** On the isolated local engine, an assistant question returned
  HTTP 503. The main development server reports `live-ai` configured, but a
  course-grounded response was not smoke-tested with current course content.
- **Why:** The student endpoint requires the private Python sidecar and model;
  there is no local teaching-bank assistant fallback. Health alone does not
  prove a model answer succeeds.
- **Responsible layers:** AI service/deployment and gateway credentials,
  Express-to-FastAPI API integration, RAG, and frontend availability states.
- **Change:** Run an end-to-end smoke test with an approved non-private course
  fixture; verify answer, citations, and failure behavior. Either provide an
  offline fallback or show an upfront unavailable state when the sidecar is
  down. Distinguish missing syllabus from temporary model failure.
- **Scope:** Student assistant and demo operations. Teacher authoring can
  still work through the local bank when AI is down.
- **Dependencies and risks:** External gateway reliability, secret management,
  privacy permission for course material, rate limits, and response quality.
- **Timing:** Before a demo that promises live student chat.

### 10. Conversations are durable; unsent drafts remain browser-local

- **Problem:** Sent conversations now follow the student across devices, but
  unsent saved drafts still live only in that browser.
- **Why:** The new server conversation/message store is separate from the
  existing browser-local draft feature.
- **Responsible layers:** Frontend, backend API, database/data model, and
  authentication/course authorization.
- **Change:** Conversation/message tables and course-scoped APIs now persist
  turns, rebuild trusted history, and support deletion. Draft syncing would
  require a separate record and API if the product needs it.
- **Scope:** Student assistant only initially, with possible instructor
  analytics/privacy implications if conversations later become evidence.
- **Dependencies and risks:** Sensitive learning data and retention policy still
  need a deployment decision; existing local drafts are not migrated.
- **Timing:** Durable conversations done in `5222bae`; cross-device unsent
  drafts can wait.

### 11. Student-facing AI review now reaches the instructor queue

- **Problem:** Previously, a held Study Assistant answer stayed in Python's
  in-memory queue and was invisible to the instructor.
- **Why:** The private model adapter did not transfer the review payload to
  Express, which owns durable workflow and authorization.
- **Responsible layers:** AI/agent orchestration, backend/API integration,
  database/data model if Python review items must persist, and instructor UI
  only if a new review type is exposed.
- **Change:** The sidecar transfers held study output to Express, which stores
  it in SQLite and exposes it on the teacher review screen. Approval or
  rejection updates the student's durable conversation. Python's queue is
  consumed at handoff. Other standalone Python agent workflows are not used by
  this Express screen and would need the same contract if activated later.
- **Scope:** Cross-service contract plus instructor UI; existing quiz grade
  reviews remain in their established Express queue.
- **Dependencies and risks:** Review transfer is not a distributed transaction:
  a failed backend save returns an error so the student can retry. Audit and
  retention policy still need deployment decisions.
- **Timing:** Student-facing path done in `5222bae`; future Python workflows
  should use the same canonical queue.

### 12. Text-import validation fixed; device controls still need QA

- **Problem:** The earlier audit found a silent size rejection. Current code
  shows an inline error for oversized `.txt` imports; native file selection and
  microphone dictation remain unverified on a real device.
- **Why:** The UI validation was corrected in teammate updates. The available
  browser automation did not exercise OS file picking or microphone permission.
- **Responsible layers:** Frontend/UI for import feedback; QA/browser-device
  testing for file and microphone controls. No role-permission or RAG fix is
  required to show a validation error.
- **Change:** Keep the inline validation; manually test valid/invalid files
  and speech allow/deny states in Chrome. Add focused browser tests where APIs
  can be mocked.
- **Scope:** Isolated input handling; it is separate from document extraction
  and stored-file indexing.
- **Dependencies and risks:** Browser permissions and file-size limits must
  match backend validation. Avoid suggesting an imported file was indexed.
- **Timing:** Validation fixed; manual device QA remains before demoing these
  controls.

## Recommended order

1. Smoke-test the live assistant with an approved fixture (issue 9).
2. Decide whether the demo claims arbitrary uploaded-course grounding. If it
   does, file indexing (issue 7) and source-grounded generation (issue 8) are
   prerequisites, not polish.
3. Manually check native file selection and speech permissions (issue 12).
4. Set retention rules for conversations and review data before deploying
   outside the demo environment (issues 10 and 11).
