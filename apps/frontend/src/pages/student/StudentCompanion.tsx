import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Sparkles, SquarePen, Trash2 } from "lucide-react";
import { useCourse } from "../../layouts/StudentLayout";
import { api, post } from "../../services/api";
import type {
  ConversationDetail,
  ConversationSummary,
  StudyAssistantResponse,
  StudySource,
} from "../../services/types";
import { SpeechInputButton } from "../../components/SpeechInputButton";
import { appendSpeechTranscript } from "../../components/speech-recognition";
import { Reveal } from "../../components/Reveal";
import { errorMessage } from "./course-model";
import { AssistantAnswer } from "./components/AssistantAnswer";

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: StudySource[];
};

const PROMPTS = [
  "Explain a topic I'm stuck on",
  "Help me plan my revision this week",
  "I'm feeling stressed about school",
  "I just need someone to talk to",
];

const sourceLabel = (s: StudySource) =>
  /^(Wellbeing guide|Study skills): /.test(s.title)
    ? s.title
    : "Course material · " + s.title;

/** A ChatGPT-style companion for schoolwork and everyday wellbeing. */
export function StudentCompanion() {
  const { course } = useCourse();
  const [params, setParams] = useSearchParams();
  const [chats, setChats] = useState<ConversationSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(-1);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const listUrl = `/student/classes/${encodeURIComponent(course.id)}/conversations`;

  const loadChats = useCallback(async () => {
    try {
      const r = await api<{ conversations: ConversationSummary[] }>(listUrl);
      setChats(r.conversations);
    } catch {
      // The list is a convenience; one retry covers a brief server restart.
      setTimeout(() => {
        api<{ conversations: ConversationSummary[] }>(listUrl)
          .then((r) => setChats(r.conversations))
          .catch(() => undefined);
      }, 1500);
    }
  }, [listUrl]);

  const open = useCallback(
    async (id: string) => {
      setError("");
      setTyping(-1);
      try {
        const r = await api<ConversationDetail>(`/student/conversations/${id}`);
        setChatId(id);
        setMsgs(
          r.messages.map((m) => ({
            role: m.role,
            content: m.content,
            sources: m.sources,
          })),
        );
        setParams({ conversation: id }, { replace: true });
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [setParams],
  );

  useEffect(() => {
    setChatId(null);
    setMsgs([]);
    setError("");
    setTyping(-1);
    setChats([]);
    void loadChats();
    const linked = params.get("conversation");
    if (linked) void open(linked);
    // Runs once per course; later URL changes come from this page itself.
  }, [course.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);

  function startNew() {
    if (busy) return;
    setChatId(null);
    setMsgs([]);
    setError("");
    setTyping(-1);
    setParams({}, { replace: true });
    input.current?.focus();
  }

  async function remove(id: string) {
    try {
      await api(`/student/conversations/${id}`, { method: "DELETE" });
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
      const r = await post<StudyAssistantResponse>(
        `/student/classes/${encodeURIComponent(course.id)}/companion`,
        { message: m, ...(chatId ? { conversationId: chatId } : {}) },
      );
      setChatId(r.conversationId);
      setParams({ conversation: r.conversationId }, { replace: true });
      setMsgs((x) => {
        setTyping(x.length);
        return [
          ...x,
          { role: "assistant", content: r.content, sources: r.sources },
        ];
      });
      void loadChats();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cgpt cgpt-student" aria-label="Study companion">
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
              <button
                onClick={() => !busy && c.id !== chatId && void open(c.id)}
                title={c.title}
              >
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
              <h2>How can I help today?</h2>
              <p>
                Ask about {course.name} or anything else at school, from a
                tricky topic to exam stress.
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
                        <span key={j} className="csrc">
                          {sourceLabel(s)}
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
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="Ask anything about school or how you're feeling…"
            maxLength={2000}
            disabled={busy}
            aria-label="Message"
          />
          <SpeechInputButton
            label="Dictate a message"
            disabled={busy}
            onTranscript={(t) =>
              setText((cur) => appendSpeechTranscript(cur, t))
            }
          />
          <button disabled={busy || !text.trim()} aria-label="Send">
            <Send size={16} />
          </button>
        </form>
        <p className="cgpt-note">
          This is an AI, not a counsellor. If you tell it you might be unsafe,
          your teacher may be told so someone can check in on you. In an
          emergency, call your local emergency number.
        </p>
      </section>
    </div>
  );
}
