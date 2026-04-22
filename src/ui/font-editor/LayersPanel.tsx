// Sidebar showing current layers + overrides with add/remove/toggle.
// v0.1.0 supports uploading a base BMP and per-glyph PNG overrides.

import { useComputed } from "@preact/signals";
import { useRef } from "preact/hooks";
import { project, mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { selectedGlyph } from "@/state/ui-state";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import type { BitmapLayer } from "@/state/project";

export function LayersPanel() {
  const layers = useComputed(() => project.value.font.layers);
  const overrideEntries = useComputed(() => Object.entries(project.value.font.overrides));

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
        <div class="mt-2 flex flex-col gap-1">
          <p class="text-[10px] font-mono text-slate-500">or start with a sample:</p>
          <div class="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => loadSample("ondrascz-grey.bmp", "ondrascz grey (sample)")}
              class="flex-1 !px-2 !py-1 !text-[10px]"
            >
              Grey starter
            </Button>
            <Button
              variant="secondary"
              onClick={() => loadSample("ondrascz-color.bmp", "ondrascz color (sample)")}
              class="flex-1 !px-2 !py-1 !text-[10px]"
            >
              Color starter
            </Button>
          </div>
          <p class="text-[9px] text-slate-600 leading-tight">
            by <a
              href="https://github.com/ondrascz/HD-OSD-Font-Tools"
              target="_blank"
              rel="noreferrer"
              class="underline hover:text-slate-400"
            >ondrascz</a>, MIT licensed.
          </p>
        </div>
      </section>

      <section>
        <h2 class="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
          Layers ({layers.value.length})
        </h2>
        {layers.value.length === 0 && (
          <p class="text-xs text-slate-500">Upload a base font above to get started.</p>
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
