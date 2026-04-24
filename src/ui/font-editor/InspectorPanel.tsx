// Right-side inspector panel for the Font editor. Shows everything we know
// about the currently-selected glyph:
//   - its code, matching ASCII char, best-fit category, containing subsets
//   - a close-up preview of the composed tile (4× zoom, nearest-neighbor)
//   - a safety note: whether firmware draws this slot or it's decorative
//
// All state comes from shared signals; no props needed.

import { useComputed } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  project,
  mutate,
  mutateLive,
  beginEditSession,
  commitEditSession,
} from "@/state/store";
import { putAsset } from "@/state/assets";
import { selectedGlyph } from "@/state/ui-state";
import { compose } from "@/compositor/compose";
import { extractTile, extractAnalogTile } from "@/compositor/atlas";
import { GLYPH_SIZE, ANALOG_GLYPH_SIZE } from "@/compositor/constants";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import { lookupSymbol } from "@/osd-schema";
import type { HexColor, OsdMode, ProjectDoc } from "@/state/project";
import { PixelEditor } from "@/ui/pixel-editor/PixelEditor";
import { rgbToPngBlob } from "@/ui/pixel-editor/pixel-ops";
import { Button } from "@/ui/shared/Button";
import {
  getGlyphMetadata,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type GlyphMetadata,
} from "./glyph-metadata";

/** Mode-aware tile-preview sizing + extraction helpers. */
function tileDimsForMode(mode: OsdMode): { size: { w: number; h: number }; extract: typeof extractTile } {
  return mode === "analog"
    ? { size: ANALOG_GLYPH_SIZE, extract: extractAnalogTile }
    : { size: GLYPH_SIZE, extract: extractTile };
}

const TILE_ZOOM_HD = 4; // 24×36 → 96×144 on screen
const TILE_ZOOM_ANALOG = 8; // 12×18 → 96×144 on screen (same physical size, double density)

export function InspectorPanel() {
  const { assets } = useResolvedAssets();
  const atlas = useComputed(() => compose(project.value, assets.value));
  const code = useComputed(() => selectedGlyph.value);
  const mode = useComputed(() => project.value.meta.mode);

  return (
    <aside class="w-[260px] shrink-0 border-l border-slate-800 bg-slate-900 p-4 flex flex-col gap-4 overflow-y-auto font-mono text-xs">
      <h2 class="text-xs uppercase tracking-wider text-slate-400">Glyph inspector</h2>
      {code.value === null ? (
        <EmptyState />
      ) : (
        <GlyphDetails code={code.value} atlas={atlas.value} mode={mode.value} />
      )}
    </aside>
  );
}

function EmptyState() {
  return (
    <div class="flex flex-col gap-2 text-slate-500">
      <p>Click a glyph in the preview to inspect.</p>
      <p class="text-slate-600">
        You'll see its code, ASCII character, category, containing subsets, and a warning about
        whether the slot is safe to override.
      </p>
    </div>
  );
}

