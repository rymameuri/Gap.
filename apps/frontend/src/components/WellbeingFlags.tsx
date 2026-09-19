import { useState } from "react";
import { useTeacher } from "../layouts/workspace";
import { put } from "../services/api";
import type {
  FlagCategory,
  FlagSeverity,
  FlagStatus,
  WellbeingFlag,
} from "../services/types";
import { useAction } from "../pages/instructor/TeacherPages";
import { ErrorBox } from "./ui";

export const CATEGORY: Record<FlagCategory, { label: string; icon: string }> = {
  self_harm: { label: "Self-harm language", icon: "🆘" },
  safety: { label: "Safety concern", icon: "🛡️" },
  distress: { label: "Acute distress", icon: "💔" },
  low_mood: { label: "Low mood", icon: "🌧️" },
  anxiety: { label: "Anxiety & stress", icon: "🌀" },
  isolation: { label: "Isolation", icon: "🫥" },
  quitting: { label: "Wants to give up", icon: "🏳️" },
};

const SEVERITY_LABEL: Record<FlagSeverity, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const STEPS: { id: FlagStatus; label: string }[] = [
  { id: "new", label: "New" },
  { id: "reached_out", label: "Reached out" },
  { id: "resolved", label: "Resolved" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function ago(iso: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(iso)) / 60000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  return `${String(Math.round(hours / 24))} d ago`;
}

/** Open flags that still need a teacher, most severe first. */
export const openFlags = (flags: WellbeingFlag[]) =>
  flags.filter((f) => f.status !== "resolved");

/** Red alert shown wherever the teacher lands; links to the flagged tab. */
export function UrgentBanner({ onOpen }: { onOpen?: () => void }) {
  const { data } = useTeacher();
  const urgent = data.flags.filter(
    (f) => f.severity === "urgent" && f.status === "new",
  );
  if (!urgent.length) return null;
  const names = [...new Set(urgent.map((f) => f.student_name))];
  return (
    <div className="flag-banner" role="alert">
      <span className="pulse" aria-hidden="true" />
      <div>
        <strong>
          {urgent.length === 1
            ? "1 urgent message needs"
            : `${String(urgent.length)} urgent messages need`}{" "}
          your attention
        </strong>
        <div>
          From {names.join(", ")}. Please check in with them today and follow
          your school&rsquo;s safeguarding protocol.
        </div>
      </div>
      {onOpen && (
        <button className="btn small" onClick={onOpen}>
          Review now
        </button>
      )}
    </div>
  );
}

function Summary({ flags }: { flags: WellbeingFlag[] }) {
  const count = (fn: (f: WellbeingFlag) => boolean) => flags.filter(fn).length;
  const tiles = [
    {
      cls: "urgent",
      icon: "🚨",
      n: count((f) => f.severity === "urgent" && f.status !== "resolved"),
      label: "Urgent open",
    },
    {
      cls: "new",
      icon: "🔔",
      n: count((f) => f.status === "new"),
      label: "Not yet seen",
    },
    {
      cls: "reached",
      icon: "🤝",
      n: count((f) => f.status === "reached_out"),
      label: "Reached out",
    },
    {
      cls: "resolved",
      icon: "✅",
      n: count((f) => f.status === "resolved"),
      label: "Resolved",
    },
  ];
  return (
    <div className="flag-tiles">
      {tiles.map((t) => (
        <div className={"flag-tile " + t.cls} key={t.label}>
          <span className="flag-tile-icon" aria-hidden="true">
            {t.icon}
          </span>
          <b>{t.n}</b>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function Themes({ flags }: { flags: WellbeingFlag[] }) {
  const counts = new Map<FlagCategory, number>();
  for (const f of flags)
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  const rows = [...counts].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return null;
  return (
    <section className="panel flag-themes">
      <h3>What students are struggling with</h3>
      {rows.map(([category, n]) => (
        <div className="flag-theme" key={category}>
          <span className="flag-theme-label">
            {CATEGORY[category].icon} {CATEGORY[category].label}
          </span>
          <span className="flag-theme-track">
            <span
              className={"flag-theme-fill " + category}
              style={{ width: String((n / max) * 100) + "%" }}
            />
          </span>
          <b>{n}</b>
        </div>
      ))}
    </section>
  );
}

function FlagCard({ flag, history }: { flag: WellbeingFlag; history: number }) {
  const { refresh } = useTeacher();
  const action = useAction();
  const [shown, setShown] = useState(flag.severity !== "low");
  const [note, setNote] = useState(flag.note);
  const save = (status: FlagStatus, text = note) =>
    action.run(async () => {
      await put("/teacher/flags/" + flag.id, { status, note: text });
      await refresh();
    });
  return (
    <article className={"flag-card " + flag.severity + " " + flag.status}>
      <header>
        <span className="flag-avatar">{initials(flag.student_name)}</span>
        <div className="flag-who">
          <b>{flag.student_name}</b>
          <span className="muted">
            {ago(flag.created_at)} ·{" "}
            {flag.source === "assistant" ? "Study assistant" : "Asked teacher"}
          </span>
        </div>
        <span className={"flag-sev " + flag.severity}>
          {SEVERITY_LABEL[flag.severity]}
        </span>
      </header>
      <div className="flag-chips">
        <span className="flag-chip">
          {CATEGORY[flag.category].icon} {CATEGORY[flag.category].label}
        </span>
        {history > 1 && (
          <span className="flag-chip repeat">
            🔁 {history} flags from this student
          </span>
        )}
      </div>
      {shown ? (
        <blockquote>{flag.text}</blockquote>
      ) : (
        <button className="flag-reveal" onClick={() => setShown(true)}>
          👁 Show message
        </button>
      )}
      <ol className="flag-steps" aria-label="Follow-up status">
        {STEPS.map((step, i) => {
          const at = STEPS.findIndex((s) => s.id === flag.status);
          return (
            <li
              key={step.id}
              className={i < at ? "done" : i === at ? "now" : ""}
            >
              <button
                disabled={action.busy || step.id === flag.status}
                onClick={() => void save(step.id)}
              >
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
      <label className="flag-note">
        <span>Private note (only you can see this)</span>
        <textarea
          rows={2}
          maxLength={2000}
          value={note}
          placeholder="What did you do or plan to do?"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {note !== flag.note && (
        <button
          className="btn small"
          disabled={action.busy}
          onClick={() => void save(flag.status)}
        >
          Save note
        </button>
      )}
      {action.error && <ErrorBox message={action.error} />}
    </article>
  );
}

export function WellbeingFlags() {
  const { data } = useTeacher();
  const [showResolved, setShowResolved] = useState(false);
  const flags = data.flags;
  const perStudent = new Map<string, number>();
  for (const f of flags)
    perStudent.set(f.student_id, (perStudent.get(f.student_id) ?? 0) + 1);
  const rows = showResolved ? flags : openFlags(flags);
  return (
    <>
      <UrgentBanner />
      <Summary flags={flags} />
      <Themes flags={flags} />
      <div className="detail-toolbar">
        <label>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />{" "}
          Show resolved
        </label>
        <span className="muted">{rows.length} shown</span>
      </div>
      {rows.length ? (
        <div className="flag-list">
          {rows.map((f) => (
            <FlagCard
              key={f.id}
              flag={f}
              history={perStudent.get(f.student_id) ?? 1}
            />
          ))}
        </div>
      ) : (
        <section className="panel flag-empty">
          <div aria-hidden="true">🌱</div>
          <h3>No one needs a check-in right now</h3>
          <p className="muted">
            When a student&rsquo;s question or message suggests they may be
            struggling with their wellbeing, it appears here. Students never see
            that it was flagged.
          </p>
        </section>
      )}
      <p className="muted flag-disclaimer">
        Flags come from an automatic keyword screen. It can miss things and can
        raise false alarms, so it supports your judgement and does not replace
        it.
      </p>
    </>
  );
}
