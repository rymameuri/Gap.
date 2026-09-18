import { ClassLink as Link } from "./ClassLink";
import type { Cluster, Gap } from "../services/types";
export function LearningCharts({
  clusters,
  gaps,
  students,
}: {
  clusters: Cluster[];
  gaps: Gap[];
  students: number;
}) {
  const counts = [
    {
      label: "Open",
      value: gaps.filter(
        (g) => g.status !== "resolved" && g.status !== "struggling",
      ).length,
      color: "#9783ab",
    },
    {
      label: "Resolved",
      value: gaps.filter((g) => g.status === "resolved").length,
      color: "#7e9a83",
    },
    {
      label: "Needs more support",
      value: gaps.filter((g) => g.status === "struggling").length,
      color: "#bd9662",
    },
  ];
  const total = gaps.length,
    max = Math.max(students, ...clusters.map((c) => c.students), 1),
    rows = clusters.slice(0, 6),
    height = rows.length * 58 + 44;
  let offset = 0;
  const circumference = 2 * Math.PI * 60;
  return (
    <div className="learning-charts">
      <section className="panel comparison-chart">
        <div className="panelhead">
          <div>
            <h2>Where students need support</h2>
            <p className="chart-caption">Students with an open gap, by topic</p>
          </div>
          <span className="chart-unit">{students} enrolled</span>
        </div>
        {rows.length ? (
          <>
            <div
              className="interactive-bar-chart"
              aria-label="Students needing support by topic"
            >
              {rows.map((c, i) => (
                <Link
                  key={c.tag}
                  to={
                    "/teacher/gaps?topic=" +
                    encodeURIComponent(c.topic) +
                    "&status=open"
                  }
                  className="interactive-bar-row"
                  aria-label={
                    c.topic +
                    ": " +
                    c.students +
                    " students. View learning gaps"
                  }
                  title={
                    c.topic + ": " + c.students + " students — view details"
                  }
                >
                  <span className="bar-topic">{c.topic}</span>
                  <span className="bar-plot">
                    <span
                      className="bar-fill"
                      style={{
                        width: (c.students / max) * 100 + "%",
                        background: ["#9783ab", "#b3a2c1", "#ccbed6"][i % 3],
                      }}
                    />
                    <strong>{c.students}</strong>
                  </span>
                </Link>
              ))}
              <div className="bar-axis">
                <span />
                <div>
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <span key={t}>{Math.round(t * max)}</span>
                  ))}
                </div>
              </div>
            </div>
            <p className="chart-footnote">
              A student may appear in more than one topic.
            </p>
          </>
        ) : (
          <div className="chart-no-data">No open learning gaps to display.</div>
        )}
      </section>
      <section className="panel outcomes-chart">
        <h2>Learning gap outcomes</h2>
        <p className="chart-caption">Individual student–topic records</p>
        {total ? (
          <>
            <div className="outcome-visual">
              <svg
                viewBox="0 0 160 160"
                role="img"
                aria-label={counts
                  .map((c) => `${c.label}: ${c.value}`)
                  .join("; ")}
              >
                <circle
                  cx="80"
                  cy="80"
                  r="60"
                  fill="none"
                  stroke="#f0edf2"
                  strokeWidth="15"
                />
                {counts
                  .filter((c) => c.value)
                  .map((c) => {
                    const start = offset;
                    offset += (c.value / total) * circumference;
                    return (
                      <circle
                        key={c.label}
                        cx="80"
                        cy="80"
                        r="60"
                        fill="none"
                        stroke={c.color}
                        strokeWidth="15"
                        strokeDasharray={`${(c.value / total) * circumference} ${circumference}`}
                        strokeDashoffset={-start}
                        transform="rotate(-90 80 80)"
                      />
                    );
                  })}
                <text
                  x="80"
                  y="78"
                  textAnchor="middle"
                  fontSize="30"
                  fill="#37323e"
                  fontWeight="600"
                >
                  {total}
                </text>
                <text
                  x="80"
                  y="98"
                  textAnchor="middle"
                  fontSize="10"
                  fill="#89818f"
                >
                  total gaps
                </text>
              </svg>
            </div>
            <div className="chart-legend">
              {counts.map((c) => (
                <Link
                  key={c.label}
                  to={
                    "/teacher/gaps?status=" +
                    (c.label === "Open"
                      ? "open"
                      : c.label === "Resolved"
                        ? "resolved"
                        : "struggling")
                  }
                  aria-label={c.label + ": " + c.value + ". View records"}
                >
                  <span>
                    <i style={{ background: c.color }} />
                    {c.label}
                  </span>
                  <strong>{c.value}</strong>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="chart-no-data">
            Outcomes will appear after the first assessment.
          </div>
        )}
      </section>
    </div>
  );
}
