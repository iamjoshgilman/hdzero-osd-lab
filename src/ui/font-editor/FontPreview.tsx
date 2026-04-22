// Renders a composed 384×1152 RGB atlas to a canvas with zoom, optional grid
// overlay, and click-to-select. Clicking a tile sets the shared
// `selectedGlyph` signal; the selected tile is highlighted with a green
// outline. LayersPanel reads the same signal to pre-fill its override-code
// input.
//
// v0.1.3 adds a toggle-able category overlay: each tile is tinted with the
// color of its best-fit subset (letter/number/special/icon/logo/unused) so
// the pilot can see at a glance which slots the firmware actually uses.

import { useEffect, useRef, useState } from "preact/hooks";
import { useComputed } from "@preact/signals";
import { project } from "@/state/store";
import { selectedGlyph, fontPreviewZoom } from "@/state/ui-state";
import { compose } from "@/compositor/compose";
import {
  FONT_SIZE,
  GLYPH_SIZE,
  FONT_GRID,
  GLYPH_COUNT,
  codeToOrigin,
  ANALOG_FONT_SIZE,
  ANALOG_GLYPH_SIZE,
  ANALOG_FONT_GRID,
  ANALOG_GLYPH_COUNT,
  analogCodeToOrigin,
} from "@/compositor/constants";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import { getGlyphMetadata, CATEGORY_COLORS } from "./glyph-metadata";

/**
 * Return the atlas dimensions + coordinate helpers matching the project's
 * current mode. Keeps FontPreview's useEffect body mode-agnostic — it just
 * reads these and draws, without branching everywhere.
 */
function dimsForMode(mode: "hd" | "analog") {
  return mode === "analog"
    ? {
        fontSize: ANALOG_FONT_SIZE,
        glyphSize: ANALOG_GLYPH_SIZE,
        fontGrid: ANALOG_FONT_GRID,
        glyphCount: ANALOG_GLYPH_COUNT,
        codeToOrigin: analogCodeToOrigin,
      }
    : {
        fontSize: FONT_SIZE,
        glyphSize: GLYPH_SIZE,
        fontGrid: FONT_GRID,
        glyphCount: GLYPH_COUNT,
        codeToOrigin,
      };
}

/**
 * Preview background options. Goggles composite the font over live FPV video
 * by treating chroma-gray (127,127,127) as transparent. Our canvas draws the
 * raw atlas bytes by default — which means light glyphs on a chroma-gray
 * background wash out and don't match what the pilot sees in-flight. The
 * toggle here lets the preview simulate different show-through backgrounds.
 */
const PREVIEW_BACKGROUNDS = {
  dark: { label: "Dark (goggle-like)", rgb: [15, 23, 42] as const }, // slate-950
  navy: { label: "Navy sky", rgb: [30, 58, 95] as const },
  black: { label: "Black", rgb: [0, 0, 0] as const },
  chroma: { label: "Chroma-gray (raw)", rgb: [127, 127, 127] as const },
} as const;
type PreviewBg = keyof typeof PREVIEW_BACKGROUNDS;

