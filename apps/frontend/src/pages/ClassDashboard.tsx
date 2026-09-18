import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Plus, Users, BookOpen, KeyRound } from "lucide-react";
import { api, post } from "../services/api";
import { useSession } from "../services/session";
import { Brand, ErrorBox } from "../components/ui";
import type { Course } from "../services/types";
type ClassCard = Course & {
  join_code?: string;
  students?: number;
  teacher_name?: string;
};

function classPath(role: "teacher" | "student", courseId: string) {
  return role === "teacher"
    ? `/teacher/overview?classId=${encodeURIComponent(courseId)}`
    : `/student/courses/${encodeURIComponent(courseId)}`;
}

export function ClassDashboard({ role }: { role: "teacher" | "student" }) {
  const { user, logout } = useSession(),
    navigate = useNavigate();
  const [courses, setCourses] = useState<ClassCard[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [form, setForm] = useState(false),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [syllabus, setSyllabus] = useState(""),
    [code, setCode] = useState(""),
    [created, setCreated] = useState<ClassCard | null>(null);
  async function load() {
    try {
      const result = await api<{ courses: ClassCard[] }>("/classes");
      setCourses(result.courses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load classes");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (role === "teacher") {
        const result = await post<{ id: string; join_code: string }>(
          "/teacher/classes",
          { name: name.trim(), syllabus },
        );
        setCreated({
          ...result,
          name: name.trim(),
          syllabus,
          material_version: 1,
        });
        setName("");
        setSyllabus("");
        setForm(false);
        await load();
      } else {
        const result = await post<{ id: string }>("/student/classes/join", {
          code: code.trim(),
        });
        navigate(classPath("student", result.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="class-dashboard">
      <header className="class-dash-header">
        <Brand />
        <div className="student-identity">
          <span className="avatar">
            {user?.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </span>
          <span>{user?.name}</span>
          <button
            className="btn small"
            onClick={async () => {
              await logout();
              navigate("/");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="class-dash-main">
        <div className="class-dash-title">
          <div>
            <div className="eyebrow">
              {role === "teacher" ? "YOUR CLASSROOMS" : "YOUR LEARNING SPACE"}
            </div>
            <h1>
              A place for every
              <br />
              <em>new possibility.</em>
            </h1>
            <p>
              {role === "teacher"
                ? "Bring your students together. Help every idea click."
                : "Your classes, your next steps, your next aha."}
            </p>
          </div>
          <button
            className="btn primary"
            onClick={() => {
              setForm(!form);
              setError("");
              setCreated(null);
            }}
          >
            <Plus size={17} />
            {role === "teacher" ? "Create a new class" : "Join class"}
          </button>
        </div>
        {error && <ErrorBox message={error} />}
        {created && (
          <section className="class-success" aria-live="polite">
            <div>
              <strong>{created.name} is ready.</strong>
              <p>Share this code with your students to invite them.</p>
            </div>
            <div className="class-code">
              <KeyRound size={17} />
              <code>{created.join_code}</code>
            </div>
            <Link
              className="btn"
              to={"/teacher/overview?classId=" + created.id}
            >
              Open class <ArrowUpRight size={15} />
            </Link>
          </section>
        )}
        {form && (
          <section className="class-form panel">
            <h2>
              {role === "teacher"
                ? "Start a new classroom"
                : "Find your classroom"}
            </h2>
            <p>
              {role === "teacher"
                ? "We’ll create a unique invitation code for you."
                : "Enter the eight-character code shared by your teacher."}
            </p>
            <form onSubmit={submit}>
              {role === "teacher" ? (
                <>
                  <label htmlFor="new-class-name">Class name</label>
                  <input
                    id="new-class-name"
                    required
                    minLength={3}
                    maxLength={150}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Introduction to Physics"
                  />
                  <label htmlFor="new-class-syllabus">
                    Syllabus{" "}
                    <span className="muted">(optional — add it later)</span>
                  </label>
                  <textarea
                    id="new-class-syllabus"
                    value={syllabus}
                    onChange={(e) => setSyllabus(e.target.value)}
                    maxLength={50000}
                    rows={3}
                    placeholder="Topics and learning objectives"
                  />
                </>
              ) : (
                <>
                  <label htmlFor="join-code">Class code</label>
                  <input
                    id="join-code"
                    required
                    pattern="[A-Za-z2-9]{8}"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="join-code-input"
                    placeholder="ABCDEFGH"
                    autoComplete="off"
                  />
                </>
              )}
              <div className="class-form-actions">
                <button disabled={busy} className="btn primary">
                  {busy
                    ? "Working…"
                    : role === "teacher"
                      ? "Create class"
                      : "Join class"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}
        <div className="class-section-heading">
          <h2>Your classes</h2>
          <span>
            {courses.length} {courses.length === 1 ? "class" : "classes"}
          </span>
        </div>
        {loading ? (
          <p>Loading your classes…</p>
        ) : (
          <div className="class-card-grid">
            {courses.map((course, index) => (
              <article
                className={"course-card tone-" + (index % 4)}
                key={course.id}
              >
                <Link
                  className="course-card-cover"
                  aria-label={"Open " + course.name}
                  to={classPath(role, course.id)}
                >
                  <BookOpen size={32} strokeWidth={1} />
                  <span className="course-card-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <ArrowUpRight size={20} />
                </Link>
                <div className="course-card-body">
                  <span className="eyebrow">
                    {role === "teacher" ? "CLASSROOM" : course.teacher_name}
                  </span>
                  <h3>
                    <Link to={classPath(role, course.id)}>{course.name}</Link>
                  </h3>
                  <div className="course-card-footer">
                    {role === "teacher" ? (
                      <>
                        <span>
                          <Users size={14} />
                          {course.students} students
                        </span>
                        <code title="Share this code with students">
                          {course.join_code}
                        </code>
                      </>
                    ) : (
                      <span>
                        Continue learning <ArrowUpRight size={14} />
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
            <button
              className="course-add-card"
              onClick={() => {
                setForm(true);
                setCreated(null);
              }}
            >
              <span className="course-add-icon">
                <Plus size={24} />
              </span>
              <strong>
                {role === "teacher"
                  ? "Create a new class"
                  : "Join another class"}
              </strong>
              <span>
                {role === "teacher"
                  ? "Make room for the next aha."
                  : "Good things start with a code."}
              </span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
