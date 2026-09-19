import assert from "node:assert/strict";
import test from "node:test";
import { parseAssistantMarkdown } from "./assistant-format";

test("parses headings, paragraphs, and lists from assistant Markdown", () => {
  const blocks = parseAssistantMarkdown(`## Course overview

**Force** changes motion [S1].

- Newton's laws
- Momentum

1. Read the concept
2. Work an example`);

  assert.deepEqual(blocks, [
    { type: "heading", level: 2, text: "Course overview" },
    { type: "paragraph", text: "**Force** changes motion [S1]." },
    { type: "unordered-list", items: ["Newton's laws", "Momentum"] },
    {
      type: "ordered-list",
      items: ["Read the concept", "Work an example"],
      start: 1,
    },
  ]);
});

test("preserves step numbers when explanatory bullets separate ordered items", () => {
  const blocks = parseAssistantMarkdown(
    "1. Sample\n- Read twice\n2. Compare\n- Check target\n3. Adjust",
  );
  assert.deepEqual(
    blocks
      .filter((block) => block.type === "ordered-list")
      .map((block) => block.start),
    [1, 2, 3],
  );
});

test("keeps fenced code as a separate block without interpreting its contents", () => {
  const blocks = parseAssistantMarkdown(
    "```python\nprint('safe')\n```\n\nDone.",
  );

  assert.deepEqual(blocks, [
    { type: "code", text: "print('safe')", language: "python" },
    { type: "paragraph", text: "Done." },
  ]);
});
