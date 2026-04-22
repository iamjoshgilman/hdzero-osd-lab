// Sidebar showing current layers + overrides with add/remove/toggle.
// v0.1.0 supports uploading a base BMP and per-glyph PNG overrides.

import { useComputed } from "@preact/signals";
import { useRef, useState } from "preact/hooks";
import { project, mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { selectedGlyph } from "@/state/ui-state";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import { TtfLayerForm } from "./TtfLayerForm";
import type { BitmapLayer } from "@/state/project";

export function LayersPanel() {
  const layers = useComputed(() => project.value.font.layers);
  const overrideEntries = useComputed(() => Object.entries(project.value.font.overrides));
  const [ttfFormOpen, setTtfFormOpen] = useState<boolean>(false);

  const addBaseBmp = async (file: File) => {
    const buf = await file.arrayBuffer();
    const hash = await putAsset(buf, { name: file.name, mime: file.type || "image/bmp" });
    mutate((doc) => {
      const layer: BitmapLayer = {
        id: `base-${Date.now()}`,
        kind: "bitmap",
        source: { kind: "user", hash, name: file.name, mime: file.type || "image/bmp" },
        subset: "ALL",
        enabled: true,
      };
      doc.font.layers.push(layer);
    });
  };

  const loadSample = async (filename: string, displayName: string) => {
    const res = await fetch(`${import.meta.env.BASE_URL}sample-fonts/${filename}`);
    if (!res.ok) {
      alert(`Could not load sample font ${filename} (HTTP ${res.status})`);
      return;
    }
    const buf = await res.arrayBuffer();
    const hash = await putAsset(buf, { name: displayName, mime: "image/bmp" });
    mutate((doc) => {
      doc.font.layers.push({
        id: `base-${Date.now()}`,
        kind: "bitmap",
        source: { kind: "user", hash, name: displayName, mime: "image/bmp" },
        subset: "ALL",
        enabled: true,
      });
    });
  };

  const toggleLayer = (id: string) => {
    mutate((doc) => {
      const l = doc.font.layers.find((x) => x.id === id);
      if (l) l.enabled = !l.enabled;
    });
  };

  const removeLayer = (id: string) => {
    mutate((doc) => {
      doc.font.layers = doc.font.layers.filter((x) => x.id !== id);
    });
  };

  const addOverride = async (code: number, file: File) => {
    const buf = await file.arrayBuffer();
    const hash = await putAsset(buf, { name: file.name, mime: file.type || "image/png" });
    mutate((doc) => {
      doc.font.overrides[code] = {
        source: { kind: "user", hash, name: file.name, mime: file.type || "image/png" },
      };
    });
  };

  const removeOverride = (code: number) => {
    mutate((doc) => {
      delete doc.font.overrides[code];
    });
  };

  return (
    <aside class="w-80 shrink-0 border-r border-slate-800 bg-slate-900 p-4 flex flex-col gap-5 overflow-y-auto">
      <section>
        <h2 class="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Base font</h2>
        <FileDrop
          accept=".bmp,image/bmp"
          label="Drop a 384×1152 BMP"
          onFile={addBaseBmp}
        />
        <SampleFontPicker onPick={loadSample} />
      </section>

      <section>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-xs font-mono uppercase tracking-wider text-slate-400">
            Layers ({layers.value.length})
          </h2>
          <Button
            variant="secondary"
            onClick={() => setTtfFormOpen((x) => !x)}
            class="!px-2 !py-1 !text-[10px]"
          >
            {ttfFormOpen ? "− TTF" : "+ TTF"}
          </Button>
        </div>
        {ttfFormOpen && (
          <div class="mb-3">
            <TtfLayerForm onClose={() => setTtfFormOpen(false)} />
          </div>
        )}
        {layers.value.length === 0 && (
          <p class="text-xs text-slate-500">Upload a base font above or add a TTF layer to get started.</p>
        )}
        <ul class="flex flex-col gap-2">
          {layers.value.map((layer) => (
            <li
              key={layer.id}
              class="flex items-center gap-2 bg-slate-800 rounded p-2 font-mono text-xs"
            >
              <input
                type="checkbox"
                checked={layer.enabled}
                onInput={() => toggleLayer(layer.id)}
              />
              <span class="flex-1 truncate">
                <span class="text-osd-amber">{layer.kind}</span>{" "}
                <span class="text-slate-400">
                  / {layer.kind === "logo" ? layer.slot : layer.subset}
                </span>
              </span>
              <Button variant="danger" onClick={() => removeLayer(layer.id)} class="!px-2 !py-1">
                ×
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 class="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
          Glyph overrides ({overrideEntries.value.length})
        </h2>
        <p class="text-xs text-slate-500 mb-2">
          Click a glyph in the preview to select it, then drop or upload an image.
          Overrides always win over layers.
        </p>
        <OverrideAdder onAdd={addOverride} />
        <ul class="flex flex-col gap-1 mt-3">
          {overrideEntries.value.map(([codeStr, ov]) => (
            <li
              key={codeStr}
              class="flex items-center gap-2 bg-slate-800 rounded p-2 font-mono text-xs"
            >
              <span class="text-osd-mint w-10">#{codeStr}</span>
              <span class="flex-1 truncate text-slate-400">
                {ov.source.kind === "user" ? ov.source.name : ov.source.id}
              </span>
              <Button
                variant="danger"
                onClick={() => removeOverride(Number(codeStr))}
                class="!px-2 !py-1"
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

interface SampleFontEntry {
  file: string;
  label: string;
  author: string;
  sourceUrl: string;
}

/**
 * Curated list of sample fonts shipped in public/sample-fonts/. The first
 * four are from the HDZero community font library (no explicit LICENSE
 * upstream — redistributed here with author credit, removable on request).
 * The last is the MIT-licensed ondrascz color font from the Python tool.
 */
const SAMPLE_FONTS: readonly SampleFontEntry[] = [
  {
    file: "BTFL_SNEAKY_FPV_Default_V1.0.0.bmp",
    label: "Sneaky FPV — Default",
    author: "Sneaky FPV",
    sourceUrl: "https://github.com/hd-zero/hdzero-osd-font-library",
  },
  {
    file: "BTFL_Ligen_Rainbow_V1.0.1.bmp",
    label: "Ligen — Rainbow",
    author: "Ligen",
    sourceUrl: "https://github.com/hd-zero/hdzero-osd-font-library",
  },
  {
    file: "BTFL_johhngoblin_teamBBL_v1.0.0.bmp",
    label: "johhngoblin — Team BBL",
    author: "johhngoblin",
    sourceUrl: "https://github.com/hd-zero/hdzero-osd-font-library",
  },
  {
    file: "BTFL_ondrascz_minimal_uppercase_color_bf-plain_V1.0.0.bmp",
    label: "ondrascz — Minimal Upper Color",
    author: "ondrascz",
    sourceUrl: "https://github.com/hd-zero/hdzero-osd-font-library",
  },
  {
    file: "ondrascz-color.bmp",
    label: "ondrascz — Color (MIT)",
    author: "ondrascz",
    sourceUrl: "https://github.com/ondrascz/HD-OSD-Font-Tools",
  },
];

function SampleFontPicker({ onPick }: { onPick: (filename: string, displayName: string) => void }) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const go = () => {
    const sel = selectRef.current;
    if (!sel || sel.value === "") return;
    const entry = SAMPLE_FONTS.find((e) => e.file === sel.value);
    if (entry) onPick(entry.file, entry.label);
    sel.value = "";
  };
  return (
    <div class="mt-2 flex flex-col gap-1">
      <p class="text-[10px] font-mono text-slate-500">or start with a community sample:</p>
      <div class="flex gap-2">
        <select
          ref={selectRef}
          defaultValue=""
          class="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-100 font-mono"
        >
          <option value="" disabled>
            Pick a font…
          </option>
          {SAMPLE_FONTS.map((s) => (
            <option key={s.file} value={s.file}>
              {s.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={go} class="!px-3 !py-1 !text-xs">
          Load
        </Button>
      </div>
      <p class="text-[9px] text-slate-600 leading-tight">
        from the{" "}
        <a
          href="https://github.com/hd-zero/hdzero-osd-font-library"
          target="_blank"
          rel="noreferrer"
          class="underline hover:text-slate-400"
        >
          HDZero community font library
        </a>
        . Authors credited in NOTICE. Submit an issue if you'd like a font removed.
      </p>
    </div>
  );
}

function OverrideAdder({ onAdd }: { onAdd: (code: number, file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = useComputed(() => selectedGlyph.value);

  // Two-way sync: when a glyph is clicked on the canvas, the input reflects it.
  // When the user types a number, the selection updates so the preview highlights.
  const inputValue = selected.value === null ? "" : String(selected.value);

  const triggerUpload = () => {
    const raw = inputRef.current?.value ?? "";
    const code = Number(raw);
    if (!raw || !Number.isFinite(code) || code < 0 || code > 511) {
      alert("Pick a code 0–511 (click a glyph or type a number)");
      return;
    }
    const fileEl = fileRef.current;
    if (!fileEl) return;
    fileEl.onchange = () => {
      const f = fileEl.files?.[0];
      if (f) {
        onAdd(code, f);
        fileEl.value = "";
        selectedGlyph.value = null;
      }
    };
    fileEl.click();
  };

  return (
    <label class="flex flex-col gap-1 text-xs font-mono text-slate-400">
      <span>Code (0–511):</span>
      <div class="flex gap-2">
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={511}
          placeholder="click a glyph"
          value={inputValue}
          onInput={(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            if (raw === "") {
              selectedGlyph.value = null;
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n) && n >= 0 && n <= 511) {
              selectedGlyph.value = n;
            }
          }}
          class="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
        <input ref={fileRef} type="file" accept="image/*" class="hidden" />
        <Button variant="secondary" onClick={triggerUpload}>
          Upload
        </Button>
      </div>
    </label>
  );
}
