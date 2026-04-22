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
import { selectedGlyph } from "@/state/ui-state";
import { compose } from "@/compositor/compose";
import {
  FONT_SIZE,
  GLYPH_SIZE,
  FONT_GRID,
  GLYPH_COUNT,
  codeToOrigin,
} from "@/compositor/constants";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import { getGlyphMetadata, CATEGORY_COLORS } from "./glyph-metadata";

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
  const [zoom, setZoom] = useState<number>(1);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showOverlay, setShowOverlay] = useState<boolean>(false);
  const [bgMode, setBgMode] = useState<PreviewBg>("dark");

  const atlas = useComputed(() => compose(project.value, assets.value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bg = PREVIEW_BACKGROUNDS[bgMode].rgb;
    const rgba = rgbToRgbaWithBg(atlas.value, bg);
    const copy = new Uint8ClampedArray(new ArrayBuffer(rgba.byteLength));
    copy.set(rgba);
    const img = new ImageData(copy, FONT_SIZE.w, FONT_SIZE.h);
    canvas.width = FONT_SIZE.w;
    canvas.height = FONT_SIZE.h;
    ctx.putImageData(img, 0, 0);
    // Order matters: the category tint goes UNDER the grid + selection so the
    // selected tile's outline reads crisply on top of the color wash.
    if (showOverlay) drawCategoryOverlay(ctx);
    if (showGrid) drawGrid(ctx);
    if (selectedGlyph.value !== null) drawSelection(ctx, selectedGlyph.value);
  }, [atlas.value, showGrid, showOverlay, selectedGlyph.value, bgMode]);

  const handleClick = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Mouse → canvas-pixel coords (accounts for zoom via displayed vs native size).
    const px = ((e.clientX - rect.left) / rect.width) * FONT_SIZE.w;
    const py = ((e.clientY - rect.top) / rect.height) * FONT_SIZE.h;
    const col = Math.floor(px / GLYPH_SIZE.w);
    const row = Math.floor(py / GLYPH_SIZE.h);
    if (col < 0 || col >= FONT_GRID.cols || row < 0 || row >= FONT_GRID.rows) return;
    const code = row * FONT_GRID.cols + col;
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
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOverlay}
            onInput={(e: Event) => setShowOverlay((e.target as HTMLInputElement).checked)}
          />
          <span>Category overlay</span>
        </label>
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
          width: `${FONT_SIZE.w * zoom}px`,
          height: `${FONT_SIZE.h * zoom}px`,
          imageRendering: "pixelated",
        }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          class="cursor-crosshair"
          style={{
            width: `${FONT_SIZE.w * zoom}px`,
            height: `${FONT_SIZE.h * zoom}px`,
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

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;
  for (let c = 1; c < FONT_GRID.cols; c++) {
    const x = c * GLYPH_SIZE.w + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FONT_SIZE.h);
    ctx.stroke();
  }
  for (let r = 1; r < FONT_GRID.rows; r++) {
    const y = r * GLYPH_SIZE.h + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(FONT_SIZE.w, y);
    ctx.stroke();
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, code: number): void {
  const { x, y } = codeToOrigin(code);
  // Neon mint stroke, chunky enough to read on a zoomed pixel canvas.
  ctx.strokeStyle = "#00ffaa";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#00ffaa";
  ctx.shadowBlur = 4;
  ctx.strokeRect(x + 1, y + 1, GLYPH_SIZE.w - 2, GLYPH_SIZE.h - 2);
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
