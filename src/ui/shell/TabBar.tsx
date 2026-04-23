import { useComputed } from "@preact/signals";
import { currentView, type ViewMode } from "@/state/ui-state";

interface Tab {
  id: ViewMode;
  label: string;
  phaseTag?: string;
}

const TABS: Tab[] = [
  { id: "font", label: "Font" },
  { id: "osd", label: "OSD Preview" },
  { id: "decoration", label: "Decoration" },
  { id: "howto", label: "How-To" },
  { id: "resources", label: "Resources" },
];

export function TabBar() {
  const active = useComputed(() => currentView.value);
  return (
    <nav class="flex items-end gap-1 border-b border-slate-800 bg-slate-900 px-4">
      {TABS.map((tab) => {
        const isActive = active.value === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => (currentView.value = tab.id)}
            aria-current={isActive ? "page" : undefined}
            class={[
              "px-4 py-2 font-mono text-sm rounded-t transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-osd-mint",
              isActive
                ? "bg-slate-950 text-osd-mint border-t border-x border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800",
            ].join(" ")}
          >
            {tab.label}
            {tab.phaseTag && (
              <span class="ml-2 text-xs text-osd-amber font-normal">{tab.phaseTag}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
