import { randomUUID } from "node:crypto";
import { hashPassword, type Store } from "./db.js";
import { classCode } from "./join-codes.js";
import type { Question } from "./agents/schemas.js";
export const initialTopics = [
  {
    title: "Force and motion",
    tag: "Constant motion needs a constant force",
    section: "Unit 1 - Newton's laws",
    explanation:
      "An object keeps moving at a constant velocity when the net force is zero. A force changes its velocity; it does not maintain it. Think of a puck gliding on frictionless ice: it keeps moving without being pushed. On a rough surface, a push is needed to balance friction.",
    question:
      "A puck moves at constant velocity on frictionless ice. What is the net force?",
    options: [
      "Zero",
      "A force in the direction of motion",
      "A force opposite to motion",
    ],
    answer: 0,
    keywords: ["force", "velocity", "zero"],
    followup:
      "A spacecraft coasts in a straight line at constant speed, far from other objects. What net force maintains this motion?",
    followOptions: [
      "No net force is required",
      "A constant forward force",
      "A force that grows with speed",
    ],
    followAnswer: 0,
  },
  {
    title: "Energy and work",
    tag: "Energy disappears when an object stops",
    section: "Unit 2 - Conservation of energy",
    explanation:
      "Energy changes form; it does not disappear. When a bicycle brakes, kinetic energy becomes thermal energy in the brakes and surroundings. The bicycle loses kinetic energy, but the total energy is conserved.",
    question: "When a bicycle brakes, its kinetic energy mainly becomes...",
    options: ["Nothing", "Thermal energy", "Extra mass"],
    answer: 1,
    keywords: ["energy", "thermal", "heat", "conserved"],
    followup:
      "A sliding block stops because of friction. What happens to its kinetic energy?",
    followOptions: [
      "It is destroyed",
      "It transfers into thermal energy",
      "It becomes more mass",
    ],
    followAnswer: 1,
  },
  {
    title: "Electric circuits",
    tag: "Current gets used up by a bulb",
    section: "Unit 3 - Series circuits",
    explanation:
      "In a steady series circuit, the same current passes through every component. A bulb transfers electrical energy into light and heat. Charge flows around the circuit rather than being consumed.",
    question: "In a series circuit, the current before and after a bulb is...",
    options: ["Lower after the bulb", "Higher after the bulb", "The same"],
    answer: 2,
    keywords: ["current", "same", "charge", "energy"],
    followup:
      "Two bulbs are connected in series. How does the current through the first compare with the second?",
    followOptions: [
      "The first receives more current",
      "The second receives more current",
      "Both carry the same current",
    ],
    followAnswer: 2,
  },
];

type SeedTopic = (typeof initialTopics)[number];

const DEMO_CLASS = "physics";
const DEMO_TEACHER = "teacher";
const WELCOME_EXPLAINER = "welcome-explainer";

const STUDENT_NAMES = [
  "Sara Ahmed",
  "Omar Ali",
  "Lina Hassan",
  "Yusuf Khalid",
  "Noor Ibrahim",
  "Adam Saleh",
  "Maryam Omar",
  "Ali Saleh",
  "Hana Yusuf",
  "Zaid Ahmed",
  "Reem Khalid",
  "Faisal Noor",
  "Noura Ali",
  "Ahmed Sami",
  "Layla Adam",
  "Hamza Omar",
  "Salma Yusuf",
  "Tariq Ali",
  "Dana Hassan",
  "Rayan Khalid",
  "Maha Sami",
  "Bilal Noor",
  "Jana Ahmed",
  "Sami Ali",
];

// The first two students have fixed ids and emails used by the demo logins.
const DEMO_STUDENTS = STUDENT_NAMES.map((name, index) => ({
  id: index === 0 ? "sara" : index === 1 ? "omar" : `student-${String(index)}`,
  name,
  email:
    index === 0
      ? "student@gap.demo"
      : index === 1
        ? "omar@gap.demo"
        : `student${String(index)}@gap.demo`,
}));

function optionAt(options: readonly string[], index: number): string {
  const option = options[index];
  if (option === undefined)
    throw new Error(`Seed answer index ${String(index)} has no option`);
  return option;
}

function seedTopics(): [SeedTopic, SeedTopic, SeedTopic] {
  const [force, energy, circuits] = initialTopics;
  if (!force || !energy || !circuits)
    throw new Error("Seed data needs the three physics topics");
  return [force, energy, circuits];
}

