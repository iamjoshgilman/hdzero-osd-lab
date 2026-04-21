// Sidebar showing current layers + overrides with add/remove/toggle.
// v0.1.0 supports uploading a base BMP and per-glyph PNG overrides.

import { useComputed } from "@preact/signals";
import { project, mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
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
          Drop a PNG/BMP for a specific glyph code. Overrides always win over layers.
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
  return (
    <label class="flex flex-col gap-1 text-xs font-mono text-slate-400">
      <span>Code (0–511):</span>
      <div class="flex gap-2">
        <input
          id="override-code-input"
          type="number"
          min={0}
          max={511}
          placeholder="e.g. 123"
          class="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
        <input
          id="override-file-input"
          type="file"
          accept="image/*"
          class="hidden"
        />
        <Button
          variant="secondary"
          onClick={() => {
            const codeEl = document.getElementById("override-code-input") as HTMLInputElement | null;
            const fileEl = document.getElementById("override-file-input") as HTMLInputElement | null;
            if (!codeEl || !fileEl) return;
            const code = Number(codeEl.value);
            if (!Number.isFinite(code) || code < 0 || code > 511) {
              alert("Code must be 0–511");
              return;
            }
            fileEl.onchange = () => {
              const f = fileEl.files?.[0];
              if (f) {
                onAdd(code, f);
                codeEl.value = "";
                fileEl.value = "";
              }
            };
            fileEl.click();
          }}
        >
          Upload
        </Button>
      </div>
    </label>
  );
}
