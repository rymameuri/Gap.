import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Brand } from "../components/ui";
import { CreateClassStepper } from "../components/CreateClassStepper";

export function CreateClass() {
  const navigate = useNavigate();
  return (
    <div className="class-dashboard teacher-dashboard">
      <header className="class-dash-header">
        <Brand />
      </header>
      <main className="create-class-main">
        <Link className="link-button" to="/teacher">
          <ArrowLeft size={14} /> Back to courses
        </Link>
        <CreateClassStepper
          onCancel={() => navigate("/teacher")}
          onCreated={(created) =>
            navigate("/teacher", { state: { created } })
          }
        />
      </main>
    </div>
  );
}
