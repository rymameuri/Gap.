import { TeacherCompanion } from "../../components/TeacherCompanion";
import { useTeacher } from "../../layouts/workspace";

export function CompanionPage() {
  const { data } = useTeacher();
  return (
    <TeacherCompanion classId={data.course.id} className={data.course.name} />
  );
}
