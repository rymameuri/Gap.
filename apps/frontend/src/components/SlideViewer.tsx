import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Slide } from "../services/types";

/** One slide at a time with previous/next; notes only when `showNotes` (teacher). */
export function SlideViewer({
  slides,
  index,
  onIndex,
  showNotes = false,
}: {
  slides: Slide[];
  index?: number;
  onIndex?: (i: number) => void;
  showNotes?: boolean;
}) {
  const [own, setOwn] = useState(0);
  const current = Math.min(index ?? own, Math.max(0, slides.length - 1));
  const go = (i: number) => (onIndex ? onIndex(i) : setOwn(i));
  const slide = slides[current];
  if (!slide) return null;
  return (
    <div className="slide-viewer">
      <div className="slide-frame">
        <h3>{slide.title || "Untitled slide"}</h3>
        <ul>
          {slide.bullets
            .filter((b) => b.trim())
            .map((b, i) => (
              <li key={i}>{b}</li>
            ))}
        </ul>
      </div>
      {showNotes && slide.notes && (
        <p className="slide-notes">
          <strong>Notes:</strong> {slide.notes}
        </p>
      )}
      <div className="slide-nav">
        <button
          className="btn small"
          aria-label="Previous slide"
          disabled={current === 0}
          onClick={() => go(current - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="muted">
          Slide {current + 1} of {slides.length}
        </span>
        <button
          className="btn small"
          aria-label="Next slide"
          disabled={current >= slides.length - 1}
          onClick={() => go(current + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
