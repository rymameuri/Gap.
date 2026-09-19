import { useSearchParams } from "react-router-dom";

export type TabDef = { id: string; label: string; count?: number };

/** Active tab from `?tab=`; unknown values fall back to the first tab. */
export function useTab(tabs: TabDef[]) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? "";
  function select(id: string) {
    // Filters belong to a tab, so only the class survives a tab change.
    const next = new URLSearchParams();
    const classId = params.get("classId");
    if (classId) next.set("classId", classId);
    next.set("tab", id);
    setParams(next);
  }
  return { active, select };
}

export function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="tabbar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={t.id === active ? "active" : ""}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {!!t.count && <span className="badge">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
