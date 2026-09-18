import { BookOpen, FileText } from "lucide-react";
import type { Course, Gap } from "../../../services/types";

export function MaterialReader({
  course,
  gaps,
  selectedId,
  onSelect,
}: {
  course: Course;
  gaps: Gap[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const materials = gaps.filter((gap) => gap.content);
  const selected = materials.find((gap) => gap.id === selectedId);
  return (
    <div className="s-material-reader">
      <div className="s-material-toolbar">
        <BookOpen size={18} aria-hidden="true" />
        <label htmlFor="material-select">Course reference</label>
      </div>
      <select
        id="material-select"
        value={selected?.id || "syllabus"}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="syllabus">Course syllabus</option>
        {materials.map((gap) => (
          <option key={gap.id} value={gap.id}>
            {gap.topic}
          </option>
        ))}
      </select>
      <article className="s-document">
        <span className="s-kicker">
          {selected
            ? "Instructor-approved explanation"
            : `Syllabus · Version ${course.material_version}`}
        </span>
        <h2>{selected?.topic || course.name}</h2>
        {selected && <p className="s-muted">{selected.section}</p>}
        <div className="s-document-body">
          {selected?.content ||
            course.syllabus ||
            "No syllabus has been shared yet."}
        </div>
        <div className="s-document-source">
          <FileText size={15} />
          {selected ? "Shared by your instructor" : "Course syllabus"}
        </div>
      </article>
    </div>
  );
}
