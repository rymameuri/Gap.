import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Plus,
  Users,
  BookOpen,
  KeyRound,
  Mail,
} from "lucide-react";
import { api, post } from "../services/api";
import { useSession } from "../services/session";
import { Brand, ErrorBox } from "../components/ui";
import type { Course, StudentInvitation } from "../services/types";
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
    navigate = useNavigate(),
    location = useLocation();
  const [courses, setCourses] = useState<ClassCard[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [form, setForm] = useState(false),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState(""),
    [created, setCreated] = useState<ClassCard | null>(
      (location.state as { created?: ClassCard } | null)?.created ?? null,
    ),
    [invitations, setInvitations] = useState<StudentInvitation[]>([]),
    [answering, setAnswering] = useState(""),
    [accepted, setAccepted] = useState<{ id: string; name: string } | null>(
      null,
    );
  const formRef = useRef<HTMLElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const result = await api<{ courses: ClassCard[] }>("/classes");
      setCourses(result.courses);
      if (role === "student")
        setInvitations(
          (
            await api<{ invitations: StudentInvitation[] }>(
              "/student/invitations",
            )
          ).invitations,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load classes");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!form) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    firstInputRef.current?.focus({ preventScroll: true });
  }, [form]);
  async function answer(invitation: StudentInvitation, accept: boolean) {
    setAnswering(invitation.id);
    setError("");
    setAccepted(null);
    try {
      await post(
        "/student/invitations/" +
          encodeURIComponent(invitation.id) +
          (accept ? "/accept" : "/decline"),
      );
      if (accept)
        setAccepted({ id: invitation.class_id, name: invitation.class_name });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again");
      await load();
    } finally {
      setAnswering("");
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      {
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
    <div
      className={`class-dashboard ${role === "teacher" ? "teacher-dashboard" : ""}`}
    >
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
              {role === "teacher" ? "TEACHER WORKSPACE" : "YOUR LEARNING SPACE"}
            </div>
            <div className="class-dash-heading-row">
              {role === "teacher" ? (
                <h1>Courses</h1>
              ) : (
                <h1>
                  A place for every
                  <br />
                  <em>new possibility.</em>
                </h1>
              )}
              {role === "teacher" ? (
                <Link className="btn primary" to="/teacher/classes/new">
                  <Plus size={17} />
                  Create class
                </Link>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => {
                    setForm(!form);
                    setError("");
                  }}
                >
                  <Plus size={17} />
                  Join class
                </button>
              )}
            </div>
            <p>
              {role === "teacher"
                ? "Open a course to manage materials, assessments, and student progress."
                : "Your classes, your next steps, your next aha."}
            </p>
          </div>
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
          <section className="class-form panel" ref={formRef}>
            <h2>Find your classroom</h2>
            <p>Enter the eight-character code shared by your teacher.</p>
            <form onSubmit={submit}>
              <label htmlFor="join-code">Class code</label>
              <input
                id="join-code"
                ref={firstInputRef}
                required
                pattern="[A-Za-z2-9]{8}"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="join-code-input"
                placeholder="ABCDEFGH"
                autoComplete="off"
              />
              <div className="class-form-actions">
                <button disabled={busy} className="btn primary">
                  {busy ? "Working…" : "Join class"}
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
        {accepted && (
          <section className="class-success" aria-live="polite">
            <div>
              <strong>You joined {accepted.name}.</strong>
              <p>The course is now in your classes.</p>
            </div>
            <Link className="btn" to={classPath("student", accepted.id)}>
              Open course <ArrowUpRight size={15} />
            </Link>
          </section>
        )}
        {invitations.length > 0 && (
          <section className="panel class-invitations" aria-live="polite">
            <h2>
              <Mail size={18} /> Class invitations
            </h2>
            <ul>
              {invitations.map((invitation) => (
                <li key={invitation.id}>
                  <div>
                    <strong>{invitation.class_name}</strong>
                    <p className="muted">
                      {invitation.teacher_name} invited you to this class.
                    </p>
                  </div>
                  <div className="class-form-actions">
                    <button
                      className="btn primary"
                      disabled={answering !== ""}
                      onClick={() => void answer(invitation, true)}
                    >
                      {answering === invitation.id ? "Joining..." : "Accept"}
                    </button>
                    <button
                      className="btn"
                      disabled={answering !== ""}
                      onClick={() => void answer(invitation, false)}
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
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
                    {role === "teacher" ? "COURSE" : course.teacher_name}
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
            <AddCard
              role={role}
              onJoin={() => {
                setForm(true);
                setCreated(null);
              }}
            >
              <span className="course-add-icon">
                <Plus size={24} />
              </span>
              <strong>
                {role === "teacher" ? "Create class" : "Join another class"}
              </strong>
              <span>
                {role === "teacher"
                  ? "A join code is generated automatically."
                  : "Good things start with a code."}
              </span>
            </AddCard>
          </div>
        )}
      </main>
    </div>
  );
}

function AddCard({
  role,
  onJoin,
  children,
}: {
  role: "teacher" | "student";
  onJoin: () => void;
  children: React.ReactNode;
}) {
  return role === "teacher" ? (
    <Link className="course-add-card" to="/teacher/classes/new">
      {children}
    </Link>
  ) : (
    <button className="course-add-card" onClick={onJoin}>
      {children}
    </button>
  );
}
