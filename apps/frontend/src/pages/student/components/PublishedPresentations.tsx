import { useEffect, useState } from "react";
import { api } from "../../../services/api";
import type { Presentation } from "../../../services/types";
import { ErrorBox } from "../../../components/ui";
import { SlideViewer } from "../../../components/SlideViewer";

export function PublishedPresentations({ courseId }: { courseId: string }) {
  const [decks, setDecks] = useState<Presentation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await api<{ presentations: Presentation[] }>(
          `/student/classes/${encodeURIComponent(courseId)}/presentations`,
        );
        if (active) {
          setDecks(result.presentations);
          setError("");
        }
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Presentations could not be loaded.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [courseId]);
  return (
    <section
      className="material-section"
      aria-labelledby="published-presentations-heading"
    >
      <h2 id="published-presentations-heading">Class presentations</h2>
      {error && <ErrorBox message={error} />}
      {loading ? (
        <p role="status">Loading presentations...</p>
      ) : decks.length ? (
        decks.map((deck) => (
          <details className="s-evidence-note" key={deck.id}>
            <summary>{deck.title}</summary>
            <SlideViewer slides={deck.slides} />
          </details>
        ))
      ) : (
        <p className="s-muted">No presentations have been shared yet.</p>
      )}
    </section>
  );
}
