// Right-side panel on the OSD Preview tab. Lists every OSD element grouped
// by category, with enable/disable toggles and click-to-select. Clicking an
// entry's name sets `selectedOsdElement`, which the canvas highlights.

import { useComputed } from "@preact/signals";
import { project, mutate } from "@/state/store";
import { selectedOsdElement } from "@/state/ui-state";
import {
  OSD_ELEMENTS,
  type OsdElement,
  type OsdElementCategory,
} from "@/osd-schema/elements";
import { Button } from "@/ui/shared/Button";

const CATEGORY_ORDER: readonly OsdElementCategory[] = [
  "rc",
  "power",
  "nav",
  "flight",
  "timer",
  "status",
  "decorative",
];

const CATEGORY_LABEL: Record<OsdElementCategory, string> = {
  rc: "RC link",
  power: "Power",
  nav: "Navigation",
  flight: "Flight",
  timer: "Timers",
  status: "Status",
  decorative: "Decorative",
};

function effectiveEnabled(element: OsdElement): boolean {
  const override = project.value.osdLayout.elements[element.id];
  return override ? override.enabled : element.defaultEnabled;
}

function effectivePos(element: OsdElement): { x: number; y: number } {
  const override = project.value.osdLayout.elements[element.id];
  return override ? { x: override.x, y: override.y } : element.defaultPos;
}

function setElementEnabled(element: OsdElement, enabled: boolean): void {
  mutate((doc) => {
    const existing = doc.osdLayout.elements[element.id];
    const pos = existing ?? { ...element.defaultPos, enabled: element.defaultEnabled };
    doc.osdLayout.elements[element.id] = { ...pos, enabled };
  });
}

function resetLayoutToDefaults(): void {
  mutate((doc) => {
    doc.osdLayout.elements = {};
  });
  selectedOsdElement.value = null;
}

function enableAll(enabled: boolean): void {
  mutate((doc) => {
    for (const el of OSD_ELEMENTS) {
      const existing = doc.osdLayout.elements[el.id];
      const pos = existing ?? { ...el.defaultPos, enabled };
      doc.osdLayout.elements[el.id] = { ...pos, enabled };
    }
  });
}

export function ElementLibrary() {
  // Re-render any time project or selection changes.
  const selected = useComputed(() => selectedOsdElement.value);
  const enabledCount = useComputed(() => OSD_ELEMENTS.filter(effectiveEnabled).length);

  const grouped: Record<OsdElementCategory, OsdElement[]> = {
    rc: [],
    power: [],
    nav: [],
    flight: [],
    timer: [],
    status: [],
    decorative: [],
  };
  for (const el of OSD_ELEMENTS) grouped[el.category].push(el);

  return (
    <aside class="w-[300px] shrink-0 border-l border-slate-800 bg-slate-900 p-3 flex flex-col gap-3 overflow-y-auto font-mono text-xs">
      <header class="flex items-center justify-between">
        <h2 class="text-xs uppercase tracking-wider text-slate-400">
          Elements ({enabledCount.value}/{OSD_ELEMENTS.length})
        </h2>
      </header>

      <div class="flex gap-2">
        <Button variant="secondary" onClick={() => enableAll(true)} class="!px-2 !py-1 !text-[10px]">
          All on
        </Button>
        <Button
          variant="secondary"
          onClick={() => enableAll(false)}
          class="!px-2 !py-1 !text-[10px]"
        >
          All off
        </Button>
        <Button
          variant="secondary"
          onClick={resetLayoutToDefaults}
          class="!px-2 !py-1 !text-[10px] flex-1"
        >
          Reset to defaults
        </Button>
      </div>

      <p class="text-[10px] text-slate-500 leading-snug">
        Drag any element on the canvas to reposition. Click an element here or on the canvas
        to highlight it. Toggle the checkbox to show/hide in the simulated OSD.
      </p>

      {CATEGORY_ORDER.map((cat) => {
        const items = grouped[cat];
        if (items.length === 0) return null;
        return (
          <section key={cat}>
            <h3 class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              {CATEGORY_LABEL[cat]}
            </h3>
            <ul class="flex flex-col">
              {items.map((el) => {
                const isSelected = selected.value === el.id;
                const enabled = effectiveEnabled(el);
                const pos = effectivePos(el);
                return (
                  <li key={el.id}>
                    <button
                      onClick={() => (selectedOsdElement.value = el.id)}
                      class={[
                        "w-full flex items-center gap-2 px-2 py-1 rounded text-left",
                        "hover:bg-slate-800",
                        isSelected ? "bg-slate-800 ring-1 ring-osd-mint" : "",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onClick={(e: Event) => e.stopPropagation()}
                        onInput={(e: Event) =>
                          setElementEnabled(el, (e.target as HTMLInputElement).checked)
                        }
                      />
                      <span
                        class={[
                          "flex-1 truncate text-[11px]",
                          enabled ? "text-slate-200" : "text-slate-500",
                        ].join(" ")}
                      >
                        {el.label}
                      </span>
                      <span class="text-[9px] text-slate-500">
                        {pos.x},{pos.y}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}
