import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClassLink as Link } from "../../components/ClassLink";
import { RosterImport } from "../../components/RosterImport";
import { useTeacher } from "../../layouts/workspace";
import { post } from "../../services/api";
import { Title, Badge, ErrorBox, useNotice } from "../../components/ui";

function EnrollmentTools() {
  const { data, refresh } = useTeacher();
  const notice = useNotice();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = data.invitations.filter(
    (invitation) => invitation.status === "pending",
  ).length;

  async function act(request: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    try {
      await request();
      await refresh();
      notice(success);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="enrollment-section"
      aria-labelledby="enrollment-heading"
    >
      <details className="enrollment-tools">
        <summary id="enrollment-heading">Add students</summary>
        <div className="enrollment-tools-content">
          <form
            className="enrollment-form"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                await post("/teacher/classes/" + data.course.id + "/enroll", {
                  email,
                });
                setEmail("");
              }, "Student enrolled.");
            }}
          >
            <label className="field" htmlFor="enroll-email">
              Enroll an existing student
            </label>
            <div className="enrollment-form-row">
              <input
                id="enroll-email"
                type="email"
                required
                placeholder="Student account email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button className="btn" disabled={busy}>
                Enroll student
              </button>
            </div>
          </form>
          <RosterImport
            key={data.course.id}
            courseId={data.course.id}
            onInvited={async (invited) => {
              await refresh();
              notice(
                invited === 1
                  ? "1 invitation sent."
                  : `${invited} invitations sent.`,
              );
            }}
          />
          {error && <ErrorBox message={error} />}
        </div>
      </details>
      {data.invitations.length > 0 && (
        <div className="enrollment-invitations">
          <h2>
            Invitations{" "}
            {pending > 0 && <span className="muted">({pending} pending)</span>}
          </h2>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>
                      {invitation.name && <strong>{invitation.name}</strong>}
                      <div className="muted">{invitation.email}</div>
                    </td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (invitation.status === "pending" ? "sent" : "open")
                        }
                      >
                        {invitation.status === "pending"
                          ? "Pending"
                          : "Declined"}
                      </span>
                    </td>
                    <td>
                      {invitation.status === "pending" && (
                        <button
                          type="button"
                          className="btn small"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await post(
                                "/teacher/invitations/" +
                                  invitation.id +
                                  "/revoke",
                              );
                            }, "Invitation revoked.")
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export function Students() {
  const { data } = useTeacher();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") || "");
  const selected = params.get("student");
  const rows = data.roster.filter(
    (s) =>
      (!selected || s.id === selected) &&
      (s.name + " " + s.email).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Title
        label="CLASS ROSTER"
        heading="Students"
        description="Class members, learning gaps, and participation."
      />
      <EnrollmentTools />
      <div className="detail-toolbar">
        <label htmlFor="roster-search">Find a student</label>
        <input
          id="roster-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
        />
        {selected && (
          <button
            className="btn small"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("student");
              setParams(next);
            }}
          >
            Show all students
          </button>
        )}
      </div>
      <section className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Open gaps</th>
                <th>Questions</th>
                <th>Learning details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                  </td>
                  <td>{s.email}</td>
                  <td>{s.open_gaps}</td>
                  <td>{s.activity}</td>
                  <td>
                    <Link
                      className="btn small"
                      to={"/teacher/gaps?student=" + s.id}
                    >
                      View learning gaps
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="muted">No students match your search.</p>
        )}
      </section>
    </>
  );
}
export function GapDetails() {
  const { data } = useTeacher();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "all",
    topic = params.get("topic") || "",
    student = params.get("student") || "";
  const rows = data.gaps.filter(
    (g) =>
      (!topic || g.topic === topic) &&
      (!student || g.student_id === student) &&
      (status === "all" ||
        (status === "open" &&
          g.status !== "resolved" &&
          g.status !== "struggling") ||
        g.status === status),
  );
  function filter(value: string) {
    const next = new URLSearchParams(params);
    next.set("status", value);
    setParams(next);
  }
  return (
    <>
      <Title
        label="LEARNING RECORDS"
        heading={topic || "Learning gaps"}
        description="Individual student outcomes, backed by assessment and recheck records."
      />
      <div className="detail-toolbar">
        <label htmlFor="gap-status">Status</label>
        <select
          id="gap-status"
          value={status}
          onChange={(e) => filter(e.target.value)}
        >
          <option value="all">All outcomes</option>
          <option value="open">Open gaps</option>
          <option value="resolved">Resolved</option>
          <option value="struggling">Needs more support</option>
        </select>
        <span className="muted">{rows.length} records</span>
        {(topic || student) && (
          <Link className="btn small" to="/teacher/gaps">
            Clear filters
          </Link>
        )}
      </div>
      <section className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Topic</th>
                <th>Learning gap</th>
                <th>Evidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link to={"/teacher/students?student=" + g.student_id}>
                      {g.student_name}
                    </Link>
                  </td>
                  <td>{g.topic}</td>
                  <td>{g.tag}</td>
                  <td>{g.source}</td>
                  <td>
                    <Badge status={g.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="muted">No learning records match these filters.</p>
        )}
      </section>
    </>
  );
}
