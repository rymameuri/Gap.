export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  length: number;
  isFinal?: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorLike {
  error?: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export interface SpeechRecognitionHost {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export function getSpeechRecognitionConstructor(
  host: SpeechRecognitionHost | undefined,
): SpeechRecognitionConstructor | undefined {
  return host?.SpeechRecognition || host?.webkitSpeechRecognition;
}

export function collectSpeechTranscript(
  event: SpeechRecognitionEventLike,
): string {
  const parts: string[] = [];
  const firstResult = Math.max(0, event.resultIndex || 0);

  for (let index = firstResult; index < event.results.length; index += 1) {
    const transcript = event.results[index]?.[0]?.transcript?.trim();
    if (transcript) parts.push(transcript);
  }

  return parts.join(" ").trim();
}

export function appendSpeechTranscript(
  currentValue: string,
  transcript: string,
): string {
  const nextText = transcript.trim();
  if (!nextText) return currentValue;
  if (!currentValue.trim()) return nextText;

  return `${currentValue}${/\s$/.test(currentValue) ? "" : " "}${nextText}`;
}

export function speechRecognitionErrorMessage(error?: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was denied. You can keep typing.";
    case "audio-capture":
      return "No microphone was found. You can keep typing.";
    case "no-speech":
      return "No speech was detected. Try again or keep typing.";
    case "network":
      return "Voice input needs a network connection. You can keep typing.";
    default:
      return "Voice input could not start. You can keep typing.";
  }
}
