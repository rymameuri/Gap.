# Practical demo guide

## Before the judges arrive

1. On the demo machine, pull the merged `main`, run `npm ci`, then `npm run dev`
   from the repository root. Local credentials belong in the ignored `.env`;
   do not show them on screen. The existing Python virtual environment is
   required for live AI. On this machine the refreshed app is at
   `http://127.0.0.1:3000/`.
2. Use a normal browser profile for the teacher and a separate private/profile
   session for the student. Two normal tabs share the same login cookie.
3. Sign in with the provided demo teacher/student accounts. Create a fresh
   course named "Greenhouse control lab". Import `demo-course-syllabus.txt`
   into its syllabus and save. Store `demo-calibration-addendum.txt` under
   Course files; wait for Indexed. These are fictional, non-sensitive facts.
4. Enrol the demo student or join with the course code. Generate a quiz on
   "Luma greenhouse control protocol". Review every question, expected answer,
   grading keyword and misconception tag before publishing. Keep a reviewed
   quiz ready; generation is nondeterministic and should not consume the pitch.
5. Rehearse one wrong answer leading to an open gap. Prepare a targeted
   explanation and follow-up, but leave approval for the live demo. Preserve a
   separate completed example as fallback. Do not claim a supported follow-up
   proves independent mastery.
6. Verify one real assistant answer immediately before the demo. Keep the
   saved conversation and workflow available if the gateway/network fails.
   A Live AI configured label alone is not a readiness check.

Do not use two accounts in the same browser session. Do not change the main DB
path to the temporary QA database: it contains deliberately artificial test
history and is not the presentation dataset.

## Five-minute route

| Time      | Screen / action                                  | Suggested narration                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00-0:30 | Teacher course Home                              | "An instructor sees assessment results, but often cannot see why students are stuck between assessments. We connect course-grounded support to an actionable teaching response."                                                         |
| 0:30-1:15 | Student Study Assistant                          | Ask: "From the calibration addendum, what are LUMA-DELTA's exact gain and checksum word? Cite the file." Show 0.375, cobalt-seven and the filename. "Those facts are in our uploaded file, not the syllabus or generic model knowledge." |
| 1:15-2:00 | Student reviewed quiz -> result                  | Submit a rehearsed incorrect ordering answer. "A question about a topic is not failure. An independently attempted answer gives us a different kind of evidence."                                                                        |
| 2:00-2:45 | Teacher Students -> Learning gaps / Explanations | Show the actual student gap. Open the prepared explanation, inspect/edit it, approve. "The system proposes support. The instructor controls what is shared."                                                                             |
| 2:45-3:30 | Student explanation -> follow-up -> My Progress  | Answer the supported follow-up correctly. Show Completed with support, then teacher Resolved. "We check the response to the intervention without calling assisted success independent mastery."                                          |
| 3:30-4:20 | Teacher Agent activity                           | Replay the corresponding real run. Explain access/context, retrieval, generation/check, review and persistence. "This is a recorded execution trace, not hidden model thought or a simulated live animation."                            |
| 4:20-5:00 | Teacher dashboard / closing                      | "Our value is the feedback loop: evidence informs teaching, teaching updates support, and the next response tells us whether to continue. Next we would evaluate teacher usefulness, source accuracy and learning outcomes."             |

For a shorter slot, use one completed quiz result instead of live typing every
answer, explicitly saying it is a saved test run. Keep the live file-grounded
question and teacher approval as the two main live actions.

## Optional extensions, only after the core loop

- Generate/review/publish a short slide deck; show it from the student Materials
  page. Speaker notes remain teacher-only. Print / Save PDF opens the browser
  print flow, not a server-side export.
- Ask Teaching companion for a warm-up informed by current class gaps. Its
  suggestions use class summary and teaching notes; they are not an autonomous
  intervention or a measured educational recommendation.
- Do not make wellbeing flags a headline demo. They are keyword heuristics
  requiring privacy and safeguarding decisions before real deployment.

## Honest answers to likely questions

- **What is agentic?** Bounded routing, retrieval, drafting, checks, gap
  processing and review handoffs. The prototype does not contain a general
  autonomous planner coordinating every instructor feature.
- **Do all uploaded files ground every output?** No. Study Assistant uses
  syllabus plus stored Course files. Quizzes currently use syllabus text.
  Slides use syllabus plus their separate uploaded-deck/link source collection.
- **Are citations proof an answer is correct?** No. They provide traceable
  source references and structural checks, not full factual entailment.
- **Does teacher review happen before any streamed text is visible?** Not for
  all text: checked blocks stream before final whole-answer completion. The
  final response can still be held. Do not promise a stricter gate than exists.
- **Have learning outcomes improved?** Not established. We demonstrated the
  workflow; outcome improvement needs an evaluation with instructors/students.

## Failure handling

- Gateway unavailable: acknowledge it, show the saved grounded answer and real
  recorded workflow. Do not pass a local canned response off as a live model.
- New quiz content is weak: stop, edit or reject it as part of human oversight;
  use the reviewed saved quiz for the next step.
- Role error: check which browser profile is signed in; do not weaken backend
  permissions to fix a shared-cookie session switch.
- A generated follow-up fails: inspect feedback. A new teacher-approved
  explanation is needed before another attempt; this is intentional.

No recording was produced because the application is not "perfectly complete"
and a live rehearsal on the presentation machine is still required. This route
focuses on capabilities exercised successfully, with explicit boundaries.
