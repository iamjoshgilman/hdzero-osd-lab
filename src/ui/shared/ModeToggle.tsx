// Segmented HDZero / Analog mode switch. Sits above the base-font drop in
// the Layers panel since that's where mode decisions become concrete (what
// file types you're allowed to drop). Switching modes mutates
// project.meta.mode; AppShell's effect then re-themes the whole UI via the
// CSS custom-property swap on <html data-mode="...">.

import { useComputed } from "@preact/signals";
import { project, mutate } from "@/state/store";
import { switchMode, type OsdMode } from "@/state/project";

export function ModeToggle() {
  const mode = useComputed(() => project.value.meta.mode);
  const set = (m: OsdMode) => {
    if (mode.value === m) return;
    mutate((doc) => switchMode(doc, m));
  };

  const btn = (m: OsdMode, label: string, sub: string) => {
    const active = mode.value === m;
    return (
      <button
        onClick={() => set(m)}
        class={[
          "flex-1 flex flex-col items-start px-3 py-2 rounded transition-colors font-mono",
          active
            ? "bg-osd-mint text-slate-900"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800",
        ].join(" ")}
      >
        <span class="text-[11px] font-semibold">{label}</span>
        <span class={[
          "text-[9px]",
          active ? "text-slate-800" : "text-slate-500",
        ].join(" ")}>
          {sub}
        </span>
      </button>
    );
  };

  return (
    <div class="flex gap-1 rounded border border-slate-700 bg-slate-900 p-1">
      {btn("hd", "HDZero", "digital · 53×20 · .bmp")}
      {btn("analog", "Analog", "MAX7456 · 30×16 · .mcm")}
    </div>
  );
}
