import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, X } from "lucide-react";
import type { Slide } from "../services/types";

/** Fullscreen present mode: arrow keys / Space to advance, Esc to exit. */
export function PresentMode({
  title,
  slides,
  startIndex = 0,
  onClose,
}: {
  title: string;
  slides: Slide[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(
    Math.min(Math.max(0, startIndex), Math.max(0, slides.length - 1)),
  );
  const [showNotes, setShowNotes] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const slide = slides[index];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = document.documentElement;
    void root.requestFullscreen?.().catch(() => {
      /* browser may deny; overlay still works */
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, slides.length - 1));
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setIndex(0);
      }
      if (e.key === "End") {
        e.preventDefault();
        setIndex(slides.length - 1);
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setShowNotes((v) => !v);
      }
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [slides.length]);

  if (!slide) return null;

  return (
    <div className="present-mode" role="dialog" aria-modal="true" aria-label={title || "Presentation"}>
      <header className="present-chrome">
        <span className="present-title">{title || "Presentation"}</span>
        <div className="present-tools">
          <button
            type="button"
            className="btn small"
            onClick={() => setShowNotes((v) => !v)}
            aria-pressed={showNotes}
          >
            {showNotes ? <EyeOff size={15} /> : <Eye size={15} />}
            {showNotes ? "Hide notes" : "Notes"}
          </button>
          <button type="button" className="btn small" onClick={onClose}>
            <X size={15} /> Exit
          </button>
        </div>
      </header>

      <div className="present-stage">
        <div className="present-frame">
          <h2>{slide.title || "Untitled slide"}</h2>
          <ul>
            {slide.bullets
              .filter((b) => b.trim())
              .map((b, i) => (
                <li key={i}>{b}</li>
              ))}
          </ul>
        </div>
        {showNotes && slide.notes.trim() && (
          <p className="present-notes">
            <strong>Notes</strong> {slide.notes}
          </p>
        )}
      </div>

      <footer className="present-chrome present-footer">
        <button
          type="button"
          className="btn small"
          aria-label="Previous slide"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="muted">
          {index + 1} / {slides.length}
          <span className="present-hint"> · ← → · Esc to exit · N notes</span>
        </span>
        <button
          type="button"
          className="btn small"
          aria-label="Next slide"
          disabled={index >= slides.length - 1}
          onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
        >
          <ChevronRight size={16} />
        </button>
      </footer>
    </div>
  );
}
