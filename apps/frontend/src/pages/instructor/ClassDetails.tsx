import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClassLink as Link } from "../../components/ClassLink";
import { useTeacher } from "../../layouts/workspace";
import { Title, Badge } from "../../components/ui";
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
        heading="Your students."
        description="Class members, learning gaps, and participation."
      />
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
        heading={topic || "Learning gap details."}
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
