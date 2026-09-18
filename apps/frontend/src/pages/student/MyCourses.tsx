import { ArrowUpRight, BookOpen, GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import { useStudent } from "../../layouts/StudentLayout";
import { useSession } from "../../services/session";
import { coursePath } from "./course-model";
import { EmptyState, PageHeading } from "./components/StudentUI";

export function MyCourses() {
  const { data } = useStudent();
  const { user } = useSession();
  return (
    <main className="s-course-list" id="student-content">
      <PageHeading
        title="My courses"
        description={`Welcome back, ${user?.name.split(" ")[0] || "there"}. What are we working on today?`}
      />
      {data.courses.length ? (
        <div className="s-course-grid">
          {data.courses.map((course, index) => {
            const quizzes = data.quizzes.filter(
              (quiz) => quiz.class_id === course.id && !quiz.submission,
            );
            const reviews = data.gaps.filter(
              (gap) =>
                gap.class_id === course.id &&
                gap.content &&
                gap.status !== "resolved",
            );
            return (
              <Link
                className={`s-course-card s-course-color-${index % 3}`}
                key={course.id}
                to={coursePath(course.id)}
              >
                <div className="s-course-card-top">
                  <span className="s-course-symbol">
                    <BookOpen size={28} />
                  </span>
                  <ArrowUpRight size={22} aria-hidden="true" />
                </div>
                <div>
                  <span className="s-muted">Enrolled course</span>
                  <h2>{course.name}</h2>
                </div>
                <div className="s-course-card-bottom">
                  <span>
                    {quizzes.length
                      ? `${quizzes.length} quiz${quizzes.length === 1 ? "" : "zes"} available`
                      : "Course materials available"}
                  </span>
                  {reviews.length > 0 && (
                    <span
                      className="s-new-dot"
                      title="New instructor explanation"
                    />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="Your courses will appear here">
          <p>Your instructor will add you to a course when it is ready.</p>
        </EmptyState>
      )}
    </main>
  );
}
