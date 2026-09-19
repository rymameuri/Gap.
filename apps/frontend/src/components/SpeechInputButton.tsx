import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import {
  collectSpeechTranscript,
  getSpeechRecognitionConstructor,
  speechRecognitionErrorMessage,
  type SpeechRecognitionHost,
  type SpeechRecognitionLike,
} from "./speech-recognition";

interface SpeechInputButtonProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  language?: string;
  label?: string;
  className?: string;
}

function browserSpeechHost(): SpeechRecognitionHost | undefined {
  if (typeof window === "undefined") return undefined;
  return window as unknown as SpeechRecognitionHost;
}

function abortRecognition(recognition: SpeechRecognitionLike) {
  recognition.onstart = null;
  recognition.onend = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.abort();
}

export function SpeechInputButton({
  onTranscript,
  disabled = false,
  language = "en-US",
  label = "Dictate text",
  className = "",
}: SpeechInputButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const supported = Boolean(
    getSpeechRecognitionConstructor(browserSpeechHost()),
  );

  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      abortRecognition(recognition);
      recognitionRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!disabled || !recognitionRef.current) return;
    abortRecognition(recognitionRef.current);
    recognitionRef.current = null;
    setListening(false);
  }, [disabled]);

  function stopListening() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }

  function startListening() {
    const Recognition = getSpeechRecognitionConstructor(browserSpeechHost());
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = language;
    recognitionRef.current = recognition;
    setError("");

    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      const transcript = collectSpeechTranscript(event);
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      setError(speechRecognitionErrorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setListening(false);
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError(speechRecognitionErrorMessage());
    }
  }

  const buttonLabel = !supported
    ? "Voice input is not supported in this browser"
    : listening
      ? "Stop listening"
      : label;

  return (
    <span className={`speech-input ${className}`.trim()}>
      <button
        type="button"
        className={`speech-input-button ${listening ? "is-listening" : ""}`}
        aria-label={buttonLabel}
        aria-pressed={listening}
        title={buttonLabel}
        disabled={disabled || !supported}
        onClick={listening ? stopListening : startListening}
      >
        {listening ? <MicOff size={17} /> : <Mic size={17} />}
      </button>
      {listening && (
        <span className="speech-input-status" role="status">
          Listening…
        </span>
      )}
      {error && !listening && (
        <span className="speech-input-status is-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
