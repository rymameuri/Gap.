import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSpeechTranscript,
  collectSpeechTranscript,
  getSpeechRecognitionConstructor,
  speechRecognitionErrorMessage,
  type SpeechRecognitionLike,
} from "./speech-recognition";

class StandardRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  onstart = null;
  onend = null;
  onresult = null;
  onerror = null;
  start() {}
  stop() {}
  abort() {}
}

class PrefixedRecognition extends StandardRecognition {}

test("prefers the standard speech recognition constructor", () => {
  assert.equal(
    getSpeechRecognitionConstructor({
      SpeechRecognition: StandardRecognition,
      webkitSpeechRecognition: PrefixedRecognition,
    }),
    StandardRecognition,
  );
});

test("falls back to the prefixed speech recognition constructor", () => {
  assert.equal(
    getSpeechRecognitionConstructor({
      webkitSpeechRecognition: PrefixedRecognition,
    }),
    PrefixedRecognition,
  );
  assert.equal(getSpeechRecognitionConstructor(undefined), undefined);
});

test("collects transcripts starting at the event result index", () => {
  assert.equal(
    collectSpeechTranscript({
      resultIndex: 1,
      results: {
        0: { 0: { transcript: "ignore this" }, length: 1 },
        1: { 0: { transcript: "Newton's first law" }, length: 1 },
        2: { 0: { transcript: "in simple words" }, length: 1 },
        length: 3,
      },
    }),
    "Newton's first law in simple words",
  );
});

test("appends speech without replacing editable text", () => {
  assert.equal(
    appendSpeechTranscript("", "  Explain momentum  "),
    "Explain momentum",
  );
  assert.equal(
    appendSpeechTranscript("Please", "explain momentum"),
    "Please explain momentum",
  );
  assert.equal(
    appendSpeechTranscript("Please ", "explain momentum"),
    "Please explain momentum",
  );
  assert.equal(appendSpeechTranscript("Keep this", "   "), "Keep this");
});

test("returns clear recoverable recognition errors", () => {
  assert.match(speechRecognitionErrorMessage("not-allowed"), /permission/i);
  assert.match(speechRecognitionErrorMessage("audio-capture"), /microphone/i);
  assert.match(speechRecognitionErrorMessage("no-speech"), /No speech/i);
  assert.match(speechRecognitionErrorMessage("network"), /network/i);
  assert.match(speechRecognitionErrorMessage("unknown"), /could not start/i);
});