function GlyphDetails({
  code,
  atlas,
  mode,
}: {
  code: number;
  atlas: Uint8ClampedArray;
  mode: OsdMode;
}) {
  const meta = getGlyphMetadata(code);
  const color = CATEGORY_COLORS[meta.category];
  const symbol = lookupSymbol(code);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Unmount flag — if the user closes the modal (or the glyph selection
  // changes) while the save's async chain is in flight, we bail on the
  // mutate. Previously the chain would finish and write an override for
  // a stale glyph code / stale mode.
  const savedRef = useRef<{ open: boolean; code: number; mode: OsdMode }>({
    open: editorOpen,
    code,
    mode,
  });
  savedRef.current = { open: editorOpen, code, mode };
  const dims = tileDimsForMode(mode);

  const handleSaveTile = async (newPixels: Uint8ClampedArray): Promise<void> => {
    // Snapshot the identity of this save at the moment it starts — code,
    // mode, and "modal is still open" — so the async chain can check at
    // the end that none of those changed. If they did, the user has
    // moved on and landing the override would be wrong.
    const startCode = code;
    const startMode = mode;
    setSaveError(null);
    try {
      const blob = await rgbToPngBlob(newPixels, dims.size.w, dims.size.h);
      const buf = await blob.arrayBuffer();
      const name = `pixel-edit-${startCode}-${Date.now()}.png`;
      const hash = await putAsset(buf, { name, mime: "image/png" });
      const current = savedRef.current;
      if (!current.open || current.code !== startCode || current.mode !== startMode) {
        // Modal closed or selection/mode changed since save started — abort.
        // Asset is already in IndexedDB cache; next time it's needed the
        // hash will resolve. Not worth deleting the orphan right now.
        return;
      }
      mutate((doc) => {
        doc.font.overrides[startCode] = {
          source: { kind: "user", hash, name, mime: "image/png" },
        };
      });
      setEditorOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <div>
        <div class="text-2xl font-bold" style={{ color }}>
          #{code}
        </div>
        <div class="text-slate-400">
          {symbol ? symbol.label : CATEGORY_LABELS[meta.category]}
        </div>
      </div>

      <div class="flex gap-3 items-start">
        <TilePreview atlas={atlas} code={code} mode={mode} />
        {meta.asciiChar !== null && <AsciiPreview char={meta.asciiChar} />}
      </div>

      <Button
        variant="secondary"
        onClick={() => {
          setSaveError(null);
          setEditorOpen(true);
        }}
        class="!text-[11px] !py-1.5"
        title="Open the pixel editor to draw this glyph from scratch or tweak the current tile"
      >
        ✎ Draw this glyph
      </Button>

      {saveError && (
        <p class="text-[11px] text-osd-alert leading-snug">⚠ {saveError}</p>
      )}

      {editorOpen && (
        <PixelEditor
          width={dims.size.w}
          height={dims.size.h}
          initialPixels={dims.extract(atlas, code)}
          mode={mode}
          title={`Glyph #${code}${symbol ? ` · ${symbol.label}` : ""}`}
          onSave={handleSaveTile}
          onCancel={() => setEditorOpen(false)}
        />
      )}

      {symbol && (
        <section>
          <h3 class="text-slate-500 uppercase tracking-wider text-[10px] mb-1">
            Betaflight role
          </h3>
          <p class="text-slate-300">
            <span class="text-osd-cyan">SYM_{symbol.name}</span>
          </p>
          <p class="text-[10px] text-slate-500 mt-0.5">
            Category: {symbol.category}
            {symbol.note ? ` · ${symbol.note}` : ""}
          </p>
        </section>
      )}

      <section>
        <h3 class="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Subsets</h3>
        {meta.subsets.length === 0 ? (
          <p class="text-slate-500">— none —</p>
        ) : (
          <ul class="flex flex-wrap gap-1">
            {meta.subsets.map((s) => (
              <li
                key={s}
                class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300"
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Scale knob is only meaningful when there's a user-uploaded override
          for this glyph — built-in tiles and layer-drawn glyphs don't go
          through imageRgbaToTile. */}
      <OverrideScaleEditor code={code} />

      {/* Color tint is HD-only — MAX7456 is 2-bit monochrome, so any tint
          would get flattened to black/white at export and mislead the pilot
          about what the goggle will actually show. */}
      {mode === "hd" && <TintEditor code={code} />}

      <SafetyNote meta={meta} />
    </div>
  );
}

function setTint(code: number, color: HexColor): void {
  mutate((doc) => {
    doc.font.tints = { ...(doc.font.tints ?? {}), [code]: color };
  });
}

function clearTint(code: number): void {
  mutate((doc) => {
    if (!doc.font.tints) return;
    const next = { ...doc.font.tints };
    delete next[code];
    doc.font.tints = next;
  });
}

/** Slider bounds. ≥ 0.5 (never invert) and ≤ 3.0 (diminishing returns past that). */
const SCALE_MIN = 0.5;
const SCALE_MAX = 3.0;
const SCALE_STEP = 0.05;

function OverrideScaleEditor({ code }: { code: number }) {
  // Only surfaces when the glyph actually has an override. Built-in /
  // layer-rendered tiles don't flow through imageRgbaToTile, so a scale
  // slider would silently no-op there.
  const override = useComputed(() => project.value.font.overrides[code] ?? null);
  // Drag-session anchoring for undo coalescing. The input fires onInput
  // continuously during drag — without coalescing each tick would become
  // its own undo entry. Snapshot on first tick; commit on blur / onChange
  // (pointer release). See store.ts commitEditSession for the contract.
  const sessionSnapshotRef = useRef<ProjectDoc | null>(null);

  if (!override.value) return null;
  const current = override.value.scale ?? 1.0;

  const writeScale = (v: number) => {
    // Clamp to the slider's advertised range so typing into the associated
    // number input (future) can't smuggle values past the bounds either.
    const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, v));
    if (!sessionSnapshotRef.current) {
      sessionSnapshotRef.current = beginEditSession();
    }
    mutateLive((doc) => {
      const ov = doc.font.overrides[code];
      if (!ov) return;
      if (clamped === 1) {
        // Round-trip cleanliness: keep the doc free of `scale: 1` noise so
        // exports / diffs don't show a redundant field on every override.
        delete ov.scale;
      } else {
        ov.scale = clamped;
      }
    });
  };

  const commitDrag = () => {
    if (sessionSnapshotRef.current) {
      commitEditSession(sessionSnapshotRef.current);
      sessionSnapshotRef.current = null;
    }
  };

  const reset = () => {
    if (!sessionSnapshotRef.current) {
      sessionSnapshotRef.current = beginEditSession();
    }
    mutateLive((doc) => {
      const ov = doc.font.overrides[code];
      if (ov) delete ov.scale;
    });
    commitDrag();
  };

  return (
    <section>
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-slate-500 uppercase tracking-wider text-[10px]">Scale</h3>
        {current !== 1 && (
          <button
            onClick={reset}
            class="text-slate-500 hover:text-osd-mint text-[10px] px-1"
            title="Reset to fit (1.0×)"
          >
            reset
          </button>
        )}
      </div>
      <div class="flex items-center gap-2">
        <input
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={SCALE_STEP}
          value={current}
          onInput={(e: Event) => writeScale(parseFloat((e.target as HTMLInputElement).value))}
          onChange={commitDrag}
          onPointerUp={commitDrag}
          onBlur={commitDrag}
          aria-label="Override image scale"
          class="flex-1 accent-osd-mint"
        />
        <span class="text-slate-300 w-10 text-right tabular-nums">
          {current.toFixed(2)}×
        </span>
      </div>
      <p class="text-[10px] text-slate-500 mt-1 leading-snug">
        <span class="text-osd-amber">1.0×</span> fits the tile with chroma-gray
        padding. Higher values make the icon fill more of the tile; content
        past the tile edge gets clipped.
      </p>
    </section>
  );
}

function TintEditor({ code }: { code: number }) {
  const tint = useComputed(() => project.value.font.tints?.[code] ?? null);
  const current = tint.value ?? "#ffffff";
  return (
    <section>
      <h3 class="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Color tint</h3>
      <div class="flex items-center gap-2">
        <input
          type="color"
          value={current}
          onInput={(e: Event) => {
            const v = (e.target as HTMLInputElement).value as HexColor;
            setTint(code, v);
          }}
          class="w-10 h-8 bg-slate-900 border border-slate-700 rounded cursor-pointer"
        />
        <input
          type="text"
          value={tint.value ?? ""}
          placeholder="#rrggbb"
          onInput={(e: Event) => {
            const raw = (e.target as HTMLInputElement).value.trim();
            if (raw === "") {
              clearTint(code);
              return;
            }
            if (/^#[0-9a-f]{6}$/i.test(raw)) setTint(code, raw as HexColor);
          }}
          class="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px] font-mono"
        />
        {tint.value && (
          <button
            onClick={() => clearTint(code)}
            class="text-slate-500 hover:text-osd-alert text-[10px] px-1"
            title="Clear tint"
          >
            ×
          </button>
        )}
      </div>
      <p class="text-[10px] text-slate-500 mt-1 leading-snug">
        Multiplies every non-transparent pixel of this glyph. Outlines stay dark; fills take the
        hue. Applied after every layer.
      </p>
    </section>
  );
}

function TilePreview({
  atlas,
  code,
  mode,
}: {
  atlas: Uint8ClampedArray;
  code: number;
  mode: OsdMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dims = tileDimsForMode(mode);
  const zoom = mode === "analog" ? TILE_ZOOM_ANALOG : TILE_ZOOM_HD;
  const viewW = dims.size.w * zoom;
  const viewH = dims.size.h * zoom;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Draw at native pixel size then CSS-scale via imageRendering: pixelated
    // for a crisp nearest-neighbor zoom. Keeps the canvas cheap.
    canvas.width = dims.size.w;
    canvas.height = dims.size.h;
    const tile = dims.extract(atlas, code);
    // Show tile pixels as-is — chroma-gray stays chroma-gray for visual
    // consistency with the main preview canvas default.
    const rgba = new Uint8ClampedArray(dims.size.w * dims.size.h * 4);
    for (let i = 0, j = 0; i < tile.length; i += 3, j += 4) {
      rgba[j] = tile[i]!;
      rgba[j + 1] = tile[i + 1]!;
      rgba[j + 2] = tile[i + 2]!;
      rgba[j + 3] = 255;
    }
    ctx.putImageData(new ImageData(rgba, dims.size.w, dims.size.h), 0, 0);
  }, [atlas, code, dims.size.w, dims.size.h, dims.extract]);

  return (
    <div
      class="border border-slate-700 bg-slate-800"
      style={{ width: `${viewW}px`, height: `${viewH}px` }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: `${viewW}px`,
          height: `${viewH}px`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function AsciiPreview({ char }: { char: string }) {
  return (
    <div class="flex flex-col items-center gap-1">
      <div
        class="flex items-center justify-center border border-slate-700 bg-slate-800 text-slate-100 font-bold"
        style={{ width: "48px", height: "64px", fontSize: "40px", lineHeight: 1 }}
      >
        {char === " " ? "␣" : char}
      </div>
      <span class="text-[10px] text-slate-500">ASCII</span>
    </div>
  );
}

function SafetyNote({ meta }: { meta: GlyphMetadata }) {
  if (meta.isUsable) {
    return (
      <p class="text-[11px] leading-relaxed text-osd-amber">
        ⚠ This slot is drawn by Betaflight — overriding it replaces the icon in-flight.
      </p>
    );
  }
  if (meta.category === "unused") {
    return (
      <p class="text-[11px] leading-relaxed text-osd-mint">
        ✓ Decorative slot — safe to override freely.
      </p>
    );
  }
  // Logo — in-between. Betaflight draws these as the banner/mini-logo, but
  // overriding them IS the intended workflow. Stay silent to avoid nagging.
  return (
    <p class="text-[11px] leading-relaxed text-slate-400">
      Logo slot — overriding this tile changes the banner art rendered on-screen.
    </p>
  );
}
