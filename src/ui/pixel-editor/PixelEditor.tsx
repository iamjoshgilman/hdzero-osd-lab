// Modal pixel editor for one glyph tile. Opens from the Glyph Inspector's
// "✎ Draw" button with the current composed tile as the starting state.
// Mode-aware: HD shows a free-form color picker + recent-colors strip;
// analog shows a three-button palette (black / white / transparent) since
// the MAX7456 chip can't render anything else, and letting pilots paint
// mid-grey reds in analog mode would just mislead the preview.
//
// No external dependencies — just Preact + a <canvas>. Pixel math is in
// pixel-ops.ts; this file is the UI shell + event wiring.

import { useEffect, useRef, useState } from "preact/hooks";
import type { OsdMode } from "@/state/project";
import { Button } from "@/ui/shared/Button";
import {
  clonePixels,
  drawLine,
  erasePixel,
  floodFill,
  getPixel,
  parseHexRgb,
  rgbToHex,
  setPixel,
  shadeColor,
  type Rgb,
} from "./pixel-ops";

/**
 * HD quick-pick palette — six universally-useful colors for OSD glyph work.
 * Shown as a preset strip in the HD-mode picker above the recent-colors list.
 */
const HD_PRESET_PALETTE: Readonly<Array<{ rgb: Rgb; label: string }>> = [
  { rgb: [255, 255, 255], label: "White" },
  { rgb: [0, 0, 0], label: "Black" },
  { rgb: [255, 51, 51], label: "Alert red" },
  { rgb: [0, 255, 68], label: "OK green" },
  { rgb: [255, 176, 0], label: "Amber" },
  { rgb: [0, 255, 255], label: "Cyan" },
];

/** Shade offsets shown below the color picker (−40 / −20 / 0 / +20 / +40). */
const SHADE_OFFSETS: readonly number[] = [-40, -20, 0, 20, 40];

type Tool = "pencil" | "eraser" | "fill" | "eyedropper";

const CHROMA_GRAY: Rgb = [127, 127, 127];

/** Pick an initial zoom that lands the longer axis in a comfortable display
 * window. Tile-sized canvases (≤48×48) get a big zoom so pixels are
 * paintable; banner-sized canvases fall to a smaller zoom and let the
 * scroll container handle overflow. Capped so tiny canvases aren't
 * absurdly huge and huge canvases aren't painfully tiny. */
function defaultZoomFor(w: number, h: number): number {
  const long = Math.max(w, h);
  // Single-tile (glyph) editing: target ~500px on the long axis.
  if (long <= 48) return Math.max(8, Math.min(16, Math.floor(500 / long)));
  // Multi-tile (banner/mini): target ~1000px on the long axis, min 3×
  // so individual pixels stay paintable. Banner ends up ~1152px wide.
  return Math.max(3, Math.min(8, Math.floor(1000 / long)));
}

interface Props {
  width: number;
  height: number;
  /** RGB buffer, length = width * height * 3. Cloned internally; caller keeps ownership. */
  initialPixels: Uint8ClampedArray;
  /** Drives the color-palette UX — "analog" limits to black/white/transparent. */
  mode: OsdMode;
  /** Shown in the modal header. Usually "Glyph #NN". */
  title: string;
  /**
   * Spacing (in source pixels) between grid-overlay lines. Default = 1
   * (per-pixel grid, right for single-tile glyph editing). Pass
   * {w: 24, h: 36} for an HD banner canvas so the grid marks tile
   * boundaries instead of drawing 576 dense lines.
   */
  tileBoundary?: { w: number; h: number };
  onSave: (pixels: Uint8ClampedArray) => void;
  onCancel: () => void;
}

