import { useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/ui";
export function Landing() {
  const [step, setStep] = useState(0),
    [feedback, setFeedback] = useState("");
  const views = [
    <>
      <span className="badge open">Misconception identified</span>
      <h2>
        “Moving things need
        <br />a constant push.”
      </h2>
      <p>A familiar idea. A different explanation waiting to happen.</p>
      <div className="demoevidence">
        <span>Force & motion</span>
        <b>12 students affected</b>
      </div>
    </>,
    <>
      <span className="badge sent">Assessment Agent</span>
      <h2>
        Let’s find out
        <br />
        what’s missing.
      </h2>
      <p>
        A puck glides on frictionless ice at constant velocity. What is the net
        force?
      </p>
      <div className="demoanswer wrong">
        A force in the direction of motion <span>Misconception</span>
      </div>
    </>,
    <>
      <span className="badge sent">Teacher-approved explanation</span>
      <h2>
        Motion doesn’t
        <br />
        need a push.
      </h2>
      <p>
        On frictionless ice, a puck keeps gliding. A force changes its velocity;
        it doesn’t maintain it.
      </p>
      <div className="demoevidence">
        <span>Content Agent</span>
        <b>Unit 1 · Newton’s laws</b>
      </div>
    </>,
    <>
      <span className="badge">Your turn</span>
      <h2>Did it click?</h2>
      <p>
        A puck moves at constant velocity on frictionless ice. What is the net
        force?
      </p>
      <div className="democheck">
        <button
          className="btn"
          onClick={() =>
            setFeedback(
              "Exactly. Zero net force. In your workspace, this check updates your teacher’s dashboard.",
            )
          }
        >
          Zero
        </button>
        <button
          className="btn"
          onClick={() =>
            setFeedback(
              "Not quite. Constant velocity means zero net force. A follow-up result helps the teacher know when more support is needed.",
            )
          }
        >
          A forward force
        </button>
      </div>
      {feedback && (
        <div role="status" className="feedback">
          {feedback}
        </div>
      )}
    </>,
  ];
  return (
    <div className="landing">
      <nav className="landnav" aria-label="Main navigation">
        <Brand />
        <div className="navlinks">
          <a href="#how">How it works</a>
          <a href="#classroom">For your classroom</a>
        </div>
        <Link className="btn" to="/login/teacher">
          Teacher workspace ↗
        </Link>
      </nav>
      <section className="hero">
        <div className="herocopy">
          <div className="eyebrow">
            <span className="tinyline" />A LITTLE CLARITY CHANGES EVERYTHING
          </div>
          <h1>
            There’s a moment
            <br />
            when it <em>clicks.</em>
            <br />
            Let’s get there.
          </h1>
          <p>
            Find the idea that’s holding someone back. Explain it a different
            way. Then check that it really makes sense.
          </p>
          <div className="heroactions">
            <Link className="btn primary" to="/login/teacher">
              I’m a teacher ↗
            </Link>
            <Link className="btn" to="/login/student">
              I’m a student ↗
            </Link>
          </div>
          <div className="herofoot">
            One learning loop. Two dedicated workspaces.
          </div>
        </div>
        <div className="loopdemo">
          <div className="demotop">
            <span>AN IDEA, UNDERSTOOD</span>
            <span className="demo-label">Interactive preview</span>
          </div>
          <div className="demosteps" aria-label="Learning loop">
            {["01 Diagnose", "02 Assess", "03 Explain", "04 Verify"].map(
              (s, i) => (
                <button
                  key={s}
                  aria-pressed={step === i}
                  className={step === i ? "current" : ""}
                  onClick={() => {
                    setStep(i);
                    setFeedback("");
                  }}
                >
                  {s}
                </button>
              ),
            )}
          </div>
          <div className="democontent" aria-live="polite">
            {views[step]}
          </div>
          <div className="demobottom">
            <span>Physics · Forces & motion</span>
            <span>Back to understanding ↻</span>
          </div>
        </div>
      </section>
      <div className="principle">
        <span>FROM “I DON’T GET IT”</span>
        <div className="principleline" />
        <span>TO “NOW I SEE IT.”</span>
      </div>
      <section id="how" className="how">
        <div className="sectionintro">
          <div className="eyebrow">THE LOOP MAKES THE DIFFERENCE</div>
          <h2>
            Teaching doesn’t end
            <br />
            with an explanation.
          </h2>
          <p>
            Understanding deserves a follow-up. Each check brings the next
            learning gap into focus—or shows that it’s closed.
          </p>
        </div>
        <div className="looplist">
          {[
            [
              "Find the real gap.",
              "Diagnostic groups misconceptions and ranks topics by how many students are affected and how much support they need.",
            ],
            [
              "Ask the right question.",
              "Assessment drafts questions and grades against a rubric. Uncertain grades wait for teacher review.",
            ],
            [
              "Make it make sense.",
              "Content prepares an explanation tied to the syllabus. The teacher approves it before it’s shared.",
            ],
            [
              "Know it worked.",
              "A short follow-up checks the same idea in a new situation. Results return to the teacher.",
            ],
          ].map(([h, p], i) => (
            <article key={h}>
              <span>0{i + 1}</span>
              <div>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section id="classroom" className="classroom">
        <div className="eyebrow">DIFFERENT NEEDS. THEIR OWN SPACE.</div>
        <h2>
          A clearer classroom.
          <br />A more confident learner.
        </h2>
        <div className="audiences">
          {[
            [
              "teacher",
              "See the class. Reach the individual.",
              "Explore learning gaps, create assessments, review uncertain grades, and approve focused explanations.",
            ],
            [
              "student",
              "One idea at a time. Your own way forward.",
              "See your own gaps, work through a clear explanation, try a follow-up question, and track your understanding.",
            ],
          ].map(([role, h, p]) => (
            <article key={role}>
              <div className="audiencehead">
                <span className="audienceicon">{role[0].toUpperCase()}</span>
                <span className="eyebrow">FOR {role.toUpperCase()}S</span>
              </div>
              <h3>{h}</h3>
              <p>{p}</p>
              <Link to={"/login/" + role}>Explore {role} workspace ↗</Link>
            </article>
          ))}
        </div>
      </section>
      <section className="closing">
        <div className="eyebrow">SMALL GAPS. BIG POSSIBILITIES.</div>
        <h2>
          The next “aha”
          <br />
          starts here<span>.</span>
        </h2>
        <div className="heroactions">
          <Link className="btn primary" to="/login/teacher">
            Open teacher workspace ↗
          </Link>
          <Link className="btn" to="/login/student">
            Open student workspace ↗
          </Link>
        </div>
      </section>
      <footer className="landfooter">
        <Brand />
        <span>Meridian Foundation · Education track</span>
        <span>A little clarity changes everything.</span>
      </footer>
    </div>
  );
}