/** Seeds the demo course and accounts into an empty database. No-op when any user exists. */
export function seed(store: Store, demoPassword: string): void {
  if (store.one("SELECT id FROM users LIMIT 1")) return;
  const now = new Date().toISOString(),
    password = hashPassword(demoPassword);
  const [force, energy, circuits] = seedTopics();
  // Open gaps per topic: the first students of the roster, most on force and motion.
  const gapPlan = [
    { topic: force, students: 12, severity: 3, question: 1 },
    { topic: energy, students: 8, severity: 2, question: 2 },
    { topic: circuits, students: 5, severity: 2, question: 3 },
  ];
  store.transaction(() => {
    store.run("INSERT INTO users VALUES(?,?,?,?,?)", [
      DEMO_TEACHER,
      "Dr. Amal Hassan",
      "teacher@gap.demo",
      "teacher",
      password,
    ]);
    for (const student of DEMO_STUDENTS)
      store.run("INSERT INTO users VALUES(?,?,?,?,?)", [
        student.id,
        student.name,
        student.email,
        "student",
        password,
      ]);
    store.run(
      "INSERT INTO classes(id,teacher_id,name,syllabus,material_version,join_code) VALUES(?,?,?,?,?,?)",
      [
        DEMO_CLASS,
        DEMO_TEACHER,
        "Introduction to Physics",
        "Unit 1: Forces and motion - Newton's laws\nUnit 2: Energy and work - Conservation of energy\nUnit 3: Electric circuits - Series circuits",
        1,
        classCode(store),
      ],
    );
    for (const student of DEMO_STUDENTS)
      store.run("INSERT INTO memberships VALUES(?,?)", [
        DEMO_CLASS,
        student.id,
      ]);
    for (const { topic, students, severity, question } of gapPlan)
      for (const student of DEMO_STUDENTS.slice(0, students))
        store.run("INSERT INTO gaps VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
          randomUUID(),
          DEMO_CLASS,
          student.id,
          topic.title,
          topic.tag,
          topic.section,
          "open",
          severity,
          `Quiz 1 - Question ${String(question)}`,
          null,
          now,
        ]);
    const probe: Question = {
      id: "recheck",
      prompt: force.followup,
      topic: force.title,
      tag: force.tag,
      section: force.section,
      kind: "choice",
      options: force.followOptions,
      correctAnswer: optionAt(force.followOptions, force.followAnswer),
      keywords: [],
      rubric: "1 point: applies the zero net force principle.",
      maxPoints: 1,
    };
    const gap = store.one<{ id: string }>(
      "SELECT * FROM gaps WHERE student_id=? AND topic=?",
      ["sara", force.title],
    );
    if (!gap) throw new Error("Seed gap for the welcome explainer is missing");
    store.run("INSERT INTO interventions VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
      WELCOME_EXPLAINER,
      DEMO_CLASS,
      force.title,
      force.tag,
      force.explanation,
      JSON.stringify(probe),
      JSON.stringify([gap.id]),
      "approved",
      "local",
      now,
      now,
    ]);
    store.run("UPDATE gaps SET status='ready',intervention_id=? WHERE id=?", [
      WELCOME_EXPLAINER,
      gap.id,
    ]);
    const questions: Question[] = [
      {
        id: "q1",
        prompt: energy.question,
        topic: energy.title,
        tag: energy.tag,
        section: energy.section,
        kind: "choice",
        options: energy.options,
        correctAnswer: optionAt(energy.options, energy.answer),
        keywords: [],
        rubric: "Correct energy transfer: 2 points.",
        maxPoints: 2,
      },
      {
        id: "q2",
        prompt: "Explain where the energy goes when a bicycle stops.",
        topic: energy.title,
        tag: energy.tag,
        section: energy.section,
        kind: "text",
        options: [],
        correctAnswer: energy.explanation,
        keywords: energy.keywords,
        rubric:
          "Energy transfers to heat in the brakes and surroundings: 2 points. Partial statement: 1 point.",
        maxPoints: 2,
      },
    ];
    store.run("INSERT INTO quizzes VALUES(?,?,?,?,?,?,?)", [
      "quiz-1",
      DEMO_CLASS,
      "Energy and work - Quiz 1",
      JSON.stringify(questions),
      "published",
      "local",
      now,
    ]);
    store.run("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
      "submission-1",
      "quiz-1",
      "sara",
      JSON.stringify({
        q1: "Nothing",
        q2: "The energy is lost from the bike when brakes stop it.",
      }),
      JSON.stringify([
        {
          questionId: "q1",
          score: 0,
          confidence: 1,
          tag: energy.tag,
          reason: "Incorrect energy transfer.",
        },
        {
          questionId: "q2",
          score: 1,
          confidence: 0.62,
          tag: energy.tag,
          reason:
            '"Lost" may refer to transfer to the surroundings. Teacher judgment is needed.',
        },
      ]),
      1,
      4,
      0.62,
      "pending",
      'Ambiguous use of "lost"; teacher review required.',
      now,
    ]);
    store.event(DEMO_CLASS, "Diagnostic", "Sample evidence analysed", {
      students: DEMO_STUDENTS.length,
      topics: gapPlan.length,
    });
    store.event(
      DEMO_CLASS,
      "Content",
      "Seed explanation approved",
      { interventionId: WELCOME_EXPLAINER },
      "sara",
    );
  });
}
