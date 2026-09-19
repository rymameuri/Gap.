import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  HeartPulse,
  MessageCircleQuestion,
  Target,
  Users,
} from "lucide-react";
import { ClassLink as Link } from "../../components/ClassLink";
import { UrgentBanner, ago, openFlags } from "../../components/WellbeingFlags";
import { useTeacher } from "../../layouts/workspace";
import { api } from "../../services/api";
import type { Gap, Presentation } from "../../services/types";

const TONE = {
  good: "#2f9e63",
  warn: "#e8a317",
  bad: "#e5645a",
  info: "#6974cf",
  none: "#eceef3",
};

const isOpen = (g: Gap) => g.status !== "resolved" && g.status !== "struggling";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
}

function Ring({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 64 64"
      className="dash-ring"
      role="img"
      aria-label={label}
    >
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={TONE.none}
        strokeWidth="7"
      />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${String(c * Math.min(1, Math.max(0, value)))} ${String(c)}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  to,
  tone,
  ring,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  to: string;
  tone: string;
  ring?: number;
}) {
  return (
    <Link to={to} className="dash-kpi" style={{ ["--tone" as string]: tone }}>
      <span className="dash-kpi-icon">{icon}</span>
      <span className="dash-kpi-label">{label}</span>
      {ring === undefined ? (
        <b>{value}</b>
      ) : (
        <span className="dash-kpi-ring">
          <Ring value={ring} color={tone} label={`${label}: ${value}`} />
        </span>
      )}
      <span className="dash-kpi-sub">{sub}</span>
    </Link>
  );
}

/** Worst status wins: a student with any struggling record shows as struggling. */
function cellTone(records: Gap[]): string {
  if (!records.length) return TONE.none;
  if (records.some((g) => g.status === "struggling")) return TONE.bad;
  if (records.some(isOpen)) return TONE.warn;
  return TONE.good;
}

const DAYS = 7;

function activityByDay(events: { created_at: string }[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (DAYS - 1 - i));
    return { date: d, count: 0 };
  });
  for (const event of events) {
    const t = new Date(event.created_at);
    t.setHours(0, 0, 0, 0);
    const day = days.find((d) => d.date.getTime() === t.getTime());
    if (day) day.count++;
  }
  return days;
}

