import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { screenWellbeing } from "./wellbeing.js";

const severity = (text: string) => screenWellbeing(text)?.severity ?? null;
const category = (text: string) => screenWellbeing(text)?.category ?? null;

describe("screenWellbeing", () => {
  test("flags self-harm as urgent, including curly apostrophes", () => {
    for (const text of [
      "I want to kill myself",
      "i don\u2019t want to live anymore",
      "Everyone would be better off without me",
      "thinking about suicide",
      "I've been cutting myself",
    ]) {
      assert.equal(severity(text), "urgent", text);
      assert.equal(category(text), "self_harm", text);
    }
  });

  test("flags safety concerns as urgent", () => {
    assert.equal(severity("My stepdad keeps hitting me"), "urgent");
    assert.equal(category("I'm scared to go home"), "safety");
  });

  test("grades lesser signals", () => {
    assert.equal(severity("I feel hopeless"), "high");
    assert.equal(severity("I'm so overwhelmed and can't sleep"), "medium");
    assert.equal(category("I have no friends here"), "isolation");
    assert.equal(category("I think I'm depressed"), "low_mood");
    assert.equal(severity("I give up, I want to drop out"), "low");
  });

  test("the most severe signal wins", () => {
    assert.equal(
      category("I'm stressed and lonely and I want to end my life"),
      "self_harm",
    );
  });

  test("ignores ordinary study questions", () => {
    for (const text of [
      "What is Newton's second law?",
      "How do I kill a process in the lab exercise?",
      "Can you explain the stress-strain curve?",
      "Why does a puck keep moving?",
    ])
      assert.equal(screenWellbeing(text), null, text);
  });
});
