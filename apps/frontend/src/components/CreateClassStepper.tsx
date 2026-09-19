import { useRef, useState } from "react";
import { Upload, X, Check } from "lucide-react";
import { post } from "../services/api";

const STEPS = [
  "Name your class",
  "Add your syllabus",
  "Add past presentations",
  "Add useful websites",
  "Review and create",
];
const MAX_SYLLABUS_CHARS = 50_000;
const MAX_TEXT_BYTES = 200_000;
const MAX_DOCX_BYTES = 5_000_000;
const MAX_DECK_BYTES = 50_000_000;
const DECK_EXT = /\.(pptx|pdf)$/i;

type DeckFile = { id: string; name: string; error?: string };
type LinkItem = { url: string; host: string };

function countTopics(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && (/^([-*•]|\d+[.)]|week\s*\d+)/i.test(l) || l.length < 80))
    .length;
}

function parseUrl(raw: string): LinkItem | string {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes("."))
      return "Enter a valid web address.";
    return { url: url.toString(), host: url.hostname.replace(/^www\./, "") };
  } catch {
    return "Enter a valid web address.";
  }
}

export function CreateClassStepper({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (result: {
    id: string;
    join_code: string;
    name: string;
    syllabus: string;
  }) => void;
}) {
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [syllabus, setSyllabus] = useState(""),
    [syllabusFile, setSyllabusFile] = useState(""),
    [pasting, setPasting] = useState(false),
    [decks, setDecks] = useState<DeckFile[]>([]),
    [links, setLinks] = useState<LinkItem[]>([]),
    [linkInput, setLinkInput] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState<"syllabus" | "deck" | "">("");
  const syllabusInput = useRef<HTMLInputElement>(null);
  const deckInput = useRef<HTMLInputElement>(null);

  async function readSyllabus(file: File) {
    setNotice("");
    const isDocx = /\.docx$/i.test(file.name);
    const isTxt = /\.txt$/i.test(file.name) || file.type === "text/plain";
    if (!isDocx && !isTxt) {
      setNotice(
        "PDF syllabi can't be read yet. Upload a .docx or .txt, or paste the text instead.",
      );
      return;
    }
    if (file.size > (isDocx ? MAX_DOCX_BYTES : MAX_TEXT_BYTES)) {
      setNotice(
        isDocx
          ? "Choose a Word file smaller than 5 MB."
          : "Choose a text file smaller than 200 KB.",
      );
      return;
    }
    try {
      let content: string;
      if (isDocx) {
        const mammoth = await import("mammoth/mammoth.browser");
        content = (
          await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
        ).value.trim();
      } else {
        content = await file.text();
      }
      if (!content) {
        setNotice("That file has no readable text.");
        return;
      }
      if (content.length > MAX_SYLLABUS_CHARS) {
        setNotice("Syllabus text must be 50,000 characters or fewer.");
        return;
      }
      setSyllabus(content);
      setSyllabusFile(file.name);
      setPasting(false);
    } catch {
      setNotice("Could not read that file. Try another one or paste the text.");
    }
  }

  function addDecks(files: FileList | File[]) {
    const next: DeckFile[] = Array.from(files).map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}`,
      name: f.name,
      error: !DECK_EXT.test(f.name)
        ? "Only .pptx and .pdf files are supported."
        : f.size > MAX_DECK_BYTES
          ? "File is larger than 50 MB."
          : undefined,
    }));
    setDecks((cur) => [
      ...cur,
      ...next.filter((n) => !cur.some((c) => c.id === n.id)),
    ]);
  }

  function addLink() {
    const raw = linkInput.trim();
    if (!raw) return;
    const parsed = parseUrl(raw);
    if (typeof parsed === "string") return setNotice(parsed);
    if (links.some((l) => l.url === parsed.url))
      return setNotice("That link is already added.");
    setLinks([...links, parsed]);
    setLinkInput("");
    setNotice("");
  }

  function go(to: number) {
    setNotice("");
    setError("");
    setStep(to);
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ id: string; join_code: string }>(
        "/teacher/classes",
        { name: name.trim(), syllabus },
      );
      onCreated({ ...result, name: name.trim(), syllabus });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }

  const validDecks = decks.filter((d) => !d.error);
  const topics = countTopics(syllabus);
  const isLast = step === STEPS.length - 1;
  const nameOk = name.trim().length >= 3;

  const footer = (
    <p className="stepper-hint">You can add more later from the course page.</p>
  );

  return (
    <section className="stepper">
      <div className="stepper-progress" aria-label="Progress">
        <span className="eyebrow">
          Step {step + 1} of {STEPS.length}
        </span>
        <div className="stepper-bar" role="presentation">
          {STEPS.map((s, i) => (
            <span key={s} className={i <= step ? "on" : ""} />
          ))}
        </div>
      </div>
      <h2>{STEPS[step]}</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isLast) void create();
          else if (nameOk) go(step + 1);
        }}
      >
        {step === 0 && (
          <>
            <p>A unique join code will be created when you finish.</p>
            <label htmlFor="new-class-name">Class name</label>
            <input
              id="new-class-name"
              autoFocus
              required
              minLength={3}
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Introduction to Physics"
            />
          </>
        )}

        {step === 1 && (
          <>
            <p>We'll use your syllabus to map topics and build assessments.</p>
            {pasting ? (
              <>
                <label htmlFor="new-class-syllabus">Syllabus text</label>
                <textarea
                  id="new-class-syllabus"
                  autoFocus
                  value={syllabus}
                  onChange={(e) => {
                    setSyllabus(e.target.value);
                    setSyllabusFile("");
                  }}
                  maxLength={MAX_SYLLABUS_CHARS}
                  rows={8}
                  placeholder="Paste course topics, readings, and learning objectives"
                />
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setPasting(false)}
                >
                  Upload a file instead
                </button>
              </>
            ) : (
              <>
                <div
                  className={`dropzone ${dragging === "syllabus" ? "over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging("syllabus");
                  }}
                  onDragLeave={() => setDragging("")}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging("");
                    const f = e.dataTransfer.files[0];
                    if (f) void readSyllabus(f);
                  }}
                >
                  <Upload size={26} strokeWidth={1.4} />
                  <strong>Drag your syllabus here</strong>
                  <span className="muted">.docx and .txt files</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => syllabusInput.current?.click()}
                  >
                    Choose file
                  </button>
                  <input
                    ref={syllabusInput}
                    type="file"
                    accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    hidden
                    aria-label="Choose syllabus file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void readSyllabus(f);
                      e.target.value = "";
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setPasting(true)}
                >
                  Paste text instead
                </button>
              </>
            )}
            {syllabus.trim() && (
              <div className="extract-preview" aria-live="polite">
                <Check size={16} />
                <span>
                  {syllabusFile ? `${syllabusFile}: ` : ""}We found{" "}
                  <strong>{topics}</strong> topic{topics === 1 ? "" : "s"}.
                  Look right?
                </span>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <p>We'll use these to match your teaching style and content.</p>
            <div
              className={`dropzone ${dragging === "deck" ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging("deck");
              }}
              onDragLeave={() => setDragging("")}
              onDrop={(e) => {
                e.preventDefault();
                setDragging("");
                addDecks(e.dataTransfer.files);
              }}
            >
              <Upload size={26} strokeWidth={1.4} />
              <strong>Drag presentations here</strong>
              <span className="muted">.pptx or .pdf, up to 50 MB each</span>
              <button
                type="button"
                className="btn"
                onClick={() => deckInput.current?.click()}
              >
                Choose files
              </button>
              <input
                ref={deckInput}
                type="file"
                multiple
                accept=".pptx,.pdf"
                hidden
                aria-label="Choose presentation files"
                onChange={(e) => {
                  if (e.target.files) addDecks(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {decks.length > 0 && (
              <ul className="source-list">
                {decks.map((d) => (
                  <li key={d.id} className={d.error ? "failed" : ""}>
                    <span>{d.name}</span>
                    <span className="muted">{d.error ?? "Ready to attach"}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${d.name}`}
                      onClick={() =>
                        setDecks(decks.filter((x) => x.id !== d.id))
                      }
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="stepper-hint">
              Deck analysis isn't live yet, so these are not stored or used.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <p>Textbook pages, Khan Academy playlists, your school's resources.</p>
            <label htmlFor="link-input">Website address</label>
            <div className="link-row">
              <input
                id="link-input"
                autoFocus
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder="https://"
              />
              <button type="button" className="btn" onClick={addLink}>
                Add
              </button>
            </div>
            {links.length > 0 && (
              <ul className="chip-list">
                {links.map((l) => (
                  <li key={l.url} className="chip">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${l.host}&sz=32`}
                      alt=""
                      width={16}
                      height={16}
                    />
                    <span title={l.url}>{l.host}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${l.host}`}
                      onClick={() => setLinks(links.filter((x) => x !== l))}
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="stepper-hint">
              Links aren't fetched yet, so these are not stored or used.
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <p>
              <strong>{name.trim()}</strong>:{" "}
              {syllabus.trim() ? "1 syllabus" : "no syllabus"},{" "}
              {validDecks.length} deck{validDecks.length === 1 ? "" : "s"},{" "}
              {links.length} link{links.length === 1 ? "" : "s"}.
            </p>
            <p className="muted">
              Your join code appears as soon as the class is created.
            </p>
          </>
        )}

        {notice && <p role="alert" className="stepper-notice">{notice}</p>}
        {error && <p role="alert" className="stepper-notice">{error}</p>}
        {step > 0 && footer}

        <div className="stepper-actions">
          {step > 0 ? (
            <button type="button" className="btn ghost" onClick={() => go(step - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
          <div className="stepper-actions-right">
            {step > 0 && !isLast && (
              <button type="button" className="btn ghost" onClick={() => go(step + 1)}>
                Skip for now
              </button>
            )}
            <button className="btn primary" disabled={busy || !nameOk}>
              {isLast ? (busy ? "Creating…" : "Create class") : "Continue"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
