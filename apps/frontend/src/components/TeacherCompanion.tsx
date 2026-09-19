import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, SquarePen, Trash2 } from "lucide-react";
import { api, post, ApiError } from "../services/api";
import { AssistantAnswer } from "../pages/student/components/AssistantAnswer";
import { Reveal } from "./Reveal";

type Source = { kind: "pedagogy" | "class"; title: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };
type Chat = { id: string; title: string; updated_at: string };

const PROMPTS = [
  "What should I reteach this week?",
  "Who needs my attention right now?",
  "How do I run a small-group intervention on my top gap?",
  "Suggest a warm-up that targets my open gaps",
];

const base = (classId: string) =>
  `/teacher/classes/${encodeURIComponent(classId)}/companion`;

/** Full-page, ChatGPT-style teaching companion: saved chats on the left, conversation on the right. */
export function TeacherCompanion({
  classId,
  className,
}: {
  classId: string;
  className: string;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(-1);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const loadChats = useCallback(async () => {
    try {
      const r = await api<{ chats: Chat[] }>(base(classId) + "/chats");
      setChats(r.chats);
    } catch {
      /* the list is a convenience; the chat itself still works */
    }
  }, [classId]);

  useEffect(() => {
    setChatId(null);
    setMsgs([]);
    setError("");
    setTyping(-1);
    setChats([]);
    if (classId) void loadChats();
  }, [classId, loadChats]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);

  async function open(id: string) {
    if (busy || id === chatId) return;
    setError("");
    setTyping(-1);
    try {
      const r = await api<{ messages: Msg[] }>(`${base(classId)}/chats/${id}`);
      setChatId(id);
      setMsgs(r.messages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open that chat.");
    }
  }

  function startNew() {
    if (busy) return;
    setChatId(null);
    setMsgs([]);
    setError("");
    setTyping(-1);
    input.current?.focus();
  }

  async function remove(id: string) {
    try {
      await api(`${base(classId)}/chats/${id}`, { method: "DELETE" });
      setChats((c) => c.filter((x) => x.id !== id));
      if (id === chatId) startNew();
    } catch {
      setError("Could not delete that chat. Try again.");
    }
  }

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setMsgs((x) => [...x, { role: "user", content: m }]);
    setText("");
    setError("");
    setBusy(true);
    try {
      const r = await post<{
        chatId: string;
        content: string;
        sources: Source[];
      }>(base(classId), { message: m, ...(chatId ? { chatId } : {}) });
      setChatId(r.chatId);
      setMsgs((x) => {
        setTyping(x.length);
        return [
          ...x,
          { role: "assistant", content: r.content, sources: r.sources },
        ];
      });
      void loadChats();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!classId) return null;
  return (
    <div className="cgpt" aria-label="Teaching companion">
      <nav className="cgpt-list" aria-label="Previous chats">
        <button className="cgpt-new" onClick={startNew} disabled={busy}>
          <SquarePen size={16} /> New chat
        </button>
        <div className="cgpt-label">Recent</div>
        <div className="cgpt-items">
          {chats.length === 0 && (
            <p className="cgpt-none">Your chats will appear here.</p>
          )}
          {chats.map((c) => (
            <div
              key={c.id}
              className={"cgpt-item" + (c.id === chatId ? " active" : "")}
            >
              <button onClick={() => void open(c.id)} title={c.title}>
                {c.title}
              </button>
              <button
                className="cgpt-del"
                onClick={() => void remove(c.id)}
                aria-label={"Delete chat: " + c.title}
                title="Delete chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </nav>

      <section className="cgpt-main">
        <div className="cgpt-scroll">
          {msgs.length === 0 ? (
            <div className="cgpt-empty">
              <Sparkles size={28} />
              <h2>How can I help with {className}?</h2>
              <p>
                Ask about teaching strategies, or about this class: gaps, who
                needs support, what to reteach.
              </p>
              <div className="cgpt-chips">
                {PROMPTS.map((p) => (
                  <button key={p} className="chip" onClick={() => void send(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="cgpt-thread">
              {msgs.map((m, i) => (
                <div key={i} className={"cmsg " + m.role}>
                  {m.role === "assistant" ? (
                    i === typing ? (
                      <Reveal
                        text={m.content}
                        onTick={() =>
                          end.current?.scrollIntoView({ block: "end" })
                        }
                        onDone={() => setTyping(-1)}
                      />
                    ) : (
                      <AssistantAnswer content={m.content} />
                    )
                  ) : (
                    m.content
                  )}
                  {!!m.sources?.length && (
                    <div className="csources">
                      {m.sources.map((s, j) => (
                        <span key={j} className={"csrc " + s.kind}>
                          {s.kind === "class" ? "Class data" : "Teaching KB"}
                          {" · "}
                          {s.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && <div className="cmsg assistant typing">Thinking…</div>}
              {error && <div className="cerror">{error}</div>}
              <div ref={end} />
            </div>
          )}
          {msgs.length === 0 && error && <div className="cerror">{error}</div>}
        </div>
        <form
          className="cgpt-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            ref={input}
            aria-label="Message your teaching companion"
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="Message your teaching companion…"
            maxLength={2000}
            disabled={busy}
          />
          <button disabled={busy || !text.trim()} aria-label="Send">
            <Send size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}
