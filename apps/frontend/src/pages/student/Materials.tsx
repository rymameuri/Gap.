import { useState } from "react";
import { FileText, ArrowRight, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useCourse } from "../../layouts/StudentLayout";
import { coursePath } from "./course-model";
import { PageHeading, SectionHeading } from "./components/StudentUI";
import { MaterialReader } from "./components/MaterialReader";
import { CourseFiles } from "../../components/CourseFiles";
import { PublishedPresentations } from "./components/PublishedPresentations";

export function StudentMaterials() {
  const { course, gaps } = useCourse();
  const [selected, setSelected] = useState("syllabus");
  return (
    <>
      <PageHeading
        title="Course materials"
        description="The syllabus and explanations shared by your instructor."
      />
      <div className="s-materials-layout">
        <section className="s-material-list">
          <SectionHeading title="In this course" />
          <button
            className={`s-material-item ${selected === "syllabus" ? "selected" : ""}`}
            onClick={() => setSelected("syllabus")}
          >
            <BookOpen size={20} />
            <span>
              <strong>Course syllabus</strong>
              <small>Version {course.material_version}</small>
            </span>
          </button>
          {gaps
            .filter((gap) => gap.content)
            .map((gap) => (
              <button
                key={gap.id}
                className={`s-material-item ${selected === gap.id ? "selected" : ""}`}
                onClick={() => setSelected(gap.id)}
              >
                <FileText size={20} />
                <span>
                  <strong>{gap.topic}</strong>
                  <small>{gap.section}</small>
                </span>
              </button>
            ))}
          <Link className="s-text-link" to={coursePath(course.id, "assistant")}>
            Open Study Assistant <ArrowRight size={16} />
          </Link>
        </section>
        <MaterialReader
          course={course}
          gaps={gaps}
          selectedId={selected}
          onSelect={setSelected}
        />
      </div>
      <PublishedPresentations key={course.id} courseId={course.id} />
      <CourseFiles courseId={course.id} />
    </>
  );
}
