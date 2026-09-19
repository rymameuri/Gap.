export type AssistantBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "code"; text: string; language: string }
  | { type: "rule" };

const headingPattern = /^(#{1,3})\s+(.+)$/;
const unorderedPattern = /^\s*[-*•]\s+(.+)$/;
const orderedPattern = /^\s*\d+[.)]\s+(.+)$/;
const codeFencePattern = /^```\s*([^\s`]*)\s*$/;

function startsBlock(line: string): boolean {
  return (
    !line.trim() ||
    headingPattern.test(line) ||
    unorderedPattern.test(line) ||
    orderedPattern.test(line) ||
    codeFencePattern.test(line) ||
    /^\s*---+\s*$/.test(line)
  );
}

/** Parse the small, safe Markdown subset used by Study Assistant answers. */
export function parseAssistantMarkdown(content: string): AssistantBlock[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: AssistantBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = line.match(codeFencePattern);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !codeFencePattern.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", text: body.join("\n"), language: fence[1] });
      continue;
    }

    const heading = line.match(headingPattern);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const unordered = line.match(unorderedPattern);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(unorderedPattern);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    const ordered = line.match(orderedPattern);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(orderedPattern);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    const paragraph: string[] = [trimmed];
    index += 1;
    while (index < lines.length && !startsBlock(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}
