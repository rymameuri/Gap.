import { useState, useEffect, useCallback } from "react";
import {
  NavLink,
  Outlet,
  useOutletContext,
  useNavigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import {
  Copy,
  LayoutDashboard,
  ClipboardList,
  FileText,
  LogOut,
  Users,
  Settings,
  Sparkles,
} from "lucide-react";
import { api, ApiError } from "../services/api";
import { useSession } from "../services/session";
import type { TeacherData, StudentData } from "../services/types";
import { Brand, ErrorBox, EngineNote, useNotice } from "../components/ui";
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
export function useWorkspace<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const refresh = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        navigate(
          path.startsWith("/teacher") ? "/login/teacher" : "/login/student",
        );
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
    navigate = useNavigate(),
    notice = useNotice();
  const [params, setParams] = useSearchParams();
  const classId = params.get("classId") || "";
  const setClassId = (id: string) => setParams({ classId: id });
  const { data, error, refresh } = useWorkspace<TeacherData>(
    "/teacher/workspace" +
      (classId ? "?classId=" + encodeURIComponent(classId) : ""),
  );
  const links = [
    ["overview", "Home", LayoutDashboard],
    ["materials", "Materials", FileText],
    ["assessments", "Assessments", ClipboardList],
    ["students", "Students", Users],
    ["companion", "Teaching companion", Sparkles],
    ["settings", "Settings", Settings],
  ] as const;
  return (
    <div className="shell">
      <aside>
        <Brand />
        <Link className="all-classes-link" to="/teacher/">
          ← All classes
        </Link>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          TEACHER WORKSPACE
        </div>
        <nav>
          {links.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              end={false}
              to={"/teacher/" + path + (classId ? "?classId=" + classId : "")}
              className={({ isActive }) =>
                "navitem " + (isActive ? "active" : "")
              }
            >
              <Icon size={16} />
              {label}
              {path === "assessments" && !!data?.reviews.length && (
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
            {data?.course?.join_code && (
              <button
                type="button"
                className="class-code-small"
                title="Copy the class code to share with students"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(data.course.join_code ?? "")
                    .then(() => notice("Class code copied."));
                }}
              >
                Class code: <code>{data.course.join_code}</code>
                <Copy size={13} />
              </button>
            )}
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
  const [params] = useSearchParams();
  const classId = params.get("classId") || "";
  const search = classId ? "?classId=" + encodeURIComponent(classId) : "";
  const { data, error, refresh } = useWorkspace<StudentData>(
    "/student/workspace" + search,
  );
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
          All classes
        </NavLink>
        <NavLink to={"/student/learning" + search}>My learning</NavLink>
        <NavLink to={"/student/assessments" + search}>Assessments</NavLink>
        <NavLink to={"/student/progress" + search}>Progress</NavLink>
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
