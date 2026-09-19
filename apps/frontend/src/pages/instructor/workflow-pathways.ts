import type { DiagramEdge, DiagramNode } from "./WorkflowDiagram";

export type PathwayId = "study" | "assessment" | "teaching";
export type Pathway = {
  id: PathwayId;
  label: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export const pathways: Pathway[] = [
  {
    id: "study",
    label: "Study answer",
    nodes: [
      {
        id: "question",
        actor: "Student",
        label: "Ask a course question",
        detail: "A student sends a question from a course conversation.",
        column: 0,
        row: 0,
        type: "person",
      },
      {
        id: "access",
        actor: "Course API",
        label: "Check access & context",
        detail:
          "The API checks enrollment and loads the current syllabus and conversation history.",
        column: 1,
        row: 0,
        type: "decision",
      },
      {
        id: "route",
        actor: "Orchestrator",
        label: "Route the request",
        detail:
          "The AI service selects the specialist for the request. Unavailable or unclear requests return a safe status.",
        column: 2,
        row: 0,
      },
      {
        id: "sources",
        actor: "Course sources",
        label: "Retrieve syllabus context",
        detail:
          "The Study workflow retrieves context from the saved syllabus. Stored downloadable files are not currently indexed.",
        column: 0,
        row: 1,
        type: "source",
      },
      {
        id: "study",
        actor: "Study agent",
        label: "Prepare an answer",
        detail:
          "The Study agent uses retrieved course context to prepare an explanation and source references.",
        column: 1,
        row: 1,
      },
      {
        id: "review",
        actor: "Review checks",
        label: "Release or hold",
        detail:
          "The response is checked before delivery. A held draft is sent to the instructor while the student sees a review notice.",
        column: 2,
        row: 1,
        type: "decision",
      },
      {
        id: "teacher",
        actor: "Instructor",
        label: "Review a held answer",
        detail:
          "The instructor can edit and approve, or reject, a held answer in the Review queue. Approval updates the student conversation.",
        column: 1,
        row: 2,
        type: "person",
      },
      {
        id: "answer",
        actor: "Student",
        label: "Receive the answer",
        detail:
          "A cleared response is saved to the conversation with any course citations returned by the service.",
        column: 2,
        row: 2,
        type: "result",
      },
    ],
    edges: [
      { from: "question", to: "access" },
      { from: "access", to: "route" },
      { from: "route", to: "study", fromSide: "bottom", toSide: "top" },
      { from: "sources", to: "study", source: true },
      { from: "study", to: "review" },
      {
        from: "review",
        to: "teacher",
        fromSide: "bottom",
        toSide: "top",
        label: "Needs review",
      },
      {
        from: "review",
        to: "answer",
        fromSide: "bottom",
        toSide: "top",
        label: "Cleared",
      },
      { from: "teacher", to: "answer", label: "Approved" },
    ],
  },
  {
    id: "assessment",
    label: "Assessment",
    nodes: [
      {
        id: "request",
        actor: "Instructor",
        label: "Request an assessment",
        detail:
          "The instructor chooses a topic and starts an assessment draft.",
        column: 0,
        row: 0,
        type: "person",
      },
      {
        id: "draft",
        actor: "Assessment",
        label: "Draft questions & rubric",
        detail:
          "The assessment service checks the syllabus and generates a draft. The configured engine may use live AI or the local Physics question bank.",
        column: 1,
        row: 0,
      },
      {
        id: "publish",
        actor: "Instructor",
        label: "Review & publish",
        detail:
          "The instructor checks the questions and rubric before publishing the assessment.",
        column: 2,
        row: 0,
        type: "person",
      },
      {
        id: "submit",
        actor: "Student",
        label: "Submit answers",
        detail:
          "The student completes the published assessment and submits answers for grading.",
        column: 2,
        row: 1,
        type: "person",
      },
      {
        id: "grade",
        actor: "Assessment",
        label: "Grade against the rubric",
        detail:
          "Answers are graded against the assessment rubric. Uncertain results can require instructor review.",
        column: 1,
        row: 1,
      },
      {
        id: "gate",
        actor: "Review gate",
        label: "Check grade confidence",
        detail:
          "The review gate holds uncertain grades. Cleared grades can update learning evidence immediately.",
        column: 0,
        row: 1,
        type: "decision",
      },
      {
        id: "approve",
        actor: "Instructor",
        label: "Check a held grade",
        detail:
          "The instructor reviews scores and feedback before approving a held grade.",
        column: 0,
        row: 2,
        type: "person",
      },
      {
        id: "diagnostic",
        actor: "Diagnostic",
        label: "Update learning evidence",
        detail:
          "Approved results update concept-level learning gaps. Held grades wait for approval.",
        column: 1,
        row: 2,
      },
      {
        id: "progress",
        actor: "Learning records",
        label: "Show results & gaps",
        detail:
          "Students see their results and instructors can identify topics that need targeted support.",
        column: 2,
        row: 2,
        type: "result",
      },
    ],
    edges: [
      { from: "request", to: "draft" },
      { from: "draft", to: "publish" },
      { from: "publish", to: "submit", fromSide: "bottom", toSide: "top" },
      { from: "submit", to: "grade", fromSide: "left", toSide: "right" },
      { from: "grade", to: "gate", fromSide: "left", toSide: "right" },
      {
        from: "gate",
        to: "approve",
        fromSide: "bottom",
        toSide: "top",
        label: "Needs review",
      },
      {
        from: "gate",
        to: "diagnostic",
        fromSide: "bottom",
        toSide: "top",
        label: "Cleared",
      },
      { from: "approve", to: "diagnostic", label: "Approved" },
      { from: "diagnostic", to: "progress" },
    ],
  },
  {
    id: "teaching",
    label: "Targeted support",
    nodes: [
      {
        id: "gap",
        actor: "Learning evidence",
        label: "Identify a learning gap",
        detail:
          "Assessment results surface topics where students need support. The instructor chooses a gap to address.",
        column: 0,
        row: 0,
        type: "source",
      },
      {
        id: "content",
        actor: "Content",
        label: "Draft focused support",
        detail:
          "The content service prepares an explanation and follow-up question for the selected gap.",
        column: 1,
        row: 0,
      },
      {
        id: "teacher",
        actor: "Instructor",
        label: "Approve & share",
        detail:
          "The instructor reviews or edits the explanation, then shares it with the affected students.",
        column: 2,
        row: 0,
        type: "person",
      },
      {
        id: "student",
        actor: "Student",
        label: "Answer the follow-up",
        detail:
          "The student studies the approved explanation and answers the follow-up question.",
        column: 2,
        row: 1,
        type: "person",
      },
      {
        id: "check",
        actor: "Content",
        label: "Check the response",
        detail:
          "The follow-up answer is checked against the prepared expected answer.",
        column: 1,
        row: 1,
      },
      {
        id: "diagnostic",
        actor: "Diagnostic",
        label: "Recheck the gap",
        detail:
          "The follow-up result updates the learning gap. A correct answer after support remains distinct from independent evidence.",
        column: 0,
        row: 1,
      },
      {
        id: "practice",
        actor: "Learning records",
        label: "Needs more support",
        detail:
          "An incorrect follow-up leaves the topic marked as needing more support.",
        column: 0,
        row: 2,
        type: "result",
      },
      {
        id: "resolved",
        actor: "Learning records",
        label: "Improved with support",
        detail:
          "A correct follow-up records improvement after the explanation, without claiming independent mastery.",
        column: 1,
        row: 2,
        type: "result",
      },
    ],
    edges: [
      { from: "gap", to: "content" },
      { from: "content", to: "teacher" },
      { from: "teacher", to: "student", fromSide: "bottom", toSide: "top" },
      { from: "student", to: "check", fromSide: "left", toSide: "right" },
      { from: "check", to: "diagnostic", fromSide: "left", toSide: "right" },
      {
        from: "diagnostic",
        to: "practice",
        fromSide: "bottom",
        toSide: "top",
        label: "Incorrect",
      },
      {
        from: "diagnostic",
        to: "resolved",
        fromSide: "bottom",
        toSide: "top",
        label: "Correct",
      },
    ],
  },
];
