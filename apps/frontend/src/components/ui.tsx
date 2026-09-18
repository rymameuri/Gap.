import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
export function Brand() {
  return (
    <Link className="brand" to="/">
      gap<span>.</span>
    </Link>
  );
}
export function Badge({ status }: { status: string }) {
  const names: Record<string, string> = {
    open: "Needs attention",
    ready: "Explanation ready",
    resolved: "Resolved",
    struggling: "Needs more support",
    pending: "Awaiting review",
    draft: "Draft",
    published: "Published",
    approved: "Shared",
    reviewed: "Reviewed",
    graded: "Graded",
    running: "Processing",
    queued: "Queued",
    succeeded: "Complete",
    failed: "Failed",
  };
  const tone = ["resolved", "reviewed", "graded", "succeeded"].includes(status)
    ? "resolved"
    : ["ready", "approved", "published", "running"].includes(status)
      ? "sent"
      : ["open", "struggling", "pending", "failed"].includes(status)
        ? "open"
        : "";
  return <span className={"badge " + tone}>{names[status] || status}</span>;
}
export function Title({
  label,
  heading,
  description,
  action,
}: {
  label: string;
  heading: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <div className="eyebrow">{label}</div>
        <h1>{heading}</h1>
        {description && <p style={{ marginBottom: 0 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="errorbox">
      {message}
    </div>
  );
}
const Notices = createContext<(message: string) => void>(() => {});
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function notify(text: string) {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 5000);
  }
  return (
    <Notices value={notify}>
      {children}
      {message && (
        <div className="notice-toast" role="status">
          {message}
        </div>
      )}
    </Notices>
  );
}
export const useNotice = () => useContext(Notices);
export function EngineNote({ engine }: { engine: string }) {
  return (
    <p className="notice">
      {engine === "live-ai"
        ? "Live AI connected"
        : "Local teaching engine · Connect a model to generate beyond the physics teaching bank"}{" "}
      · Data saved in SQLite
    </p>
  );
}
