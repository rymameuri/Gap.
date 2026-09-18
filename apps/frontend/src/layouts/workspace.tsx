import { useState, useEffect, useCallback } from "react";
import {
  NavLink,
  Outlet,
  useOutletContext,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  BookOpen,
  FileText,
  Activity,
  LogOut,
} from "lucide-react";
import { api, ApiError } from "../services/api";
import { useSession } from "../services/session";
import type { TeacherData, StudentData } from "../services/types";
import { Brand, ErrorBox, EngineNote } from "../components/ui";
export type TeacherContext = {
  data: TeacherData;
  refresh: () => Promise<void>;
  selectClass: (id: string) => void;
};
export type StudentContext = {
  data: StudentData;
  refresh: () => Promise<void>;
};
export const useTeacher = () => useOutletContext<TeacherContext>();
export const useStudent = () => useOutletContext<StudentContext>();
function useWorkspace<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const refresh = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        navigate("/login/student");
        return;
      }
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
    }
  }, [path, navigate]);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [refresh]);
  return { data, error, refresh };
}
export function TeacherLayout() {
  const { user, logout } = useSession(),
    navigate = useNavigate();
  const [classId, setClassId] = useState("");
  const { data, error, refresh } = useWorkspace<TeacherData>(
    "/teacher/workspace" +
      (classId ? "?classId=" + encodeURIComponent(classId) : ""),
  );
  const links = [
    ["", "Overview", LayoutDashboard],
    ["assessments", "Assessments", ClipboardList],
    ["review", "Review queue", BookOpen],
    ["content", "Content studio", FileText],
    ["materials", "Class materials", FileText],
    ["activity", "Agent activity", Activity],
  ] as const;
  return (
    <div className="shell">
      <aside>
        <Brand />
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          TEACHER WORKSPACE
        </div>
        <nav>
          {links.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              end={!path}
              to={"/teacher/" + path}
              className={({ isActive }) =>
                "navitem " + (isActive ? "active" : "")
              }
            >
              <Icon size={16} />
              {label}
              {path === "review" && !!data?.reviews.length && (
                <span className="badge">{data.reviews.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidefoot">
          <strong>{user?.name}</strong>
          <br />
          Meridian Foundation
          <br />
          <button
            className="btn small"
            onClick={async () => {
              await logout();
              navigate("/");
            }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <label className="sr-only" htmlFor="class-select">
              Class
            </label>
            {data && (
              <select
                id="class-select"
                className="class-select"
                value={data.course?.id || ""}
                onChange={(e) => setClassId(e.target.value)}
              >
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="workspaceidentity">
            <span className="avatar">T</span>Teacher workspace
          </div>
        </header>
        {error && <ErrorBox message={error} />}{" "}
        {!data ? (
          <p>Loading your class…</p>
        ) : (
          <>
            <Outlet
              context={
                {
                  data,
                  refresh,
                  selectClass: setClassId,
                } satisfies TeacherContext
              }
            />
            <EngineNote engine={data.engine} />
          </>
        )}
      </main>
    </div>
  );
}
export function StudentLayout() {
  const { user, logout } = useSession(),
    navigate = useNavigate();
  const { data, error, refresh } =
    useWorkspace<StudentData>("/student/workspace");
  return (
    <div className="student-shell">
      <header className="student-header">
        <Brand />
        <div className="student-identity">
          <span className="avatar">
            {user?.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </span>
          {user?.name}
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
      <nav className="student-nav" aria-label="Student navigation">
        <NavLink end to="/student/">
          My learning
        </NavLink>
        <NavLink to="/student/assessments">Assessments</NavLink>
        <NavLink to="/student/progress">Progress</NavLink>
      </nav>
      <main>
        {error && <ErrorBox message={error} />}{" "}
        {!data ? (
          <p>Loading your learning…</p>
        ) : (
          <>
            <Outlet context={{ data, refresh } satisfies StudentContext} />
            <EngineNote engine={data.engine} />
          </>
        )}
      </main>
    </div>
  );
}
