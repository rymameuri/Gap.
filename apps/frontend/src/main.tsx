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
import { TeacherLayout, StudentLayout } from "./layouts/workspace";
import { Login } from "./pages/auth/Login";
import { ClassDashboard } from "./pages/ClassDashboard";
import { Landing } from "./pages/Landing";
import {
  Overview,
  Assessments,
  ReviewQueue,
  ContentStudio,
  Materials,
  AgentActivity,
} from "./pages/instructor/TeacherPages";
import {
  MyLearning,
  Lesson,
  StudentAssessments,
  Progress,
} from "./pages/student/StudentPages";
import { useEffect, type ReactNode } from "react";
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
        <p>You are signed in as a {user.role}.</p>
        <Link className="btn primary" to={"/" + user.role + "/"}>
          Open my workspace
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
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <DocumentTitle />
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
            <Route path="overview" element={<Overview />} />
            <Route path="assessments" element={<Assessments />} />
            <Route path="review" element={<ReviewQueue />} />
            <Route path="content" element={<ContentStudio />} />
            <Route path="materials" element={<Materials />} />
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
            <Route path="learning" element={<MyLearning />} />
            <Route path="gaps/:id" element={<Lesson />} />
            <Route path="assessments" element={<StudentAssessments />} />
            <Route path="progress" element={<Progress />} />
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
