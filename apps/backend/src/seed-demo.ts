import { createHash, randomUUID } from "node:crypto";
import type { Store } from "./db.js";
import type { Question } from "./agents/schemas.js";

interface DemoStudent {
  id: string;
  name: string;
}

const CLASS_ID = "physics";
const TEACHER_ID = "teacher";
const STUDENT_ID = "sara";

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const hoursAgo = (hours: number): string => minutesAgo(hours * 60);
const daysAgo = (days: number): string => hoursAgo(days * 24);

const NOTES: readonly { filename: string; text: string }[] = [
  {
    filename: "Unit 1 - Newton's laws.md",
    text: `# Unit 1: Newton's laws

## First law
An object keeps its velocity (constant speed in a straight line) unless a net force acts on it. Objects do not need a force to keep moving; a force is needed to change the motion.

## Second law
The net force on an object equals its mass times its acceleration (F = ma). Doubling the net force doubles the acceleration.

## Third law
When object A pushes on object B, B pushes back on A with an equal force in the opposite direction. The two forces act on different objects.

## Common mistake
"A moving object must have a force pushing it forward." On a rough surface a push balances friction; in space, no push is needed.
`,
  },
  {
    filename: "Unit 2 - Energy and work.md",
    text: `# Unit 2: Energy and work

## Conservation of energy
Energy is never created or destroyed. It changes form: kinetic, gravitational potential, elastic, thermal.

## Work
Work is force times distance moved in the direction of the force. Work is the transfer of energy.

## Braking
When a bicycle brakes, its kinetic energy becomes thermal energy in the brake pads and the surroundings. The energy is transferred, not lost.
`,
  },
  {
    filename: "Unit 3 - Series circuits.md",
    text: `# Unit 3: Series circuits

## Current
In a series circuit the same current flows through every component. Current is not used up: charge flows around the loop.

## Energy
A bulb transfers electrical energy into light and heat. The energy carried by each unit of charge drops across the bulb, but the current stays the same.

## Voltage
The battery voltage is shared between the components in series.
`,
  },
];

function choice(
  id: string,
  prompt: string,
  topic: { title: string; tag: string; section: string },
  options: string[],
  correctAnswer: string,
): Question {
  return {
    id,
    prompt,
    topic: topic.title,
    tag: topic.tag,
    section: topic.section,
    kind: "choice",
    options,
    correctAnswer,
    keywords: [],
    rubric: "1 point for the correct option.",
    maxPoints: 1,
  };
}

/**
 * Fills the demo teacher and demo student accounts so every feature has
 * something to show. Runs inside the seed transaction, after the base data.
 */
