// Right-side panel on the OSD Preview tab. Lists every OSD element grouped
// by category, with enable/disable toggles and click-to-select. Clicking an
// entry's name sets `selectedOsdElement`, which the canvas highlights.

import { useComputed } from "@preact/signals";
import { project, mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { selectedOsdElement } from "@/state/ui-state";
import {
  OSD_ELEMENTS,
  type OsdElement,
  type OsdElementCategory,
} from "@/osd-schema/elements";
import { Button } from "@/ui/shared/Button";
import { FileDrop } from "@/ui/shared/FileDrop";

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

function setElementText(element: OsdElement, text: string): void {
  mutate((doc) => {
    const existing = doc.osdLayout.elements[element.id];
    const base = existing ?? { ...element.defaultPos, enabled: element.defaultEnabled };
    if (text === "") {
      // Empty string → revert to the schema sample
      const { customText, ...rest } = { ...base, customText: "" };
      void customText;
      doc.osdLayout.elements[element.id] = rest;
    } else {
      doc.osdLayout.elements[element.id] = { ...base, customText: text };
    }
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

function BgPresetPicker() {
  return (
    <div class="mt-2 flex flex-col gap-1">
      <p class="text-[10px] text-slate-500">or pick a preset:</p>
      <div class="grid grid-cols-2 gap-1">
        {BG_PRESETS.map((p) => (
          <Button
            key={p.file}
            variant="secondary"
            onClick={() => loadBgPreset(p)}
            class="!px-2 !py-1 !text-[10px]"
          >
            {p.label}
          </Button>
        ))}
      </div>
      <p class="text-[9px] text-slate-600 leading-tight">
        Presets read files from <code>public/fpv-backgrounds/</code>. Generate your own AI
        stills using the prompts in the README there.
      </p>
    </div>
  );
}

function SelectedElementPanel() {
  const selected = useComputed(() => selectedOsdElement.value);
  const id = selected.value;
  if (!id) return null;
  const element = OSD_ELEMENTS.find((e) => e.id === id);
  if (!element) return null;
  const override = useComputed(() => project.value.osdLayout.elements[id]);
  const currentText = override.value?.customText ?? "";

  return (
    <section class="border border-osd-mint/40 bg-slate-800/60 rounded p-2 flex flex-col gap-2">
      <header class="flex items-center justify-between">
        <h3 class="text-[11px] text-osd-mint font-semibold">{element.label}</h3>
        <button
          class="text-slate-500 hover:text-slate-300 text-[10px]"
          onClick={() => (selectedOsdElement.value = null)}
        >
          clear
        </button>
      </header>

      {element.editableText ? (
        <label class="flex flex-col gap-1 text-[10px] text-slate-400">
          <span>
            Custom text{" "}
            {element.maxTextLen !== undefined && (
              <span class="text-slate-600">(max {element.maxTextLen})</span>
            )}
          </span>
          <input
            type="text"
            value={currentText}
            maxLength={element.maxTextLen}
            placeholder={element.sample
              .map((c) => (c >= 32 && c <= 126 ? String.fromCharCode(c) : "·"))
              .join("")}
            onInput={(e: Event) => setElementText(element, (e.target as HTMLInputElement).value)}
            class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px] font-mono"
          />
          <span class="text-slate-600 text-[9px]">
            Leave empty to show the sample value. Characters render as whatever glyph your
            font has at that ASCII code.
          </span>
        </label>
      ) : (
        <p class="text-[10px] text-slate-500 leading-snug">
          Position, visibility, and drag-to-reposition work below. This element's content is
          firmware-driven — the sample shown is a plausible flying value.
        </p>
      )}
      {element.note && <p class="text-[10px] text-slate-500 leading-snug">{element.note}</p>}
    </section>
  );
}

async function setBackgroundImage(file: File): Promise<void> {
  const buf = await file.arrayBuffer();
  const hash = await putAsset(buf, {
    name: file.name,
    mime: file.type || "image/png",
  });
  mutate((doc) => {
    doc.osdLayout.background = {
      kind: "user",
      hash,
      name: file.name,
      mime: file.type || "image/png",
    };
  });
}

/**
 * Presets look for files at public/fpv-backgrounds/<file>. If the file is
 * absent we point the user at the README explaining how to generate one.
 * Keeps the repo free of licensing concerns (no bundled imagery).
 */
interface BgPreset {
  file: string;
  label: string;
  prompt: string;
}

const BG_PRESETS: readonly BgPreset[] = [
  {
    file: "skyscraper-dive.jpg",
    label: "Skyscraper dive",
    prompt:
      "FPV racing drone diving between tall glass-and-steel skyscrapers, downtown city, late afternoon golden hour, motion blur, wide-angle GoPro lens, photorealistic, 16:9.",
  },
  {
    file: "mountain-surfing.jpg",
    label: "Mountain surfing",
    prompt:
      "FPV drone proximity flight following the contour of a rugged mountain slope, close to pine trees and exposed rock, afternoon light, dramatic depth, fast motion, cinematic GoPro-style wide angle, photorealistic, 16:9.",
  },
  {
    file: "bando.jpg",
    label: "Bando",
    prompt:
      "FPV drone interior of an abandoned industrial warehouse, concrete walls with graffiti, rusted steel beams, dusty shafts of sunlight through broken roof, GoPro ultra-wide, photorealistic, 16:9.",
  },
  {
    file: "dusk-lowlight.jpg",
    label: "Dusk low-light",
    prompt:
      "FPV drone dusk flight over a quiet suburban neighborhood, deep golden-blue sky, first stars appearing, dim street lights, long shadows, tricky low-contrast lighting, photorealistic, 16:9.",
  },
];

async function loadBgPreset(preset: BgPreset): Promise<void> {
  const url = `${import.meta.env.BASE_URL}fpv-backgrounds/${preset.file}`;
  const res = await fetch(url);
  if (!res.ok) {
    alert(
      `Preset "${preset.label}" not found at ${url}.\n\n` +
        `Generate an image with a prompt like:\n\n${preset.prompt}\n\n` +
        `Save it as "${preset.file}" inside public/fpv-backgrounds/ and refresh.`,
    );
    return;
  }
  const blob = await res.blob();
  const file = new File([blob], preset.file, { type: blob.type });
  await setBackgroundImage(file);
}

function clearBackgroundImage(): void {
  mutate((doc) => {
    delete doc.osdLayout.background;
  });
}

export function ElementLibrary() {
  // Re-render any time project or selection changes.
  const selected = useComputed(() => selectedOsdElement.value);
  const enabledCount = useComputed(() => OSD_ELEMENTS.filter(effectiveEnabled).length);
  const bg = useComputed(() => project.value.osdLayout.background);

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

      <SelectedElementPanel />


      <section>
        <h3 class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          FPV background
        </h3>
        {bg.value && bg.value.kind === "user" ? (
          <div class="flex flex-col gap-1 bg-slate-800 rounded p-2">
            <span class="text-[11px] truncate text-slate-200">{bg.value.name}</span>
            <div class="flex gap-2">
              <FileDrop
                accept="image/*"
                label="Replace"
                onFile={setBackgroundImage}
                class="!p-2 !text-[10px] flex-1"
              />
              <Button
                variant="danger"
                onClick={clearBackgroundImage}
                class="!px-2 !py-1 !text-[10px]"
              >
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <FileDrop
            accept="image/*"
            label="Drop an FPV still frame"
            onFile={setBackgroundImage}
            class="!p-3 !text-[11px]"
          />
        )}
        <BgPresetPicker />
      </section>

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
