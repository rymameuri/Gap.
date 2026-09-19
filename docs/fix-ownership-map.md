# Fix ownership map (2026-09-19)

This map builds on the [interactive audit](demo-readiness-audit.md). "Fixed"
means the code is pushed and the relevant UI/build checks passed. "Open" means
the behavior or verification still needs work. Priority is relative to a demo
that presents the full teacher-to-student learning loop.

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

### 6. Correct new quiz does not close an older learning gap - open

- **Problem:** Sara's teacher-approved 4/4 Force and motion quiz appeared in
  results, but the topic still said "Needs practice" and remained on the
  revisit list.
- **Why:** Assessment grading records incorrect-answer gaps but does not
  reconcile older open gaps after later full-credit evidence. The frontend
  prioritizes an open gap over a newer quiz result.
- **Responsible layers:** Product evidence rule, backend diagnostic/assessment
  services, persistent gap state, and frontend progress derivation.
- **Change:** Decide whether a new independent full-credit assessment closes
  the matching misconception, and how recency and multiple questions/tags
  count. Apply the transition transactionally, preserve evidence provenance,
  refresh teacher clusters and student labels, and add cross-role tests.
- **Scope:** Cross-cutting. Existing `gaps.status` may support the transition;
  a stronger evidence-to-gap link may require a data-model migration.
- **Dependencies and risks:** Prematurely closing a gap would overstate mastery.
  Do not fix only the display while teacher and student data disagree.
- **Timing:** Fix before a demo that claims quizzes verify or close gaps.

### 7. Real syllabus and course-file upload is not connected - open

- **Problem:** `.txt` import only copies content into the syllabus field.
  PDF/DOCX/PPTX files cannot be uploaded, stored, or searched from the app.
- **Why:** Python parsers exist, but Express has no authorized upload and
  durable-material workflow; the AI sidecar indexes stored syllabus text only.
- **Responsible layers:** Frontend/UI, Express API integration, file storage
  and database metadata, Python RAG extraction/chunking/indexing, and agent
  source contracts.
- **Change:** Add authenticated upload/delete/version endpoints; validate
  type/size and ownership; store originals and extraction status; index chunks
  per course/version; expose citation-ready sources to the assistant and quiz
  generator. Show processing/error states to instructors.
- **Scope:** Cross-cutting and security-sensitive. It changes what counts as
  authoritative course content throughout teacher and student workflows.
- **Dependencies and risks:** File privacy, malware/format handling, quotas,
  re-indexing, stale citations, and model data-transfer approval.
- **Timing:** Before claiming file-grounded AI or demonstrating uploaded PDFs;
  otherwise defer and state the text-only boundary plainly.

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

### 10. Saved assistant drafts are browser-local, not durable conversations - open

- **Problem:** A student can resume a saved prompt in the same browser, but
  drafts and chat turns do not follow them across devices.
- **Why:** The frontend uses browser storage; the API accepts request history
  but does not persist authenticated conversation records.
- **Responsible layers:** Frontend, backend API, database/data model, and
  authentication/course authorization.
- **Change:** Add conversation/message tables and scoped CRUD endpoints;
  define retention and deletion; sync the assistant UI to server state.
- **Scope:** Student assistant only initially, with possible instructor
  analytics/privacy implications if conversations later become evidence.
- **Dependencies and risks:** Sensitive learning data, consent, retention,
  cross-device consistency, and migration of existing local drafts.
- **Timing:** Can wait for a single-device demo; needed for the stated resume
  previous-sessions product experience.

### 11. Python review queue is separate and in memory - open

- **Problem:** The Python agent has an in-memory human-review queue, but the
  instructor review screen uses Express/SQLite submissions. They are not one
  shared queue.
- **Why:** The Python service was integrated as a private model adapter while
  Express remains the durable workflow and source of authorization.
- **Responsible layers:** AI/agent orchestration, backend/API integration,
  database/data model if Python review items must persist, and instructor UI
  only if a new review type is exposed.
- **Change:** Choose Express/SQLite as the canonical queue and persist/route
  any additional Python review work into it, or keep Python's queue internal
  and stop implying it is visible to teachers.
- **Scope:** Cross-service contract, not a CSS or prompt change.
- **Dependencies and risks:** Duplicate approvals, lost in-memory items after
  restart, inconsistent authorization and audit history.
- **Timing:** Can wait if the Python queue is not a user-facing promise; fix
  before describing it as integrated teacher review.

### 12. Text-import edge case and unverified interactive controls - open

- **Problem:** The Class materials `.txt` importer silently ignores files
  over 200 KB. Native file selection and microphone dictation were not
  interactively tested in the audit.
- **Why:** The import handler returns without setting an error; browser
  automation could not drive the native file picker or microphone permission.
- **Responsible layers:** Frontend/UI for import feedback; QA/browser-device
  testing for file and microphone controls. No role-permission or RAG fix is
  required to show a validation error.
- **Change:** Show inline size/type/read errors and reset the file input;
  manually test valid/invalid `.txt` files and speech allow/deny states in
  Chrome. Add focused automated coverage where browser APIs can be mocked.
- **Scope:** Isolated input handling; it does not implement PDF/DOCX support.
- **Dependencies and risks:** Browser permissions and file-size limits must
  match backend validation. Avoid suggesting an imported file was indexed.
- **Timing:** Quick frontend fix and QA before using these controls in a demo.

## Recommended order

1. Complete the quick import validation and manual control checks (issue 12).
2. Resolve the mastery rule and make teacher/student state agree (issue 6).
3. Smoke-test the live assistant and, if needed, add honest unavailable states
   (issue 9).
4. Decide whether the demo claims arbitrary uploaded-course grounding. If it
   does, issues 7 and 8 are prerequisites, not polish.
5. Schedule durable conversations and Python review-queue consolidation based
   on the product scope (issues 10 and 11).
