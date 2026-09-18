import { Navigate, useParams } from "react-router-dom";
import { useStudent } from "../../layouts/StudentLayout";
import { coursePath } from "./course-model";

export function LegacyStudentRoute({ page = "" }: { page?: string }) {
  const { data } = useStudent();
  const { id } = useParams();
  const gap = data.gaps.find((item) => item.id === id);
  const courseId = gap?.class_id || data.courses[0]?.id;
  return (
    <Navigate
      replace
      to={
        courseId
          ? coursePath(courseId, gap ? `lessons/${gap.id}` : page)
          : "/student"
      }
    />
  );
}
