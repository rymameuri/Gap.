import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSession } from "../../services/session";
import { Brand, ErrorBox } from "../../components/ui";
export function Login() {
  const role = useParams().role === "teacher" ? "teacher" : "student",
    navigate = useNavigate(),
    { login } = useSession();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function signIn(demo = false) {
    setBusy(true);
    setError("");
    try {
      const user = await login(
        demo
          ? role === "teacher"
            ? "teacher@gap.demo"
            : "student@gap.demo"
          : email,
        demo ? "GapDemo!2026" : password,
      );
      navigate("/" + user.role + "/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <Brand />
      <section className="panel auth-card">
        <div className="eyebrow">{role.toUpperCase()} WORKSPACE</div>
        <h1>
          {role === "teacher" ? "A clearer classroom." : "Your next “aha”."}
        </h1>
        <p>Sign in to your own learning workspace.</p>
        {error && <ErrorBox message={error} />}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <label className="field" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="field" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            disabled={busy}
            className="btn primary full"
            style={{ marginTop: 24 }}
          >
            Sign in
          </button>
        </form>
        <div className="auth-divider">Exploring the sample classroom?</div>
        <button
          className="btn full"
          disabled={busy}
          onClick={() => void signIn(true)}
        >
          Use {role} demo
        </button>
        <p className="notice">
          Demo accounts use sample data. Demo password: GapDemo!2026
        </p>
        <Link className="muted" to="/">
          ← Back to Gap
        </Link>
      </section>
    </div>
  );
}