export function seedDemoExtras(
  store: Store,
  students: readonly DemoStudent[],
): void {
  const force = {
    title: "Force and motion",
    tag: "Constant motion needs a constant force",
    section: "Unit 1 - Newton's laws",
  };
  const energy = {
    title: "Energy and work",
    tag: "Energy disappears when an object stops",
    section: "Unit 2 - Conservation of energy",
  };
  const circuits = {
    title: "Electric circuits",
    tag: "Current gets used up by a bulb",
    section: "Unit 3 - Series circuits",
  };

  // Course materials (Materials tab, and what the Study Assistant cites).
  const files = NOTES.map(({ filename, text }, index) => {
    const data = new TextEncoder().encode(text);
    const id = `demo-file-${String(index + 1)}`;
    store.run(
      "INSERT INTO course_files(id,class_id,uploaded_by,filename,mime_type,size_bytes,sha256,content,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        CLASS_ID,
        TEACHER_ID,
        filename,
        "text/markdown",
        data.length,
        createHash("sha256").update(data).digest("hex"),
        data,
        "indexed",
        daysAgo(14 - index),
      ],
    );
    store.run("INSERT INTO course_file_text(file_id,text) VALUES(?,?)", [
      id,
      text,
    ]);
    return { id, filename };
  });
  const unit1 = files[0];
  const unit2 = files[1];
  if (!unit1 || !unit2) throw new Error("Demo course files are missing");

  store.run(
    "INSERT INTO sources(id,class_id,type,name,url,status,error,content,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [
      "demo-source-deck",
      CLASS_ID,
      "deck",
      "Week 1 lecture - Forces.pptx",
      null,
      "ready",
      null,
      "Slide 1: What is a force? Slide 2: Newton's first law. Slide 3: Friction and constant velocity. Slide 4: Worked example - hockey puck.",
      daysAgo(12),
    ],
  );
  store.run(
    "INSERT INTO sources(id,class_id,type,name,url,status,error,content,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [
      "demo-source-link",
      CLASS_ID,
      "link",
      "PhET - Circuit Construction Kit",
      "https://phet.colorado.edu/en/simulations/circuit-construction-kit-dc",
      "ready",
      null,
      "Interactive simulation for building series and parallel circuits and measuring current and voltage.",
      daysAgo(6),
    ],
  );

  // Slide decks: one published for students, one still a draft.
  store.run(
    "INSERT INTO presentations(id,class_id,title,slides,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?)",
    [
      "demo-deck-published",
      CLASS_ID,
      "Newton's first law: why things keep moving",
      JSON.stringify([
        {
          title: "Does motion need a force?",
          bullets: [
            "Common belief: a moving object needs a constant push",
            "Newton's first law says otherwise",
          ],
          notes: "Open by asking students to predict what a puck on ice does.",
        },
        {
          title: "Net force decides the motion",
          bullets: [
            "Zero net force: velocity stays constant",
            "Non-zero net force: velocity changes",
            "Friction is a force that acts against motion",
          ],
          notes: "Draw the free-body diagram for the puck.",
        },
        {
          title: "Check your understanding",
          bullets: [
            "A spacecraft coasts far from any planet",
            "What net force keeps it moving?",
          ],
          notes: "Take answers by show of hands before revealing.",
        },
      ]),
      "published",
      daysAgo(9),
      daysAgo(8),
      daysAgo(8),
    ],
  );
  store.run(
    "INSERT INTO presentations(id,class_id,title,slides,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?)",
    [
      "demo-deck-draft",
      CLASS_ID,
      "Where does the energy go? (draft)",
      JSON.stringify([
        {
          title: "Energy is transferred, not lost",
          bullets: [
            "Braking: kinetic to thermal",
            "Friction warms the surfaces",
          ],
          notes: "Use the bicycle example from Quiz 1.",
        },
      ]),
      "draft",
      hoursAgo(20),
      hoursAgo(20),
      null,
    ],
  );

  // A published earlier quiz with graded submissions, plus a draft for editing.
  const q0 = [
    choice(
      "q1",
      "A hockey puck slides at constant velocity on ice. The net force on it is...",
      force,
      ["Zero", "Forward", "Backward"],
      "Zero",
    ),
    choice(
      "q2",
      "Which statement about a moving object is correct?",
      force,
      [
        "It needs a constant force to keep moving",
        "It keeps its velocity if the net force is zero",
        "It slows down even with zero net force",
      ],
      "It keeps its velocity if the net force is zero",
    ),
    choice(
      "q3",
      "A bulb in a series circuit uses up some of the current.",
      circuits,
      ["True", "False"],
      "False",
    ),
  ];
  store.run("INSERT INTO quizzes VALUES(?,?,?,?,?,?,?)", [
    "quiz-0",
    CLASS_ID,
    "Force and motion - Quiz 0",
    JSON.stringify(q0),
    "published",
    "local",
    daysAgo(10),
  ]);
  const wrong: Record<string, string> = {
    q1: "Forward",
    q2: "It needs a constant force to keep moving",
    q3: "True",
  };
  const right: Record<string, string> = {
    q1: "Zero",
    q2: "It keeps its velocity if the net force is zero",
    q3: "False",
  };
  students.slice(0, 16).forEach((student, index) => {
    // Earlier students miss more, which matches the seeded gap counts.
    const misses = index < 5 ? 3 : index < 12 ? 2 : 1;
    const answers = Object.fromEntries(
      q0.map((q, i) => [q.id, i < 3 - misses ? right[q.id] : wrong[q.id]]),
    ) as Record<string, string>;
    const results = q0.map((q) => ({
      questionId: q.id,
      score: answers[q.id] === q.correctAnswer ? 1 : 0,
      confidence: 1,
      tag: answers[q.id] === q.correctAnswer ? null : q.tag,
      reason:
        answers[q.id] === q.correctAnswer
          ? "Correct."
          : "Incorrect option selected.",
    }));
    const score = results.reduce((sum, r) => sum + r.score, 0);
    store.run("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
      randomUUID(),
      "quiz-0",
      student.id,
      JSON.stringify(answers),
      JSON.stringify(results),
      score,
      3,
      1,
      "graded",
      null,
      daysAgo(9),
    ]);
  });
  store.run("INSERT INTO quizzes VALUES(?,?,?,?,?,?,?)", [
    "quiz-draft",
    CLASS_ID,
    "Electric circuits - Quiz 2 (draft)",
    JSON.stringify([
      choice(
        "q1",
        "Two bulbs are in series. How does the current in bulb A compare with bulb B?",
        circuits,
        ["A is larger", "B is larger", "They are the same"],
        "They are the same",
      ),
      choice(
        "q2",
        "What happens to the current after it passes through a bulb?",
        circuits,
        ["It is used up", "It stays the same", "It doubles"],
        "It stays the same",
      ),
    ]),
    "draft",
    "local",
    hoursAgo(5),
  ]);

  // Sara has already resolved one gap and struggled with another.
  const saraGaps = store.all<{ id: string; topic: string }>(
    "SELECT id,topic FROM gaps WHERE class_id=? AND student_id=?",
    [CLASS_ID, STUDENT_ID],
  );
  const energyGap = saraGaps.find((g) => g.topic === energy.title);
  const circuitGap = saraGaps.find((g) => g.topic === circuits.title);
  if (!energyGap || !circuitGap)
    throw new Error("Sara's demo gaps are missing");
  const probeFor = (topic: typeof energy, prompt: string, options: string[]) =>
    choice("recheck", prompt, topic, options, options[1] ?? "");
  const energyProbe = probeFor(
    energy,
    "A sliding block stops because of friction. What happens to its kinetic energy?",
    ["It is destroyed", "It transfers into thermal energy", "It becomes mass"],
  );
  store.run("INSERT INTO interventions VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
    "demo-energy-explainer",
    CLASS_ID,
    energy.title,
    energy.tag,
    "Energy changes form; it does not disappear. When a bicycle brakes, kinetic energy becomes thermal energy in the brakes and surroundings. The total energy stays the same.",
    JSON.stringify(energyProbe),
    JSON.stringify([energyGap.id]),
    "approved",
    "local",
    daysAgo(3),
    daysAgo(2),
  ]);
  store.run(
    "UPDATE gaps SET status='resolved',intervention_id=?,updated_at=? WHERE id=?",
    ["demo-energy-explainer", daysAgo(1), energyGap.id],
  );
  store.run("INSERT INTO probes VALUES(?,?,?,?,?,?)", [
    randomUUID(),
    energyGap.id,
    STUDENT_ID,
    "It transfers into thermal energy",
    1,
    daysAgo(1),
  ]);
  store.run("INSERT INTO gap_resolutions VALUES(?,?,?)", [
    energyGap.id,
    "submission-1",
    daysAgo(1),
  ]);

  const circuitProbe = probeFor(
    circuits,
    "Two bulbs are in series. How does the current through the first compare with the second?",
    [
      "The first receives more",
      "Both carry the same current",
      "The second receives more",
    ],
  );
  store.run("INSERT INTO interventions VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
    "demo-circuit-explainer",
    CLASS_ID,
    circuits.title,
    circuits.tag,
    "In a series circuit the same current passes through every component. A bulb transfers electrical energy into light and heat, but charge keeps flowing around the loop rather than being consumed.",
    JSON.stringify(circuitProbe),
    JSON.stringify([circuitGap.id]),
    "approved",
    "local",
    daysAgo(2),
    daysAgo(1),
  ]);
  store.run(
    "UPDATE gaps SET status='struggling',intervention_id=?,updated_at=? WHERE id=?",
    ["demo-circuit-explainer", hoursAgo(6), circuitGap.id],
  );
  store.run("INSERT INTO probes VALUES(?,?,?,?,?,?)", [
    randomUUID(),
    circuitGap.id,
    STUDENT_ID,
    "The first receives more",
    0,
    hoursAgo(6),
  ]);

  // Questions students asked the teacher.
  const asked: [string, string, string][] = [
    [
      "omar",
      "If nothing is pushing a moving object, why does it stop in real life?",
      hoursAgo(30),
    ],
    [
      "student-2",
      "Is heat a type of energy or a way energy moves?",
      hoursAgo(26),
    ],
    [
      STUDENT_ID,
      "Why does the current stay the same after the bulb if the bulb lights up?",
      hoursAgo(7),
    ],
    ["student-3", "Will Newton's third law be on the midterm?", hoursAgo(3)],
  ];
  for (const [studentId, text, at] of asked)
    store.run("INSERT INTO questions VALUES(?,?,?,?,?)", [
      randomUUID(),
      CLASS_ID,
      studentId,
      text,
      at,
    ]);

  // Wellbeing check-ins in different states.
  const flags: [string, string, string, string, string, string, string][] = [
    [
      "student-4",
      "question",
      "I'm honestly so stressed about the midterm, I can't sleep.",
      "anxiety",
      "medium",
      "new",
      hoursAgo(10),
    ],
    [
      "student-5",
      "assistant",
      "I feel like I'm too far behind and everyone else gets it.",
      "low_mood",
      "high",
      "reached_out",
      daysAgo(2),
    ],
    [
      "student-6",
      "question",
      "Thinking about dropping this course, it's too much.",
      "quitting",
      "low",
      "resolved",
      daysAgo(5),
    ],
  ];
  for (const [studentId, source, text, category, severity, status, at] of flags)
    store.run("INSERT INTO wellbeing_flags VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
      randomUUID(),
      CLASS_ID,
      studentId,
      source,
      text,
      category,
      severity,
      status,
      status === "new" ? "" : "Spoke after class; agreed a catch-up plan.",
      at,
      at,
    ]);

  // Sara's Study Assistant history: one grounded answer, one held for review.
  const cite = (file: { id: string; filename: string }) => ({
    documentId: file.id,
    title: file.filename,
    page: null,
    slide: null,
    chunkId: null,
  });
  const groundedId = randomUUID();
  store.run(
    "INSERT INTO conversations(id,class_id,student_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    [
      groundedId,
      CLASS_ID,
      STUDENT_ID,
      "Where does energy go when a bike brakes?",
      hoursAgo(28),
      hoursAgo(28),
    ],
  );
  const message = (
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    at: string,
    extra?: { sources: unknown[]; grounded: number; review: number },
  ): string => {
    const id = randomUUID();
    store.run(
      "INSERT INTO conversation_messages(id,conversation_id,role,content,sources,grounded,requires_human_review,created_at) VALUES(?,?,?,?,?,?,?,?)",
      [
        id,
        conversationId,
        role,
        content,
        extra ? JSON.stringify(extra.sources) : null,
        extra ? extra.grounded : null,
        extra ? extra.review : null,
        at,
      ],
    );
    return id;
  };
  message(
    groundedId,
    "user",
    "Where does energy go when a bike brakes?",
    hoursAgo(28),
  );
  message(
    groundedId,
    "assistant",
    "When a bicycle brakes, its kinetic energy is transferred into thermal energy in the brake pads and the surroundings. The energy is not lost: the total stays the same, it just changes form.",
    hoursAgo(28),
    { sources: [cite(unit2)], grounded: 1, review: 0 },
  );

  const reviewConversation = randomUUID();
  store.run(
    "INSERT INTO conversations(id,class_id,student_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    [
      reviewConversation,
      CLASS_ID,
      STUDENT_ID,
      "Does a bulb use up current?",
      hoursAgo(8),
      hoursAgo(8),
    ],
  );
  message(
    reviewConversation,
    "user",
    "Does a bulb use up current?",
    hoursAgo(8),
  );
  const heldMessage = message(
    reviewConversation,
    "assistant",
    "In a series circuit the current is the same before and after the bulb. The bulb transfers energy, but it does not use up the charge.",
    hoursAgo(8),
    { sources: [cite(unit1)], grounded: 0, review: 1 },
  );
  store.run(
    "INSERT INTO agent_reviews(id,class_id,student_id,conversation_id,message_id,kind,content,sources,issues,status,final_content,created_at,resolved_at,resolved_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      randomUUID(),
      CLASS_ID,
      STUDENT_ID,
      reviewConversation,
      heldMessage,
      "study_response",
      "In a series circuit the current is the same before and after the bulb. The bulb transfers energy, but it does not use up the charge.",
      JSON.stringify([cite(unit1)]),
      JSON.stringify([
        "The cited source covers Newton's laws, not circuits.",
        "Answer could not be fully verified against the course material.",
      ]),
      "pending",
      null,
      hoursAgo(8),
      null,
      null,
    ],
  );

  // Teacher's AI companion chat.
  const chatId = randomUUID();
  store.run(
    "INSERT INTO companion_chats(id,class_id,teacher_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    [
      chatId,
      CLASS_ID,
      TEACHER_ID,
      "How should I teach Newton's first law to the class?",
      hoursAgo(12),
      hoursAgo(12),
    ],
  );
  const companion = (role: "user" | "assistant", content: string) => {
    store.run(
      "INSERT INTO companion_messages(id,class_id,teacher_id,chat_id,role,content,sources,created_at) VALUES(?,?,?,?,?,?,?,?)",
      [
        randomUUID(),
        CLASS_ID,
        TEACHER_ID,
        chatId,
        role,
        content,
        JSON.stringify(role === "assistant" ? [cite(unit1)] : []),
        hoursAgo(12),
      ],
    );
  };
  companion("user", "How should I teach Newton's first law to the class?");
  companion(
    "assistant",
    "12 of 24 students hold the misconception that constant motion needs a constant force, so start with a prediction task: ask what a puck does on frictionless ice, then contrast it with a rough surface. Follow with the spacecraft example from the follow-up check to confirm the idea transfers.",
  );

  // Activity log and workflow traces.
  store.event(CLASS_ID, "Assessment", "Quiz 0 published", { quizId: "quiz-0" });
  store.event(CLASS_ID, "Diagnostic", "Gaps updated from Quiz 0", {
    students: 16,
  });
  store.event(
    CLASS_ID,
    "Content",
    "Explanation approved",
    { interventionId: "demo-energy-explainer" },
    STUDENT_ID,
  );
  store.event(
    CLASS_ID,
    "Verify",
    "Follow-up answered correctly - gap resolved",
    { topic: energy.title },
    STUDENT_ID,
  );
  store.event(
    CLASS_ID,
    "Verify",
    "Follow-up answered incorrectly - flagged for teacher",
    { topic: circuits.title },
    STUDENT_ID,
  );

  const run = store.one<{ id: string }>(
    "SELECT id FROM workflow_runs WHERE id=?",
    ["demo-run-quiz"],
  );
  if (run) return;
  store.run(
    "INSERT INTO workflow_runs(id,class_id,kind,title,status,student_id,job_id,entity_id,conversation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [
      "demo-run-quiz",
      CLASS_ID,
      "quiz_draft",
      "Draft: Electric circuits - Quiz 2",
      "awaiting_review",
      null,
      null,
      "quiz-draft",
      null,
      hoursAgo(5),
      hoursAgo(5),
    ],
  );
  const steps: [string, string, string, string][] = [
    [
      "Assessment agent",
      "Read course material",
      "Retrieved Unit 3 notes",
      "complete",
    ],
    [
      "Assessment agent",
      "Drafted 2 questions",
      "Each linked to a misconception",
      "complete",
    ],
    [
      "Teacher",
      "Review and publish",
      "Waiting for teacher approval",
      "pending",
    ],
  ];
  steps.forEach(([actor, action, detail, state], index) => {
    store.run(
      "INSERT INTO workflow_steps(id,run_id,position,actor,action,detail,state,sources,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        randomUUID(),
        "demo-run-quiz",
        index + 1,
        actor,
        action,
        detail,
        state,
        "[]",
        hoursAgo(5),
      ],
    );
  });
}
