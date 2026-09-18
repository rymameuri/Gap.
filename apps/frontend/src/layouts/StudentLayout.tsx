import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Menu,
  X,
} from "lucide-react";
import { useSession } from "../services/session";
import { Brand, ErrorBox } from "../components/ui";
import { useWorkspace } from "./workspace";
import type { StudentData } from "../services/types";
import {
  coursePath,
  selectCourse,
  type CourseData,
} from "../pages/student/course-model";
import "../pages/student/student.css";

type StudentContext = { data: StudentData; refresh: () => Promise<void> };
type CourseContext = CourseData & { refresh: () => Promise<void> };
export const useStudent = () => useOutletContext<StudentContext>();
export const useCourse = () => useOutletContext<CourseContext>();

export function StudentLayout() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const { data, error, refresh } =
    useWorkspace<StudentData>("/student/workspace");
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="s-app">
      <a className="s-skip" href="#student-content">
        Skip to content
      </a>
      <header className="s-header">
        <div className="s-brand-group">
          <Brand />
          <span className="s-header-divider" />
          <span>Student workspace</span>
        </div>
        <div className="s-account">
          <span className="s-avatar" aria-hidden="true">
            {user?.name
              .split(" ")
              .map((part) => part[0])
              .join("")}
          </span>
          <span>{user?.name}</span>
          <button
            className="s-icon-button"
            title="Sign out"
            aria-label="Sign out"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await logout();
                navigate("/");
              } catch {
                setLogoutError("Unable to sign out. Please try again.");
              } finally {
                setSigningOut(false);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      {(error || logoutError) && (
        <div className="s-load-error">
          <ErrorBox message={error || logoutError} />
          <button className="s-button" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}
      {!data ? (
        <main id="student-content" className="s-course-list">
          <p role="status">Loading your courses...</p>
        </main>
      ) : (
        <Outlet context={{ data, refresh } satisfies StudentContext} />
      )}
    </div>
  );
}

const links = [
  ["", "Overview", LayoutDashboard],
  ["assistant", "Study Assistant", MessageSquare],
  ["practice", "Practice & Quizzes", ClipboardCheck],
  ["materials", "Materials", BookOpen],
  ["progress", "My Progress", ChartNoAxesCombined],
] as const;

export function CourseLayout() {
  const { data, refresh } = useStudent();
  const { courseId } = useParams();
  const course = data.courses.find((item) => item.id === courseId);
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  const page =
    links.find(([path]) => path && pathname.includes(`/${path}`))?.[1] ||
    (pathname.includes("/lessons/")
      ? "Review & practice"
      : pathname.includes("/quizzes/")
        ? "Quiz"
        : "Overview");
  if (!course)
    return (
      <main id="student-content" className="s-course-list">
        <h1>Course not found</h1>
        <Link className="s-button" to="/student">
          Back to my courses
        </Link>
      </main>
    );
  return (
    <div className="s-workspace">
      <div className="s-mobile-course">
        <span>{course.name}</span>
        <button
          className="s-icon-button"
          aria-label={menuOpen ? "Close course menu" : "Open course menu"}
          aria-expanded={menuOpen}
          aria-controls="course-sidebar"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <aside
        className={`s-sidebar ${menuOpen ? "is-open" : ""}`}
        id="course-sidebar"
      >
        <Link className="s-back" to="/student">
          <ArrowLeft size={16} />
          My courses
        </Link>
        <div className="s-sidebar-course">
          <span className="s-course-symbol">
            <BookOpen size={22} />
          </span>
          <h2>{course.name}</h2>
          <span className="s-muted">Course workspace</span>
        </div>
        <nav aria-label="Course navigation">
          {links.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              end={!path}
              to={coursePath(course.id, path)}
              className={({ isActive }) =>
                `s-nav-link ${isActive || (path === "practice" && /\/(lessons|quizzes)\//.test(pathname)) ? "active" : ""}`
              }
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="s-sidebar-footer">
          <span className="s-connection-dot" />
          Course connected<span>Instructor updates appear here.</span>
        </div>
      </aside>
      <main className="s-main" id="student-content">
        <div className="s-breadcrumb">
          <Link to={coursePath(course.id)}>{course.name}</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{page}</span>
        </div>
        <Outlet
          context={
            { ...selectCourse(data, course), refresh } satisfies CourseContext
          }
        />
      </main>
    </div>
  );
}
