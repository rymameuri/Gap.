/** Curated teaching knowledge the companion can cite. Kept small and reviewable. */
export interface PedagogyDoc {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

export const PEDAGOGY_KB: PedagogyDoc[] = [
  {
    id: "kb-reteach",
    title: "Reteaching a topic most of the class missed",
    tags: ["reteach", "gap", "misconception", "whole class", "reteaching"],
    body: "Do not repeat the original lesson. Name the specific misconception, show a worked example that contradicts it, then have students fix a deliberately wrong solution. Follow with 3 short retrieval questions the next day and again a week later.",
  },
  {
    id: "kb-small-group",
    title: "Small-group intervention for a shared gap",
    tags: [
      "small group",
      "intervention",
      "struggling",
      "differentiation",
      "support",
    ],
    body: "Group 3-6 students who share the same open gap. Run 10-15 minutes: diagnose with one question, model one worked example aloud, students try a parallel problem while you circulate, close with an exit question. Keep the rest of the class on independent practice.",
  },
  {
    id: "kb-formative",
    title: "Quick formative checks",
    tags: [
      "formative",
      "assessment",
      "exit ticket",
      "check for understanding",
      "quiz",
    ],
    body: "Use exit tickets (1-3 questions), mini whiteboards, or a hinge question with distractors that map to known misconceptions. Review results the same day and sort students into secure, nearly there, and needs support.",
  },
  {
    id: "kb-feedback",
    title: "Feedback that changes work",
    tags: ["feedback", "grading", "comments", "improve"],
    body: 'Give feedback on one thing at a time, tied to the learning goal. Prefer a next-step prompt ("Show how you got from step 2 to 3") over praise or a score. Allow time in class to act on it.',
  },
  {
    id: "kb-explain",
    title: "Explaining a concept to a struggling learner",
    tags: ["explain", "struggling", "concept", "scaffold", "understand"],
    body: "Start from what the student already knows. Use one concrete example before the rule, then a second with a small change. Ask them to explain it back in their own words. Fade support: worked example, half-completed example, independent problem.",
  },
  {
    id: "kb-warmup",
    title: "Warm-ups that target prior gaps",
    tags: ["warm-up", "warmup", "starter", "do now", "retrieval", "spaced"],
    body: "Open each lesson with 3-4 retrieval questions: one from yesterday, one from last week, one on a known open gap. Low stakes, 5 minutes, answers reviewed immediately. Spaced retrieval beats re-reading.",
  },
  {
    id: "kb-differentiation",
    title: "Differentiating without creating three lessons",
    tags: [
      "differentiation",
      "mixed ability",
      "challenge",
      "extension",
      "support",
    ],
    body: "Keep one shared learning goal. Vary the entry point (worked example vs blank problem), the scaffolds available (hint cards), and the extension (apply in a new context). Let students choose a hint card rather than assigning levels.",
  },
  {
    id: "kb-wellbeing",
    title: "Responding to a wellbeing concern",
    tags: [
      "wellbeing",
      "flag",
      "stress",
      "anxiety",
      "check-in",
      "concern",
      "at risk",
    ],
    body: "Check in privately and briefly, listen more than advise, and do not diagnose. Follow your school safeguarding policy for anything serious and involve the counsellor. Record what you did. A flag is a prompt for a conversation, not a conclusion.",
  },
  {
    id: "kb-participation",
    title: "Raising participation and confidence",
    tags: ["participation", "engagement", "quiet", "confidence", "motivation"],
    body: "Use think-pair-share and cold-call with a warm tone and thinking time. Normalise errors by showing a wrong answer and asking what is useful about it. Praise strategy and effort, not ability.",
  },
  {
    id: "kb-questioning",
    title: "Better questioning",
    tags: ["questioning", "discussion", "why", "probe", "higher order"],
    body: 'Ask fewer closed questions. Use "why", "what would change if...", and "convince me". Wait 3 seconds. Follow a right answer with a probing question to check it is understood, not guessed.',
  },
  {
    id: "kb-plan-unit",
    title: "Planning from gaps backwards",
    tags: ["plan", "lesson", "unit", "planning", "sequence", "prepare"],
    body: "Start from the assessment evidence: list the top open gaps, order them by prerequisite, and give each a lesson segment with a check at the end. Cut content that no student needs rather than covering everything.",
  },
  {
    id: "kb-ai-quiz",
    title: "Using generated quizzes well",
    tags: ["quiz", "generated", "ai", "review", "questions"],
    body: "Read every generated question before assigning: check the answer key, that distractors reflect real misconceptions, and that it matches what was taught. Edit or discard weak items. Use results to regroup students, not only to score.",
  },
];

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 2);

/** Keyword-scored retrieval; returns the best matches, or none when nothing fits. */
export function searchPedagogy(query: string, limit = 3): PedagogyDoc[] {
  const q = new Set(words(query));
  return PEDAGOGY_KB.map((doc) => {
    const hay = new Set(
      words(doc.title + " " + doc.tags.join(" ") + " " + doc.body),
    );
    let score = 0;
    for (const w of q) if (hay.has(w)) score += 1;
    for (const t of doc.tags) if (query.toLowerCase().includes(t)) score += 3;
    return { doc, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.doc);
}
