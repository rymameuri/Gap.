import { useEffect, useState } from "react";
import { z } from "zod";
import { useSession } from "../../services/session";

const draftSchema = z.object({
  id: z.string(),
  text: z.string().max(2000),
  topic: z.string(),
  mode: z.enum(["question", "topic"]),
  updatedAt: z.string(),
});
export type StudyDraft = z.infer<typeof draftSchema>;
const draftsSchema = z.array(draftSchema).max(20);

function readDrafts(key: string): StudyDraft[] {
  try {
    return draftsSchema.parse(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}

export function useStudyDrafts(courseId: string) {
  const { user } = useSession();
  const key = `gap:study-drafts:${user?.id}:${courseId}`;
  const [saved, setSaved] = useState(() => ({ key, drafts: readDrafts(key) }));
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    setSaved({ key, drafts: readDrafts(key) });
    setStorageError("");
  }, [key]);
  const drafts = saved.key === key ? saved.drafts : [];

  function saveDraft(input: Omit<StudyDraft, "id" | "updatedAt">, id?: string) {
    const draft: StudyDraft = {
      ...input,
      id: id || crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    const next = [
      draft,
      ...drafts.filter((item) => item.id !== draft.id),
    ].slice(0, 20);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSaved({ key, drafts: next });
      setStorageError("");
      return draft;
    } catch {
      setStorageError(
        "This browser could not save your draft. Your text is still here.",
      );
      return null;
    }
  }
  return { drafts, saveDraft, storageError };
}
