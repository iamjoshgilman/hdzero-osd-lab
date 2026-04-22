// Renders a composed 384×1152 RGB atlas to a canvas with zoom, optional grid
// overlay, and click-to-select. Clicking a tile sets the shared
// `selectedGlyph` signal; the selected tile is highlighted with a green
// outline. LayersPanel reads the same signal to pre-fill its override-code
// input.

import { useEffect, useRef, useState } from "preact/hooks";
import { useComputed } from "@preact/signals";
import { project } from "@/state/store";
import { selectedGlyph } from "@/state/ui-state";
import { compose } from "@/compositor/compose";
import { FONT_SIZE, GLYPH_SIZE, FONT_GRID, codeToOrigin } from "@/compositor/constants";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";

export function FontPreview() {
  const { assets, loading, error } = useResolvedAssets();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [showGrid, setShowGrid] = useState<boolean>(false);

  const atlas = useComputed(() => compose(project.value, assets.value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgba = rgbToRgba(atlas.value);
    const copy = new Uint8ClampedArray(new ArrayBuffer(rgba.byteLength));
    copy.set(rgba);
    const img = new ImageData(copy, FONT_SIZE.w, FONT_SIZE.h);
    canvas.width = FONT_SIZE.w;
    canvas.height = FONT_SIZE.h;
    ctx.putImageData(img, 0, 0);
    if (showGrid) drawGrid(ctx);
    if (selectedGlyph.value !== null) drawSelection(ctx, selectedGlyph.value);
  }, [atlas.value, showGrid, selectedGlyph.value]);

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

function rgbToRgba(rgb: Uint8ClampedArray): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray((rgb.length / 3) * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i]!;
    rgba[j + 1] = rgb[i + 1]!;
    rgba[j + 2] = rgb[i + 2]!;
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
