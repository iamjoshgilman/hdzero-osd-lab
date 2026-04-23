// Sidebar showing current layers + overrides with add/remove/toggle.
// Mode-aware: base-drop accepts BMP+MCM in HD, MCM-only in analog; TTF
// layers render at native tile size per mode; glyph overrides go through
// a mode-appropriate downscale path at resolve time.

import { useComputed } from "@preact/signals";
import { useRef, useState } from "preact/hooks";
import { project, mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { addSampleFontAsBaseLayer } from "@/state/bootstrap";
import { selectedGlyph } from "@/state/ui-state";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import { TtfLayerForm } from "./TtfLayerForm";
import { BitmapLayerForm } from "./BitmapLayerForm";
import { McmLayerForm } from "./McmLayerForm";
import { ModeToggle } from "@/ui/shared/ModeToggle";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import type { BitmapLayer, McmLayer } from "@/state/project";

export function LayersPanel() {
  const layers = useComputed(() => project.value.font.layers);
  const overrideEntries = useComputed(() => Object.entries(project.value.font.overrides));
  const mode = useComputed(() => project.value.meta.mode);
  const { layerErrors, loading } = useResolvedAssets();
  const [ttfFormOpen, setTtfFormOpen] = useState<boolean>(false);
  const [mcmFormOpen, setMcmFormOpen] = useState<boolean>(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  // Inline error surface — replaces alert() dialogs that blocked the user's
  // flow. Cleared on the next attempted action.
  const [panelError, setPanelError] = useState<string | null>(null);

  /**
   * Base-font drop. Branches on file extension + current mode:
   *   - HD mode: .bmp → bitmap layer, .mcm → MCM layer (auto-upscaled to HD)
   *   - Analog mode: .mcm → native MCM layer, .bmp → rejected (no analog BMP format)
   */
  const addBaseFont = async (file: File) => {
    setPanelError(null);
    const isMcm = /\.mcm$/i.test(file.name);
    const isBmp = /\.bmp$/i.test(file.name);
    if (mode.value === "analog" && isBmp) {
      setPanelError(
        "Analog mode accepts .mcm files only. Switch to HDZero mode above if this is an HD font.",
      );
      return;
    }
    const buf = await file.arrayBuffer();
    if (isMcm) {
      const hash = await putAsset(buf, {
        name: file.name,
        mime: file.type || "text/plain",
      });
      mutate((doc) => {
        const layer: McmLayer = {
          id: `mcm-${Date.now()}`,
          kind: "mcm",
          source: { kind: "user", hash, name: file.name, mime: file.type || "text/plain" },
          subset: "ALL",
          // Analog locks to pure white/black (2-bit chip can't render
          // anything else — the render path forces it anyway, but we set
          // the stored value to match so it doesn't look "off" if the
          // user later edits the layer).
          glyphColor: mode.value === "analog" ? "#ffffff" : "#E0E0E0",
          outlineColor: "#000000",
          enabled: true,
        };
        doc.font.layers.push(layer);
      });
      return;
    }
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
    setPanelError(null);
    try {
      await addSampleFontAsBaseLayer(filename, displayName);
    } catch (err) {
      setPanelError(
        `Sample load failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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

  /** Move a layer one slot toward the TOP of the stack (later in the array = wins more). */
  const moveLayerUp = (id: string) => {
    mutate((doc) => {
      const idx = doc.font.layers.findIndex((l) => l.id === id);
      if (idx < 0 || idx >= doc.font.layers.length - 1) return;
      const next = doc.font.layers[idx + 1]!;
      doc.font.layers[idx + 1] = doc.font.layers[idx]!;
      doc.font.layers[idx] = next;
    });
  };

  /** Move a layer one slot toward the BOTTOM (earlier in the array = base). */
  const moveLayerDown = (id: string) => {
    mutate((doc) => {
      const idx = doc.font.layers.findIndex((l) => l.id === id);
      if (idx <= 0) return;
      const prev = doc.font.layers[idx - 1]!;
      doc.font.layers[idx - 1] = doc.font.layers[idx]!;
      doc.font.layers[idx] = prev;
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
      {panelError && (
        <div
          role="alert"
          class="border border-osd-alert/50 bg-osd-alert/10 rounded px-2 py-1.5 flex items-start gap-2"
        >
          <span class="flex-1 text-[11px] text-osd-alert font-mono leading-snug">
            ⚠ {panelError}
          </span>
          <button
            onClick={() => setPanelError(null)}
            aria-label="Dismiss error"
            class="text-osd-alert/70 hover:text-osd-alert text-[10px] rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-osd-alert"
          >
            ×
          </button>
        </div>
      )}
      <section>
        <h2 class="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
          Target
        </h2>
        <ModeToggle />
      </section>

      <section>
        <h2 class="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Base font</h2>
        <FileDrop
          accept={
            mode.value === "analog"
              ? ".mcm,text/plain"
              : ".bmp,image/bmp,.mcm,text/plain"
          }
          label={
            mode.value === "analog"
              ? "Drop a .mcm analog font"
              : "Drop a 384×1152 BMP or analog .mcm"
          }
          onFile={addBaseFont}
        />
        {mode.value === "hd" && <SampleFontPicker onPick={loadSample} />}
        {mode.value === "analog" && (
          <p class="text-[10px] text-slate-500 mt-2 leading-snug">
            No analog samples shipped (licensing). Drop your own .mcm — export
            from Betaflight Configurator's Font Manager, or find community
            builds on sites like oscarliang.com.
          </p>
        )}
      </section>

      <section>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-xs font-mono uppercase tracking-wider text-slate-400">
            Layers ({layers.value.length})
          </h2>
          <div class="flex gap-1">
            <Button
              variant="secondary"
              onClick={() => {
                setEditingLayerId(null);
                setMcmFormOpen(false);
                setTtfFormOpen((x) => !x);
              }}
              class="!px-2 !py-1 !text-[10px]"
              title={
                mode.value === "analog"
                  ? "Add a TTF / OTF font as a layer. Renders at native 12×18 in analog mode — pixel-designed fonts (PixelOperator, Press Start 2P, Minogram) read best."
                  : "Add a TTF / OTF font as a layer"
              }
            >
              {ttfFormOpen && !editingLayerId ? "− TTF" : "+ TTF"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditingLayerId(null);
                setTtfFormOpen(false);
                setMcmFormOpen((x) => !x);
              }}
              class="!px-2 !py-1 !text-[10px]"
              title="Add an analog MAX7456 font (.mcm) as a layer"
            >
              {mcmFormOpen && !editingLayerId ? "− MCM" : "+ MCM"}
            </Button>
          </div>
        </div>
        {ttfFormOpen && !editingLayerId && (
          <div class="mb-3">
            <TtfLayerForm onClose={() => setTtfFormOpen(false)} />
          </div>
        )}
        {mcmFormOpen && !editingLayerId && (
          <div class="mb-3">
            <McmLayerForm onClose={() => setMcmFormOpen(false)} />
          </div>
        )}
        {editingLayerId &&
          (() => {
            const editing = layers.value.find((l) => l.id === editingLayerId);
            if (!editing) return null;
            const close = () => {
              setEditingLayerId(null);
              setTtfFormOpen(false);
              setMcmFormOpen(false);
            };
            if (editing.kind === "ttf") {
              return (
                <div class="mb-3">
                  <TtfLayerForm editing={editing} onClose={close} />
                </div>
              );
            }
            if (editing.kind === "bitmap") {
              return (
                <div class="mb-3">
                  <BitmapLayerForm editing={editing} onClose={close} />
                </div>
              );
            }
            if (editing.kind === "mcm") {
              return (
                <div class="mb-3">
                  <McmLayerForm editing={editing} onClose={close} />
                </div>
              );
            }
            return null;
          })()}
        {layers.value.length === 0 && (
          <p class="text-xs text-slate-500">Upload a base font above or add a TTF layer to get started.</p>
        )}
        {layers.value.length > 1 && (
          <p class="text-[10px] text-slate-500 mb-1 leading-snug">
            Top of list = top of the stack (wins over lower layers at shared glyph codes).
          </p>
        )}
        <ul class="flex flex-col gap-2">
          {[...layers.value]
            .map((layer, arrayIdx) => ({ layer, arrayIdx }))
            .reverse()
            .map(({ layer, arrayIdx }) => {
            const err = layerErrors.value[layer.id];
            const isTop = arrayIdx === layers.value.length - 1;
            const isBottom = arrayIdx === 0;
            return (
              <li
                key={layer.id}
                class={[
                  "flex flex-col gap-1 rounded p-2 font-mono text-xs",
                  err ? "bg-red-950/60 border border-osd-alert/60" : "bg-slate-800",
                ].join(" ")}
              >
                <div class="flex items-center gap-2">
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
                  <div class="flex items-center">
                    <Button
                      variant="secondary"
                      onClick={() => moveLayerUp(layer.id)}
                      disabled={isTop}
                      aria-label="Move layer up (toward top of stack)"
                      class="!px-1.5 !py-1 !text-[10px]"
                      title="Move up (toward top of stack)"
                    >
                      ▲
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => moveLayerDown(layer.id)}
                      disabled={isBottom}
                      aria-label="Move layer down (toward base)"
                      class="!px-1.5 !py-1 !text-[10px]"
                      title="Move down (toward base)"
                    >
                      ▼
                    </Button>
                  </div>
                  {(layer.kind === "ttf" ||
                    layer.kind === "bitmap" ||
                    layer.kind === "mcm") && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setTtfFormOpen(false);
                        setMcmFormOpen(false);
                        setEditingLayerId(
                          editingLayerId === layer.id ? null : layer.id,
                        );
                      }}
                      aria-label="Edit layer settings"
                      class="!px-2 !py-1"
                      title="Edit layer settings"
                    >
                      ✎
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={() => removeLayer(layer.id)}
                    aria-label="Delete layer"
                    class="!px-2 !py-1"
                    title="Delete layer"
                  >
                    ×
                  </Button>
                </div>
                {err && (
                  <p class="text-[10px] text-osd-alert leading-snug pl-6">⚠ {err}</p>
                )}
                {!err && layer.kind === "ttf" && loading.value && (
                  <p class="text-[10px] text-osd-amber leading-snug pl-6">Rendering…</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 class="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
          Glyph overrides ({overrideEntries.value.length})
        </h2>
        <p class="text-xs text-slate-500 mb-2">
          Click a glyph in the preview to select it, then drop or upload an image.
          Overrides always win over layers.
          {mode.value === "analog" && (
            <>
              {" "}
              <span class="text-osd-amber">
                Analog mode scales to 12×18 — source images designed at or near
                that size read crispest.
              </span>
            </>
          )}
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
                aria-label={`Remove override for glyph ${codeStr}`}
                class="!px-2 !py-1"
                title="Remove this override"
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
          <option value="">Pick a font…</option>
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
  const [error, setError] = useState<string | null>(null);

  // Two-way sync: when a glyph is clicked on the canvas, the input reflects it.
  // When the user types a number, the selection updates so the preview highlights.
  const inputValue = selected.value === null ? "" : String(selected.value);

  const triggerUpload = () => {
    setError(null);
    const raw = inputRef.current?.value ?? "";
    const code = Number(raw);
    if (!raw || !Number.isFinite(code) || code < 0 || code > 511) {
      setError("Pick a code 0–511 (click a glyph or type a number)");
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
      {error && <span class="text-osd-alert text-[10px]">⚠ {error}</span>}
    </label>
  );
}
