import { Fragment, type ReactNode } from "react";
import { parseAssistantMarkdown } from "../assistant-format";

const inlinePattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[S\d+\])/g;

function renderInline(text: string): ReactNode[] {
  return text
    .split(inlinePattern)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }
      if (/^\[S\d+\]$/.test(part)) {
        return (
          <span className="s-inline-citation" key={index}>
            {part}
          </span>
        );
      }
      return <Fragment key={index}>{part}</Fragment>;
    });
}

export function AssistantAnswer({ content }: { content: string }) {
  const blocks = parseAssistantMarkdown(content);

  return (
    <div className="s-assistant-answer">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const children = renderInline(block.text);
            if (block.level === 1) return <h2 key={index}>{children}</h2>;
            if (block.level === 2) return <h3 key={index}>{children}</h3>;
            return <h4 key={index}>{children}</h4>;
          }
          case "paragraph":
            return <p key={index}>{renderInline(block.text)}</p>;
          case "unordered-list":
            return (
              <ul key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre key={index} data-language={block.language || undefined}>
                <code>{block.text}</code>
              </pre>
            );
          case "rule":
            return <hr key={index} />;
        }
      })}
    </div>
  );
}