export function Home() {
  const { data } = useTeacher();
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  useEffect(() => {
    api<{ presentations: Presentation[] }>(
      `/teacher/classes/${data.course.id}/presentations`,
    )
      .then((r) => setPresentations(r.presentations))
      .catch(() => setPresentations([]));
  }, [data.course.id]);

  const students = data.roster.length;
  const needSupport = data.roster.filter((s) => s.open_gaps > 0);
  const resolved = data.gaps.filter((g) => g.status === "resolved").length;
  const resolutionRate = data.gaps.length ? resolved / data.gaps.length : 0;
  const supportRate = students ? needSupport.length / students : 0;
  const flagsOpen = openFlags(data.flags);
  const urgentOpen = flagsOpen.filter((f) => f.severity === "urgent").length;
  const topGap = data.clusters[0];

  const statusCounts = [
    { label: "Open", n: data.gaps.filter(isOpen).length, color: TONE.warn },
    {
      label: "Needs more support",
      n: data.gaps.filter((g) => g.status === "struggling").length,
      color: TONE.bad,
    },
    { label: "Resolved", n: resolved, color: TONE.good },
  ];
  const totalRecords = Math.max(1, data.gaps.length);

  const topics = data.clusters.slice(0, 6);
  const heatStudents = [...data.roster]
    .sort((a, b) => b.open_gaps - a.open_gaps)
    .slice(0, 8);
  const days = activityByDay(data.events);
  const peak = Math.max(1, ...days.map((d) => d.count));
  const flaggedIds = new Set(flagsOpen.map((f) => f.student_id));

  const todo: {
    key: string;
    icon: ReactNode;
    text: string;
    to: string;
    tone: string;
  }[] = [];
  if (urgentOpen)
    todo.push({
      key: "urgent",
      icon: <HeartPulse size={16} />,
      text: `${String(urgentOpen)} urgent wellbeing ${urgentOpen === 1 ? "flag" : "flags"}`,
      to: "/teacher/students?tab=flagged",
      tone: TONE.bad,
    });
  if (data.reviews.length)
    todo.push({
      key: "review",
      icon: <ClipboardCheck size={16} />,
      text: `${String(data.reviews.length)} ${data.reviews.length === 1 ? "response needs" : "responses need"} review`,
      to: "/teacher/assessments?tab=review",
      tone: TONE.warn,
    });
  if (topGap)
    todo.push({
      key: "gap",
      icon: <Target size={16} />,
      text: `Prepare an explanation for ${topGap.topic}`,
      to: "/teacher/students?tab=explanations",
      tone: TONE.info,
    });
  if (data.asked.length)
    todo.push({
      key: "questions",
      icon: <MessageCircleQuestion size={16} />,
      text: `${String(data.asked.length)} student questions to read`,
      to: "/teacher/students?tab=questions",
      tone: TONE.info,
    });
  const draftQuizzes = data.quizzes.filter((q) => q.status === "draft").length;
  if (draftQuizzes)
    todo.push({
      key: "quiz",
      icon: <ClipboardCheck size={16} />,
      text: `${String(draftQuizzes)} assessment ${draftQuizzes === 1 ? "draft" : "drafts"} unpublished`,
      to: "/teacher/assessments",
      tone: TONE.none,
    });
  const draftDecks = presentations.filter((p) => p.status === "draft").length;
  if (draftDecks)
    todo.push({
      key: "deck",
      icon: <Users size={16} />,
      text: `${String(draftDecks)} ${draftDecks === 1 ? "presentation" : "presentations"} not shared`,
      to: "/teacher/materials",
      tone: TONE.none,
    });

  const headline = !students
    ? "Share your class code so students can join."
    : topGap
      ? `${String(needSupport.length)} of ${String(students)} students have an open gap. ${topGap.topic} is affecting the most (${String(topGap.students)}).`
      : "No open learning gaps right now. Nice work.";

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <div className="eyebrow">{greeting().toUpperCase()}</div>
          <h1>{data.course.name}</h1>
          <p className="dash-headline">{headline}</p>
        </div>
      </div>

      <UrgentBanner />

      <div className="dash-kpis">
        <Kpi
          icon={<Users size={18} />}
          label="Students"
          value={String(students)}
          sub="enrolled in this class"
          to="/teacher/students?tab=roster"
          tone={TONE.info}
        />
        <Kpi
          icon={<Target size={18} />}
          label="Need support"
          value={`${String(needSupport.length)} of ${String(students)}`}
          sub="students with an open gap"
          to="/teacher/students?tab=gaps"
          tone={supportRate > 0.5 ? TONE.bad : TONE.warn}
          ring={supportRate}
        />
        <Kpi
          icon={<Activity size={18} />}
          label="Gaps closed"
          value={`${String(resolved)} of ${String(data.gaps.length)}`}
          sub="learning records resolved"
          to="/teacher/students?tab=gaps&status=resolved"
          tone={TONE.good}
          ring={resolutionRate}
        />
        <Kpi
          icon={<HeartPulse size={18} />}
          label="Wellbeing flags"
          value={String(flagsOpen.length)}
          sub={
            urgentOpen ? `${String(urgentOpen)} urgent` : "open, none urgent"
          }
          to="/teacher/students?tab=flagged"
          tone={
            urgentOpen ? TONE.bad : flagsOpen.length ? TONE.warn : TONE.good
          }
        />
        <Kpi
          icon={<ClipboardCheck size={18} />}
          label="To review"
          value={String(data.reviews.length)}
          sub="uncertain grades"
          to="/teacher/assessments?tab=review"
          tone={data.reviews.length ? TONE.warn : TONE.good}
        />
      </div>

      <div className="dash-grid two">
        <section className="panel dash-card">
          <h2>Where students struggle</h2>
          <p className="muted">Share of the class with an open gap, by topic</p>
          {topics.length ? (
            topics.map((c) => {
              const share = students ? c.students / students : 0;
              return (
                <Link
                  key={c.tag}
                  className="dash-bar"
                  to={
                    "/teacher/students?tab=gaps&topic=" +
                    encodeURIComponent(c.topic) +
                    "&status=open"
                  }
                >
                  <span className="dash-bar-label">{c.topic}</span>
                  <span className="dash-bar-track">
                    <span
                      style={{
                        width: `${String(Math.max(4, share * 100))}%`,
                        background:
                          share > 0.4
                            ? TONE.bad
                            : share > 0.2
                              ? TONE.warn
                              : TONE.info,
                      }}
                    />
                  </span>
                  <b>{c.students}</b>
                </Link>
              );
            })
          ) : (
            <p className="muted">No open gaps to show.</p>
          )}
        </section>

        <section className="panel dash-card">
          <h2>Learning gap outcomes</h2>
          <p className="muted">{data.gaps.length} student–topic records</p>
          <div className="dash-stack" role="img" aria-label="Gap outcomes">
            {statusCounts.map((s) => (
              <span
                key={s.label}
                style={{ flex: s.n / totalRecords, background: s.color }}
                title={`${s.label}: ${String(s.n)}`}
              />
            ))}
          </div>
          <ul className="dash-legend">
            {statusCounts.map((s) => (
              <li key={s.label}>
                <i style={{ background: s.color }} />
                {s.label}
                <b>{s.n}</b>
              </li>
            ))}
          </ul>
          <h3>Class activity, last 7 days</h3>
          <div className="dash-spark" role="img" aria-label="Activity per day">
            {days.map((d) => (
              <span key={d.date.toISOString()} className="dash-spark-col">
                <span
                  style={{
                    height: `${String(Math.max(6, (d.count / peak) * 100))}%`,
                  }}
                  className={d.count ? "on" : ""}
                  title={`${String(d.count)} events`}
                />
                <small>
                  {d.date.toLocaleDateString(undefined, { weekday: "narrow" })}
                </small>
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="panel dash-card">
        <div className="dash-cardhead">
          <div>
            <h2>Who is struggling with what</h2>
            <p className="muted">Students with the most open gaps, by topic</p>
          </div>
          <ul className="dash-legend inline">
            <li>
              <i style={{ background: TONE.good }} />
              Resolved
            </li>
            <li>
              <i style={{ background: TONE.warn }} />
              Open
            </li>
            <li>
              <i style={{ background: TONE.bad }} />
              Needs support
            </li>
            <li>
              <i style={{ background: TONE.none }} />
              No data
            </li>
          </ul>
        </div>
        {topics.length && heatStudents.length ? (
          <div className="tablewrap">
            <table className="dash-heat">
              <thead>
                <tr>
                  <th />
                  {topics.map((t) => (
                    <th key={t.tag} title={t.topic}>
                      <span>{t.topic}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatStudents.map((s) => (
                  <tr key={s.id}>
                    <th>
                      <Link to={"/teacher/students?tab=roster&student=" + s.id}>
                        <span className="dash-avatar">{initials(s.name)}</span>
                        {s.name}
                        {flaggedIds.has(s.id) && (
                          <span
                            className="dash-flag"
                            title="Open wellbeing flag"
                          >
                            <HeartPulse size={13} />
                          </span>
                        )}
                      </Link>
                    </th>
                    {topics.map((t) => {
                      const records = data.gaps.filter(
                        (g) => g.student_id === s.id && g.tag === t.tag,
                      );
                      return (
                        <td key={t.tag}>
                          <span
                            className="dash-cell"
                            style={{ background: cellTone(records) }}
                            title={`${s.name} · ${t.topic}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            The map fills in once students take an assessment.
          </p>
        )}
      </section>

      <div className="dash-grid two">
        <section className="panel dash-card">
          <h2>Needs your attention</h2>
          {todo.length ? (
            <ul className="dash-todo">
              {todo.map((t) => (
                <li key={t.key}>
                  <Link to={t.to} style={{ ["--tone" as string]: t.tone }}>
                    <span className="dash-todo-icon">{t.icon}</span>
                    <span>{t.text}</span>
                    <ArrowRight size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">You&rsquo;re all caught up. 🎉</p>
          )}
        </section>

        <section className="panel dash-card">
          <h2>Latest updates</h2>
          {data.events.length ? (
            <ul className="dash-feed">
              {data.events.slice(0, 7).map((e) => (
                <li key={e.id}>
                  <span className="dash-feed-dot" />
                  <span>
                    {e.action}
                    <small>
                      {e.agent} · {ago(e.created_at)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Activity from your class appears here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
