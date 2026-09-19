import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  Link,
} from "react-router-dom";
import { SessionProvider, useSession } from "./services/session";
import { NoticeProvider } from "./components/ui";
import { TeacherLayout } from "./layouts/workspace";
import { StudentLayout, CourseLayout } from "./layouts/StudentLayout";
import { Login } from "./pages/auth/Login";
import { ClassDashboard } from "./pages/ClassDashboard";
import { CreateClass } from "./pages/CreateClass";
import { Landing } from "./pages/Landing";
import { Home } from "./pages/instructor/Home";
import { CompanionPage } from "./pages/instructor/CompanionPage";
import { Materials } from "./pages/instructor/MaterialsPage";
import { PresentationEditor } from "./pages/instructor/PresentationEditor";
import { AssessmentsHub, Settings, StudentsHub } from "./pages/instructor/Hubs";
import { AgentActivity } from "./pages/instructor/TeacherPages";
import { CourseOverview } from "./pages/student/CourseOverview";
import { StudentCompanion } from "./pages/student/StudentCompanion";
import { Practice } from "./pages/student/Practice";
import { QuizPage } from "./pages/student/QuizPage";
import { Lesson } from "./pages/student/Lesson";
import { Progress } from "./pages/student/Progress";
import { StudentMaterials } from "./pages/student/Materials";
import { LegacyStudentRoute } from "./pages/student/LegacyStudentRoute";
import { useEffect, type ReactNode } from "react";
function TabRedirect({ to, tab }: { to: string; tab?: string }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (tab) params.set("tab", tab);
  return <Navigate replace to={`/teacher/${to}?${params.toString()}`} />;
}
function Guard({
  role,
  children,
}: {
  role: "teacher" | "student";
  children: ReactNode;
}) {
  const { user, loading } = useSession(),
    location = useLocation();
  if (loading) return <div className="empty">Loading your workspace…</div>;
  if (!user)
    return (
      <Navigate
        replace
        to={"/login/" + role}
        state={{ from: location.pathname }}
      />
    );
  if (user.role !== role)
    return (
      <div className="auth-page">
        <h1>This is a {role} workspace.</h1>
        <p>
          You are signed in as a {user.role}. Browser tabs share one sign-in, so
          switching accounts in another tab changes this one too.
        </p>
        <Link className="btn primary" to={"/" + user.role + "/"}>
          Open {user.role} workspace
        </Link>
        <Link className="btn" to={"/login/" + role}>
          Sign in as {role}
        </Link>
      </div>
    );
  return children;
}
function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = pathname.includes("teacher")
      ? "Gap — Teacher workspace"
      : pathname.includes("student")
        ? "Gap — Student workspace"
        : "Gap — Turn uncertainty into understanding";
  }, [pathname]);
  return null;
}
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <DocumentTitle />
    <ScrollToTop />
    <SessionProvider>
      <NoticeProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login/:role" element={<Login />} />
          <Route
            path="/teacher"
            element={
              <Guard role="teacher">
                <ClassDashboard role="teacher" />
              </Guard>
            }
          />
          <Route
            path="/teacher/classes/new"
            element={
              <Guard role="teacher">
                <CreateClass />
              </Guard>
            }
          />
          <Route
            path="/student"
            element={
              <Guard role="student">
                <ClassDashboard role="student" />
              </Guard>
            }
          />
          <Route
            path="/teacher"
            element={
              <Guard role="teacher">
                <TeacherLayout />
              </Guard>
            }
          >
            <Route path="overview" element={<Home />} />
            <Route path="materials" element={<Materials />} />
            <Route
              path="materials/presentations/:pid"
              element={<PresentationEditor />}
            />
            <Route path="assessments" element={<AssessmentsHub />} />
            <Route path="students" element={<StudentsHub />} />
            <Route path="companion" element={<CompanionPage />} />
            <Route path="settings" element={<Settings />} />
            {/* Old addresses still work: they open the matching tab. */}
            <Route
              path="gaps"
              element={<TabRedirect to="students" tab="gaps" />}
            />
            <Route
              path="content"
              element={<TabRedirect to="students" tab="explanations" />}
            />
            <Route
              path="review"
              element={<TabRedirect to="assessments" tab="review" />}
            />
            <Route path="activity" element={<AgentActivity />} />
          </Route>
          <Route
            path="/student"
            element={
              <Guard role="student">
                <StudentLayout />
              </Guard>
            }
          >
            <Route path="courses/:courseId" element={<CourseLayout />}>
              <Route index element={<CourseOverview />} />
              <Route path="assistant" element={<StudentCompanion />} />
              <Route path="practice" element={<Practice />} />
              <Route path="quizzes/:quizId" element={<QuizPage />} />
              <Route path="lessons/:gapId" element={<Lesson />} />
              <Route path="materials" element={<StudentMaterials />} />
              <Route path="progress" element={<Progress />} />
            </Route>
            <Route path="learning" element={<LegacyStudentRoute />} />
            <Route path="gaps/:id" element={<LegacyStudentRoute />} />
            <Route
              path="assessments"
              element={<LegacyStudentRoute page="practice" />}
            />
            <Route
              path="progress"
              element={<LegacyStudentRoute page="progress" />}
            />
          </Route>
          <Route
            path="*"
            element={
              <div className="empty">
                <h1>Page not found</h1>
                <Link to="/">Return to Gap</Link>
              </div>
            }
          />
        </Routes>
      </NoticeProvider>
    </SessionProvider>
  </BrowserRouter>,
);
