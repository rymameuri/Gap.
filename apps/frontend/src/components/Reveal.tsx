import { useEffect, useState } from "react";
import { AssistantAnswer } from "../pages/student/components/AssistantAnswer";

/** Reveals an already-received answer word by word so long replies read as they arrive. */
export function Reveal({
  text,
  onTick,
  onDone,
}: {
  text: string;
  onTick: () => void;
  onDone: () => void;
}) {
  const [n, setN] = useState(0);
  const parts = text.split(/(\s+)/);
  useEffect(() => {
    if (n >= parts.length) {
      onDone();
      return;
    }
    const id = setTimeout(() => {
      setN((v) => Math.min(parts.length, v + 4));
      onTick();
    }, 25);
    return () => clearTimeout(id);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return <AssistantAnswer content={parts.slice(0, n).join("")} />;
}
