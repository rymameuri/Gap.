import { useEffect, useState } from "react";
import { ClassLink as Link } from "../../components/ClassLink";
import { Tabs, useTab, type TabDef } from "../../components/Tabs";
import { useTeacher } from "../../layouts/workspace";
import { ErrorBox, Title } from "../../components/ui";
import { post, put } from "../../services/api";
import {
  UrgentBanner,
  WellbeingFlags,
  openFlags,
} from "../../components/WellbeingFlags";
import { Students, GapDetails } from "./ClassDetails";
import {
  Assessments,
  ReviewQueue,
  ContentStudio,
  AgentActivity,
  useAction,
} from "./TeacherPages";

export function AssessmentsHub() {
  const { data } = useTeacher();
  const tabs: TabDef[] = [
    { id: "assessments", label: "Assessments" },
    { id: "review", label: "To review", count: data.reviews.length },
  ];
  const { active, select } = useTab(tabs);
  return (
    <>
      <Title
        label="ASSESSMENTS"
        heading="Assessments"
        description="Draft quizzes, publish them, and check uncertain grades."
      />
      <Tabs tabs={tabs} active={active} onSelect={select} />
      {active === "review" ? <ReviewQueue /> : <Assessments />}
    </>
  );
}

function Questions() {
  const { data } = useTeacher();
  return (
    <section className="panel">
      <h2>Questions from your class</h2>
      {data.asked.length ? (
        data.asked.map((q) => (
          <div className="question" key={q.id}>
            {q.text}
            <div className="muted">{q.student_name}</div>
          </div>
        ))
      ) : (
        <p className="muted">Questions your students ask will appear here.</p>
      )}
    </section>
  );
}

export function StudentsHub() {
  const { data } = useTeacher();
  const tabs: TabDef[] = [
    { id: "roster", label: "Roster" },
    { id: "gaps", label: "Learning gaps", count: data.clusters.length },
    {
      id: "flagged",
      label: "Flagged",
      count: openFlags(data.flags).length,
    },
    { id: "explanations", label: "Explanations" },
    { id: "questions", label: "Questions", count: data.asked.length },
  ];
  const { active, select } = useTab(tabs);
  return (
    <>
      <Title
        label="STUDENTS"
        heading="Students"
        description="Who needs help, on what, and what you've sent them."
      />
      {active !== "flagged" && (
        <UrgentBanner onOpen={() => select("flagged")} />
      )}
      <Tabs tabs={tabs} active={active} onSelect={select} />
      {active === "flagged" ? (
        <WellbeingFlags />
      ) : active === "gaps" ? (
        <GapDetails />
      ) : active === "explanations" ? (
        <ContentStudio />
      ) : active === "questions" ? (
        <Questions />
      ) : (
        <Students />
      )}
    </>
  );
}

export function Settings() {
  const { data, refresh } = useTeacher(),
    action = useAction();
  const [name, setName] = useState(data.course.name),
    [email, setEmail] = useState("");
  useEffect(() => {
    setName(data.course.name);
  }, [data.course.id]);
  return (
    <>
      <Title
        label="SETTINGS"
        heading="Class settings"
        description="Name, class code, and who is enrolled."
      />
      {action.error && <ErrorBox message={action.error} />}
      <section className="panel settings-card">
        <h2>Class details</h2>
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await put("/teacher/classes/" + data.course.id, {
                name,
                syllabus: data.course.syllabus,
              });
              await refresh();
            }, "Class name saved.");
          }}
        >
          <label className="field" htmlFor="course-name">
            Course name
          </label>
          <input
            id="course-name"
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="muted">
            Class code: <code>{data.course.join_code}</code>. Students enter
            this to join.
          </p>
          <div className="settings-actions">
            <button className="btn" disabled={action.busy}>
              Save name
            </button>
          </div>
        </form>
      </section>
      <section className="panel settings-card">
        <h2>Enroll a student</h2>
        <form
          className="settings-form settings-enroll"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await post("/teacher/classes/" + data.course.id + "/enroll", {
                email,
              });
              setEmail("");
              await refresh();
            }, "Student enrolled.");
          }}
        >
          <label className="sr-only" htmlFor="enroll-email">
            Student email
          </label>
          <div className="settings-actions">
            <input
              id="enroll-email"
              type="email"
              required
              placeholder="Existing student account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn" disabled={action.busy}>
              Enroll student
            </button>
          </div>
        </form>
      </section>
      <section className="panel settings-card">
        <h2>Another class</h2>
        <div className="settings-actions">
          <Link className="btn" to="/teacher/classes/new">
            Create a new class
          </Link>
        </div>
      </section>
      <details className="panel activity-log">
        <summary>
          <strong>Agent activity log</strong>
        </summary>
        <AgentActivity />
      </details>
    </>
  );
}