export function FontPreview() {
  const { assets, loading, error } = useResolvedAssets();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showOverlay, setShowOverlay] = useState<boolean>(false);
  const [bgMode, setBgMode] = useState<PreviewBg>("chroma");

  const hasLayers = useComputed(() => project.value.font.layers.length > 0);
  const mode = useComputed(() => project.value.meta.mode);
  const atlas = useComputed(() => compose(project.value, assets.value));
  const dims = dimsForMode(mode.value);

  // Zoom stored per-mode so switching to analog doesn't drag HD along
  // (or vice versa). Null = auto-pick: HD at 1× reads fine; analog's native
  // 192×288 is tiny on a big monitor, so default to 2× there.
  const zoom = fontPreviewZoom.value[mode.value] ?? (mode.value === "analog" ? 2 : 1);
  const setZoom = (v: number) => {
    fontPreviewZoom.value = { ...fontPreviewZoom.value, [mode.value]: v };
  };

  if (!hasLayers.value) {
    return <EmptyFontState mode={mode.value} />;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bg = PREVIEW_BACKGROUNDS[bgMode].rgb;
    const rgba = rgbToRgbaWithBg(atlas.value, bg);
    const copy = new Uint8ClampedArray(new ArrayBuffer(rgba.byteLength));
    copy.set(rgba);
    const img = new ImageData(copy, dims.fontSize.w, dims.fontSize.h);
    canvas.width = dims.fontSize.w;
    canvas.height = dims.fontSize.h;
    ctx.putImageData(img, 0, 0);
    // Order matters: the category tint goes UNDER the grid + selection so the
    // selected tile's outline reads crisply on top of the color wash. Category
    // overlay only applies in HD mode (analog's glyph metadata map is HD-shaped).
    if (showOverlay && mode.value === "hd") drawCategoryOverlay(ctx);
    if (showGrid) drawGrid(ctx, dims);
    if (selectedGlyph.value !== null) drawSelection(ctx, selectedGlyph.value, dims);
  }, [atlas.value, showGrid, showOverlay, selectedGlyph.value, bgMode, mode.value]);

  const handleClick = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Mouse → canvas-pixel coords (accounts for zoom via displayed vs native size).
    const px = ((e.clientX - rect.left) / rect.width) * dims.fontSize.w;
    const py = ((e.clientY - rect.top) / rect.height) * dims.fontSize.h;
    const col = Math.floor(px / dims.glyphSize.w);
    const row = Math.floor(py / dims.glyphSize.h);
    if (col < 0 || col >= dims.fontGrid.cols || row < 0 || row >= dims.fontGrid.rows) return;
    const code = row * dims.fontGrid.cols + col;
    selectedGlyph.value = selectedGlyph.value === code ? null : code;
  };

  return (
    <div class="flex flex-col items-center gap-3">
      <div class="flex gap-4 items-center text-xs font-mono text-slate-400 flex-wrap justify-center">
        <label class="flex items-center gap-2">
          <span>Zoom</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.25"
            value={zoom}
            onInput={(e: Event) => setZoom(parseFloat((e.target as HTMLInputElement).value))}
          />
          <span>{zoom.toFixed(2)}×</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showGrid}
            onInput={(e: Event) => setShowGrid((e.target as HTMLInputElement).checked)}
          />
          <span>Show grid</span>
        </label>
        {mode.value === "hd" && (
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOverlay}
              onInput={(e: Event) => setShowOverlay((e.target as HTMLInputElement).checked)}
            />
            <span>Category overlay</span>
          </label>
        )}
        <label class="flex items-center gap-2">
          <span>BG</span>
          <select
            value={bgMode}
            onChange={(e: Event) => setBgMode((e.target as HTMLSelectElement).value as PreviewBg)}
            class="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-slate-100 text-xs"
          >
            {Object.entries(PREVIEW_BACKGROUNDS).map(([key, def]) => (
              <option key={key} value={key}>
                {def.label}
              </option>
            ))}
          </select>
        </label>
        {selectedGlyph.value !== null && (
          <span class="text-osd-mint">
            ▸ Selected glyph <span class="font-bold">#{selectedGlyph.value}</span>
            <button
              class="ml-2 text-slate-500 hover:text-slate-300"
              onClick={() => (selectedGlyph.value = null)}
              title="Clear selection"
            >
              clear
            </button>
          </span>
        )}
        {loading.value && <span class="text-osd-amber">Loading assets…</span>}
        {error.value && <span class="text-osd-alert">{error.value}</span>}
      </div>
      <div
        class="border border-slate-700 bg-slate-800"
        style={{
          width: `${dims.fontSize.w * zoom}px`,
          height: `${dims.fontSize.h * zoom}px`,
          imageRendering: "pixelated",
        }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          class="cursor-crosshair"
          style={{
            width: `${dims.fontSize.w * zoom}px`,
            height: `${dims.fontSize.h * zoom}px`,
            imageRendering: "pixelated",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Convert the composed RGB atlas to RGBA, swapping every chroma-gray pixel
 * for the caller-provided background color so the preview matches what the
 * pilot sees when the goggles composite the font over live video.
 */
function rgbToRgbaWithBg(
  rgb: Uint8ClampedArray,
  bg: readonly [number, number, number],
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray((rgb.length / 3) * 4);
  const [br, bg_, bb] = bg;
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    const r = rgb[i]!;
    const g = rgb[i + 1]!;
    const b = rgb[i + 2]!;
    if (r === 127 && g === 127 && b === 127) {
      rgba[j] = br;
      rgba[j + 1] = bg_;
      rgba[j + 2] = bb;
    } else {
      rgba[j] = r;
      rgba[j + 1] = g;
      rgba[j + 2] = b;
    }
    rgba[j + 3] = 255;
  }
  return rgba;
}

/**
 * Shown in place of the atlas canvas when the project has zero layers.
 * Copy + sizing adapt to the current mode so the empty state sets the right
 * expectations: HD pitches the BMP/MCM dual-intake + MCM→HD conversion trick;
 * analog pitches the MCM-only path and mentions Configurator Font Manager
 * as the typical source.
 */
function EmptyFontState({ mode }: { mode: "hd" | "analog" }) {
  const isAnalog = mode === "analog";
  const fontSize = isAnalog ? ANALOG_FONT_SIZE : FONT_SIZE;
  return (
    <div
      class="border border-dashed border-slate-700 bg-slate-900/40 rounded flex flex-col items-center justify-center gap-5 text-center px-10 py-12 font-mono"
      style={{
        width: `${Math.max(fontSize.w, 320)}px`,
        minHeight: `${Math.max(fontSize.h / 3, 200)}px`,
      }}
    >
      <div class="text-osd-mint text-xl">No font loaded</div>
      {isAnalog ? (
        <>
          <p class="text-sm text-slate-300 leading-relaxed max-w-sm">
            Drop a <span class="text-osd-cyan">.mcm</span> analog font in the
            left panel. Analog mode works at native 12×18 — tiles stay
            crisp on-goggle.
          </p>
          <div class="h-px w-24 bg-slate-700" />
          <p class="text-xs text-slate-500 leading-relaxed max-w-sm">
            <span class="text-osd-amber">Tip:</span> if you have an analog font
            you like flashed to your FC already, export it from Betaflight
            Configurator's Font Manager dialog.
          </p>
        </>
      ) : (
        <>
          <p class="text-sm text-slate-300 leading-relaxed max-w-sm">
            Drop a <span class="text-osd-cyan">384×1152 BMP</span> or analog{" "}
            <span class="text-osd-cyan">.mcm</span> file in the left panel to get
            started, or pick one from the community sample dropdown.
          </p>
          <div class="h-px w-24 bg-slate-700" />
          <p class="text-xs text-slate-500 leading-relaxed max-w-sm">
            <span class="text-osd-amber">Tip:</span> drop any analog MAX7456 .mcm
            on the base drop zone and it upscales pixel-perfect into an HD font.
            Great for porting an old analog aesthetic onto your HDZero goggles.
          </p>
        </>
      )}
    </div>
  );
}

type Dims = ReturnType<typeof dimsForMode>;

function drawGrid(ctx: CanvasRenderingContext2D, dims: Dims): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;
  for (let c = 1; c < dims.fontGrid.cols; c++) {
    const x = c * dims.glyphSize.w + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, dims.fontSize.h);
    ctx.stroke();
  }
  for (let r = 1; r < dims.fontGrid.rows; r++) {
    const y = r * dims.glyphSize.h + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(dims.fontSize.w, y);
    ctx.stroke();
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, code: number, dims: Dims): void {
  const { x, y } = dims.codeToOrigin(code);
  // Neon mint stroke, chunky enough to read on a zoomed pixel canvas.
  ctx.strokeStyle = "#00ffaa";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#00ffaa";
  ctx.shadowBlur = 4;
  ctx.strokeRect(x + 1, y + 1, dims.glyphSize.w - 2, dims.glyphSize.h - 2);
  ctx.shadowBlur = 0;
}

/**
 * Tint every tile with its category color at low alpha. Runs once per render
 * (the atlas is only 16×32 tiles; 512 fillRects is cheap).
 */
function drawCategoryOverlay(ctx: CanvasRenderingContext2D): void {
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 0.18;
  for (let code = 0; code < GLYPH_COUNT; code++) {
    const { category } = getGlyphMetadata(code);
    // Unused tiles stay visually neutral — skip the fill so the base font shows through cleanly.
    if (category === "unused") continue;
    const { x, y } = codeToOrigin(code);
    ctx.fillStyle = CATEGORY_COLORS[category];
    ctx.fillRect(x, y, GLYPH_SIZE.w, GLYPH_SIZE.h);
  }
  ctx.globalAlpha = prevAlpha;
}