export function PixelEditor({
  width,
  height,
  initialPixels,
  mode,
  title,
  tileBoundary,
  onSave,
  onCancel,
}: Props) {
  const [pixels, setPixels] = useState<Uint8ClampedArray>(() => clonePixels(initialPixels));
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<Rgb>(mode === "analog" ? [255, 255, 255] : [0, 255, 170]);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [recent, setRecent] = useState<Rgb[]>([]);
  const [undoStack, setUndoStack] = useState<Uint8ClampedArray[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8ClampedArray[]>([]);
  const [zoom, setZoom] = useState<number>(() => defaultZoomFor(width, height));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceBufferRef = useRef<OffscreenCanvas | null>(null);
  const drawingRef = useRef<boolean>(false);
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const displayW = width * zoom;
  const displayH = height * zoom;

  // Grid spacing: default per-pixel (single-tile), override to tile boundaries
  // on multi-tile canvases so we don't draw 576 dense lines on a banner.
  const gridW = tileBoundary?.w ?? 1;
  const gridH = tileBoundary?.h ?? 1;

  // Render pass uses an offscreen source-sized buffer + scaled drawImage with
  // imageSmoothingEnabled=false. One putImageData + one drawImage per frame,
  // O(w*h) total — fast even at banner sizes (576×144 = 82k pixels). Grid
  // lines draw on top in a separate pass.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = displayW;
    canvas.height = displayH;

    // Upscale RGB → RGBA for putImageData.
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
      rgba[j] = pixels[i]!;
      rgba[j + 1] = pixels[i + 1]!;
      rgba[j + 2] = pixels[i + 2]!;
      rgba[j + 3] = 255;
    }
    // Lazily allocate the source-sized backing canvas.
    if (
      !sourceBufferRef.current ||
      sourceBufferRef.current.width !== width ||
      sourceBufferRef.current.height !== height
    ) {
      sourceBufferRef.current = new OffscreenCanvas(width, height);
    }
    const srcCtx = sourceBufferRef.current.getContext("2d");
    if (!srcCtx) return;
    srcCtx.putImageData(new ImageData(rgba, width, height), 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sourceBufferRef.current, 0, 0, displayW, displayH);

    // Grid overlay. Skip if zoom is too small to see it, or if gridline
    // density would be obnoxious.
    if (showGrid && zoom >= 3) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
      ctx.lineWidth = 1;
      for (let x = gridW; x < width; x += gridW) {
        ctx.beginPath();
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, displayH);
        ctx.stroke();
      }
      for (let y = gridH; y < height; y += gridH) {
        ctx.beginPath();
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(displayW, y * zoom + 0.5);
        ctx.stroke();
      }
    }
  }, [pixels, showGrid, zoom, width, height, displayW, displayH, gridW, gridH]);

  // Escape to cancel. Attached to document so focus doesn't have to be inside
  // the modal for it to work — matches the "backdrop-click closes" intuition.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Release the lazily-allocated OffscreenCanvas on unmount so GPU memory
  // doesn't linger across modal open/close cycles until GC catches up.
  useEffect(() => {
    return () => {
      sourceBufferRef.current = null;
    };
  }, []);

  // Focus trap: on mount, move focus into the modal and cycle Tab / Shift-Tab
  // inside it. On unmount, restore focus to the element that opened the
  // modal (usually the Draw button). Keeps keyboard users inside the modal
  // instead of silently tabbing out to elements behind the backdrop.
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const FOCUSABLE =
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const findFocusables = (): HTMLElement[] =>
      Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("aria-hidden"),
      );

    // Initial focus — first focusable inside the modal.
    const initial = findFocusables()[0];
    if (initial) initial.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = findFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const pointerToCell = (e: PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * displayW;
    const py = ((e.clientY - rect.top) / rect.height) * displayH;
    const cx = Math.floor(px / zoom);
    const cy = Math.floor(py / zoom);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null;
    return { x: cx, y: cy };
  };

  const snapshot = (): void => {
    setUndoStack((s) => [...s.slice(-49), clonePixels(pixels)]);
    setRedoStack([]);
  };

  const addRecentColor = (rgb: Rgb): void => {
    setRecent((r) => {
      const filtered = r.filter((c) => !(c[0] === rgb[0] && c[1] === rgb[1] && c[2] === rgb[2]));
      return [rgb, ...filtered].slice(0, 8);
    });
  };

  const applyTool = (x: number, y: number, draftPixels: Uint8ClampedArray): void => {
    switch (tool) {
      case "pencil":
        setPixel(draftPixels, width, height, x, y, color);
        addRecentColor(color);
        break;
      case "eraser":
        erasePixel(draftPixels, width, height, x, y);
        break;
      case "fill":
        floodFill(draftPixels, width, height, x, y, color);
        addRecentColor(color);
        break;
      case "eyedropper":
        setColor(getPixel(draftPixels, width, height, x, y));
        break;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    const cell = pointerToCell(e);
    if (!cell) return;
    snapshot();
    const next = clonePixels(pixels);
    applyTool(cell.x, cell.y, next);
    setPixels(next);
    drawingRef.current = true;
    lastCellRef.current = cell;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drawingRef.current) return;
    if (tool === "fill" || tool === "eyedropper") return;
    const cell = pointerToCell(e);
    if (!cell) return;
    const last = lastCellRef.current;
    if (last && last.x === cell.x && last.y === cell.y) return;
    const next = clonePixels(pixels);
    // Line-connect to the previous cell so fast sweeps don't leave gaps.
    const src = last ?? cell;
    const rgb = tool === "eraser" ? CHROMA_GRAY : color;
    drawLine(next, width, height, src.x, src.y, cell.x, cell.y, rgb);
    setPixels(next);
    lastCellRef.current = cell;
  };

  const onPointerUp = () => {
    drawingRef.current = false;
    lastCellRef.current = null;
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, clonePixels(pixels)]);
    setPixels(prev);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, clonePixels(pixels)]);
    setPixels(next);
  };

  const clearAll = () => {
    snapshot();
    const next = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < next.length; i += 3) {
      next[i] = 127;
      next[i + 1] = 127;
      next[i + 2] = 127;
    }
    setPixels(next);
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={(e: MouseEvent) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/*
        Fixed size regardless of canvas dimensions or zoom — prevents the
        modal from growing/shrinking every time the user drags the zoom
        slider. Canvas area inside scrolls when the content exceeds it.
      */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Pixel editor: ${title}`}
        class="bg-slate-900 border border-slate-700 rounded-lg shadow-xl flex flex-col overflow-hidden"
        style={{
          width: "min(90vw, 1200px)",
          height: "min(90vh, 800px)",
        }}
      >
        <header class="flex items-center justify-between border-b border-slate-800 px-4 py-2">
          <h2 class="font-mono text-sm font-semibold text-osd-mint">
            ✎ Draw · <span class="text-slate-300">{title}</span>
            <span class="text-slate-500 text-[11px] ml-2 font-normal">
              {width}×{height}
            </span>
          </h2>
          <button
            onClick={onCancel}
            aria-label="Close pixel editor (Esc)"
            class="text-slate-500 hover:text-slate-200 text-lg font-mono px-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            title="Cancel (Esc)"
          >
            ×
          </button>
        </header>

        <div class="flex gap-4 p-4 flex-1 min-h-0">
          {/* Toolbar */}
          <div class="flex flex-col gap-3 w-44 shrink-0 font-mono text-[11px]">
            <ToolPicker tool={tool} onPick={setTool} />
            <Palette mode={mode} color={color} onPickColor={(c) => {
              setColor(c);
              addRecentColor(c);
            }} recent={recent} />
            <div class="flex flex-col gap-1">
              <div class="flex gap-1">
                <Button
                  variant="secondary"
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  class="flex-1 !px-2 !py-1 !text-[10px]"
                >
                  ↶ Undo
                </Button>
                <Button
                  variant="secondary"
                  onClick={redo}
                  disabled={redoStack.length === 0}
                  class="flex-1 !px-2 !py-1 !text-[10px]"
                >
                  ↷ Redo
                </Button>
              </div>
              <Button
                variant="secondary"
                onClick={clearAll}
                class="!px-2 !py-1 !text-[10px]"
                title="Clear tile to chroma-gray (transparent)"
              >
                Clear all
              </Button>
              <label class="flex items-center gap-2 mt-1 cursor-pointer text-slate-400">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onInput={(e: Event) => setShowGrid((e.target as HTMLInputElement).checked)}
                />
                <span>Grid</span>
              </label>
              <label class="flex flex-col gap-0.5 text-slate-400 text-[10px] mt-1">
                <span>
                  Zoom <span class="text-slate-300">{zoom}×</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={32}
                  step={1}
                  value={zoom}
                  onInput={(e: Event) => setZoom(parseInt((e.target as HTMLInputElement).value, 10))}
                />
              </label>
            </div>

            <RealSizePreview pixels={pixels} width={width} height={height} />
          </div>

          {/* Canvas */}
          <div class="flex-1 flex items-center justify-center overflow-auto bg-slate-950 border border-slate-800 rounded p-3">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                width: `${displayW}px`,
                height: `${displayH}px`,
                imageRendering: "pixelated",
                cursor: tool === "eyedropper" ? "crosshair" : "cell",
                touchAction: "none",
              }}
            />
          </div>
        </div>

        <footer class="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-3 bg-slate-950/40">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(pixels)}>
            Save tile
          </Button>
        </footer>
      </div>
    </div>
  );
}

function ToolPicker({ tool, onPick }: { tool: Tool; onPick: (t: Tool) => void }) {
  const tools: Array<{ id: Tool; label: string; hint: string }> = [
    { id: "pencil", label: "✎ Pencil", hint: "Click/drag to paint with the current color." },
    { id: "eraser", label: "⌫ Eraser", hint: "Click/drag to write chroma-gray (transparent)." },
    { id: "fill", label: "🪣 Fill", hint: "Flood-fill the clicked region with the current color." },
    { id: "eyedropper", label: "💧 Eyedropper", hint: "Click a pixel to adopt its color." },
  ];
  return (
    <div class="flex flex-col gap-1">
      <div class="text-slate-500 uppercase tracking-wider text-[9px]">Tool</div>
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          aria-pressed={tool === t.id}
          title={t.hint}
          class={[
            "px-2 py-1 rounded text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-osd-mint",
            tool === t.id
              ? "bg-osd-mint text-slate-900 font-semibold"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Palette({
  mode,
  color,
  onPickColor,
  recent,
}: {
  mode: OsdMode;
  color: Rgb;
  onPickColor: (c: Rgb) => void;
  recent: Rgb[];
}) {
  if (mode === "analog") {
    // Three-button palette. No picker: MAX7456 is 2-bit, anything else is a
    // lie to the preview.
    return (
      <div class="flex flex-col gap-1">
        <div class="text-slate-500 uppercase tracking-wider text-[9px]">Color (analog)</div>
        <ColorButton label="Glyph (white)" rgb={[255, 255, 255]} active={color[0] === 255} onPick={onPickColor} />
        <ColorButton label="Outline (black)" rgb={[0, 0, 0]} active={color[0] === 0} onPick={onPickColor} />
        <ColorButton label="Transparent" rgb={[127, 127, 127]} active={color[0] === 127} onPick={onPickColor} />
        <p class="text-[9px] text-slate-500 leading-snug mt-1">
          MAX7456 is 2-bit. Only these three states render on-goggle.
        </p>
      </div>
    );
  }
  return (
    <div class="flex flex-col gap-2">
      <div class="text-slate-500 uppercase tracking-wider text-[9px]">Color</div>
      <div class="flex items-center gap-2">
        <input
          type="color"
          value={rgbToHex(color)}
          onInput={(e: Event) => onPickColor(parseHexRgb((e.target as HTMLInputElement).value))}
          class="w-10 h-8 bg-slate-900 border border-slate-700 rounded cursor-pointer"
        />
        <input
          type="text"
          value={rgbToHex(color)}
          onInput={(e: Event) => {
            const v = (e.target as HTMLInputElement).value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onPickColor(parseHexRgb(v));
          }}
          class="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-1 py-1 text-[10px] font-mono text-slate-100"
        />
      </div>
      <button
        onClick={() => onPickColor([127, 127, 127])}
        class="px-2 py-1 rounded text-left text-[10px] bg-slate-800 text-slate-300 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        title="Set color to chroma-gray (transparent-on-goggle)"
      >
        Transparent (chroma-gray)
      </button>

      <div class="flex flex-col gap-1">
        <div class="text-slate-500 uppercase tracking-wider text-[9px]">Presets</div>
        <div class="flex flex-wrap gap-1">
          {HD_PRESET_PALETTE.map((p) => (
            <button
              key={p.label}
              onClick={() => onPickColor(p.rgb)}
              aria-label={`${p.label} (${rgbToHex(p.rgb)})`}
              class="w-5 h-5 border border-slate-600 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-osd-mint"
              style={{ background: `rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})` }}
              title={p.label}
            />
          ))}
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <div class="text-slate-500 uppercase tracking-wider text-[9px]" title="Shift the current color's lightness while preserving hue. Great for shadow/highlight pairs.">
          Shade
        </div>
        <div class="flex gap-1">
          {SHADE_OFFSETS.map((delta) => {
            const shade = delta === 0 ? color : shadeColor(color, delta);
            const active = delta === 0;
            return (
              <button
                key={delta}
                onClick={() => onPickColor(shade)}
                aria-label={`Shade ${delta >= 0 ? "+" : ""}${delta}% (${rgbToHex(shade)})`}
                class={[
                  "flex-1 h-6 border rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-osd-mint",
                  active ? "border-osd-mint" : "border-slate-600",
                ].join(" ")}
                style={{ background: `rgb(${shade[0]},${shade[1]},${shade[2]})` }}
                title={`${delta >= 0 ? "+" : ""}${delta}%  ${rgbToHex(shade)}`}
              />
            );
          })}
        </div>
      </div>

      {recent.length > 0 && (
        <div class="flex flex-col gap-1">
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Recent</div>
          <div class="flex flex-wrap gap-1">
            {recent.map((rgb, i) => (
              <button
                key={i}
                onClick={() => onPickColor(rgb)}
                aria-label={`Recent color ${rgbToHex(rgb)}`}
                class="w-5 h-5 border border-slate-600 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-osd-mint"
                style={{ background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` }}
                title={rgbToHex(rgb)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Live-updating preview of the tile on a dark "goggle sky" background with
 * chroma-gray rendered as the background color. Scales to fit the toolbar
 * column while preserving aspect — small canvases get upscaled a bit for
 * visibility, banner-sized canvases get downscaled to a thumbnail so they
 * don't overflow the toolbar. Always shows the whole canvas; for
 * pixel-level detail the main canvas + zoom slider is the tool.
 */
function RealSizePreview({
  pixels,
  width,
  height,
}: {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maxW = 160;
  const maxH = 100;
  // Aspect-preserved scale that fits inside both caps. Works for tiny
  // glyph tiles (upscale) and wide banner canvases (downscale) alike.
  const scale = Math.min(maxW / width, maxH / height);
  const displayW = Math.max(1, Math.round(width * scale));
  const displayH = Math.max(1, Math.round(height * scale));
  // Slate-950 background — mimics a dim-sky FPV frame behind the OSD.
  const BG: Rgb = [15, 23, 42];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = displayW;
    canvas.height = displayH;
    ctx.imageSmoothingEnabled = false;

    // Paint an offscreen source-sized buffer once, then scale via drawImage.
    // Much faster than fillRect-per-pixel at banner sizes; matters when the
    // preview re-renders on every edit.
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      // Chroma-gray → render as the sky background so the preview shows
      // transparency how the goggle actually composites it.
      const isChroma = r === 127 && g === 127 && b === 127;
      rgba[j] = isChroma ? BG[0] : r;
      rgba[j + 1] = isChroma ? BG[1] : g;
      rgba[j + 2] = isChroma ? BG[2] : b;
      rgba[j + 3] = 255;
    }
    const source = new OffscreenCanvas(width, height);
    const srcCtx = source.getContext("2d");
    if (!srcCtx) return;
    srcCtx.putImageData(new ImageData(rgba, width, height), 0, 0);
    ctx.drawImage(source, 0, 0, displayW, displayH);
  }, [pixels, width, height, displayW, displayH]);

  return (
    <div class="flex flex-col gap-1 mt-2">
      <div class="text-slate-500 uppercase tracking-wider text-[9px]">
        Preview (on-goggle)
      </div>
      <div
        class="border border-slate-700 rounded-sm bg-slate-950 inline-block"
        style={{ width: `${displayW}px`, height: `${displayH}px` }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: `${displayW}px`,
            height: `${displayH}px`,
            imageRendering: "pixelated",
            display: "block",
          }}
        />
      </div>
    </div>
  );
}

function ColorButton({
  label,
  rgb,
  active,
  onPick,
}: {
  label: string;
  rgb: Rgb;
  active: boolean;
  onPick: (c: Rgb) => void;
}) {
  return (
    <button
      onClick={() => onPick(rgb)}
      aria-pressed={active}
      class={[
        "flex items-center gap-2 px-2 py-1 rounded transition-colors text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-osd-mint",
        active ? "bg-osd-mint text-slate-900 font-semibold" : "bg-slate-800 text-slate-300 hover:bg-slate-700",
      ].join(" ")}
    >
      <span
        class="w-4 h-4 border border-slate-600 rounded-sm inline-block shrink-0"
        style={{ background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` }}
      />
      <span>{label}</span>
    </button>
  );
}
