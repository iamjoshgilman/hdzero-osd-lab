// Renders a simulated 53×20 Betaflight OSD using the current composed font
// as a sprite atlas. Each enabled element from OSD_ELEMENTS draws its sample
// glyph sequence at the element's effective position (project layout override
// if present, otherwise the schema default).
//
// alpha.2 scope: rendering only. Drag-to-reposition + element selection land
// in alpha.3.

import { useEffect, useRef, useState } from "preact/hooks";
import { useComputed } from "@preact/signals";
import { project, mutate } from "@/state/store";
import { selectedOsdElement } from "@/state/ui-state";
import { compose } from "@/compositor/compose";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import {
  FONT_SIZE,
  GLYPH_SIZE,
  codeToOrigin,
  ANALOG_FONT_SIZE,
  ANALOG_GLYPH_SIZE,
  ANALOG_OSD_GRID,
  analogCodeToOrigin,
} from "@/compositor/constants";
import { OSD_ELEMENTS, OSD_GRID, type OsdElement } from "@/osd-schema/elements";
import { analogDefaultFor } from "@/osd-schema/analog-defaults";
import type { ProjectDoc, OsdMode } from "@/state/project";

/**
 * Dimensions + lookup helpers that depend on the current OSD mode. Wrapping
 * these up keeps the canvas render + drag/hit handlers mode-agnostic.
 */
function dimsForMode(mode: OsdMode) {
  if (mode === "analog") {
    return {
      osdGrid: ANALOG_OSD_GRID,
      glyphSize: ANALOG_GLYPH_SIZE,
      fontSize: ANALOG_FONT_SIZE,
      codeToOrigin: analogCodeToOrigin,
    };
  }
  return {
    osdGrid: OSD_GRID,
    glyphSize: GLYPH_SIZE,
    fontSize: FONT_SIZE,
    codeToOrigin,
  };
}

/** Background options — same semantics as the FontPreview toolbar. */
const BG_OPTIONS = {
  chroma: { label: "Chroma-gray", rgb: "rgb(127,127,127)" },
  dark: { label: "Dark (sky)", rgb: "rgb(15,23,42)" },
  trees: { label: "Trees (dark green)", rgb: "rgb(26,40,28)" },
  black: { label: "Black", rgb: "rgb(0,0,0)" },
} as const;
type BgKey = keyof typeof BG_OPTIONS;

interface EffectivePosition {
  x: number;
  y: number;
  enabled: boolean;
}

/**
 * Resolve an element's actual position in the current project. Branches on
 * mode:
 *   - HD: osdLayout.elements override → schema defaultPos + defaultEnabled.
 *   - Analog: osdLayout.elementsAnalog override → ANALOG_DEFAULT_POSITIONS
 *     starter set (enabled) → disabled at (0,0) if the element isn't in the
 *     starter set. Lets pilots opt in to analog elements one at a time
 *     instead of opening to an HD-layout mess clamped into 30×16.
 */
function effectivePosition(element: OsdElement, doc: ProjectDoc): EffectivePosition {
  const mode = doc.meta.mode;
  const layoutMap =
    mode === "analog" ? doc.osdLayout.elementsAnalog : doc.osdLayout.elements;
  const override = layoutMap?.[element.id];
  if (override) return override;

  if (mode === "analog") {
    const analog = analogDefaultFor(element.id);
    if (analog) return { x: analog.x, y: analog.y, enabled: true };
    return { x: 0, y: 0, enabled: false };
  }

  return {
    x: element.defaultPos.x,
    y: element.defaultPos.y,
    enabled: element.defaultEnabled,
  };
}

/**
 * Resolve the glyph sequence to blit for an element. For text-editable
 * elements (craft name, pilot name, custom messages) the user's typed text
 * wins over the schema sample; the text gets ASCII-encoded glyph-by-glyph.
 * Characters outside the printable ASCII range fall through to space (0x20).
 */
function effectiveSample(element: OsdElement, doc: ProjectDoc): readonly number[] {
  if (!element.editableText) return element.sample;
  const override = doc.osdLayout.elements[element.id];
  const text = override?.customText;
  if (!text) return element.sample;
  const max = element.maxTextLen ?? text.length;
  // Defense-in-depth: input already uppercases on the way in for upperCaseOnly
  // fields, but older projects saved before that behavior existed may still
  // have mixed-case text. Apply the transform again at render time so those
  // don't render as arrows.
  const source = element.upperCaseOnly ? text.toUpperCase() : text;
  const trimmed = source.slice(0, max);
  return Array.from(trimmed, (c) => {
    const code = c.charCodeAt(0);
    return code >= 32 && code <= 126 ? code : 0x20;
  });
}

/** Transient drag state: which element is being dragged and where it currently sits in grid cells. */
interface DragState {
  elementId: string;
  col: number;
  row: number;
}

export function OsdCanvas() {
  const { assets, loading, error, bgImage } = useResolvedAssets();
  const atlas = useComputed(() => compose(project.value, assets.value));
  const selected = useComputed(() => selectedOsdElement.value);
  const hasLayers = useComputed(() => project.value.font.layers.length > 0);
  const mode = useComputed(() => project.value.meta.mode);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [bg, setBg] = useState<BgKey>("chroma");
  const [fitWidth, setFitWidth] = useState<boolean>(true);
  const [bgDim, setBgDim] = useState<number>(0); // 0..1 darkening overlay over bg image
  const [realism, setRealism] = useState<boolean>(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const dims = dimsForMode(mode.value);
  const OSD_W_PX = dims.osdGrid.cols * dims.glyphSize.w;
  const OSD_H_PX = dims.osdGrid.rows * dims.glyphSize.h;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = OSD_W_PX;
    canvas.height = OSD_H_PX;

    // Background: solid color, with optional FPV image on top.
    ctx.fillStyle = BG_OPTIONS[bg].rgb;
    ctx.fillRect(0, 0, OSD_W_PX, OSD_H_PX);
    const img = bgImage.value;
    if (img) {
      // Cover-fit: preserve aspect, fill the frame. Matches how FPV footage
      // would look framed by the goggles.
      const srcAR = img.width / img.height;
      const dstAR = OSD_W_PX / OSD_H_PX;
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      if (srcAR > dstAR) {
        // Source is wider than dst — crop horizontally.
        const newW = img.height * dstAR;
        sx = (img.width - newW) / 2;
        sw = newW;
      } else {
        const newH = img.width / dstAR;
        sy = (img.height - newH) / 2;
        sh = newH;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OSD_W_PX, OSD_H_PX);
      if (bgDim > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${bgDim})`;
        ctx.fillRect(0, 0, OSD_W_PX, OSD_H_PX);
      }
    }

    // Turn the composed RGB atlas into an ImageData we can sample from.
    const rgba = rgbToRgba(atlas.value);
    const copy = new Uint8ClampedArray(new ArrayBuffer(rgba.byteLength));
    copy.set(rgba);
    const atlasImg = new ImageData(copy, dims.fontSize.w, dims.fontSize.h);

    // Offscreen atlas canvas for fast drawImage-based blitting.
    const off = document.createElement("canvas");
    off.width = dims.fontSize.w;
    off.height = dims.fontSize.h;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.putImageData(atlasImg, 0, 0);

    // Treat chroma-gray pixels as transparent so the OSD bg shows through.
    // We do this with a second offscreen pass where we clear chroma-gray via
    // globalCompositeOperation; simpler approach: use ImageData walk.
    const clearGray = offCtx.getImageData(0, 0, dims.fontSize.w, dims.fontSize.h);
    for (let i = 0; i < clearGray.data.length; i += 4) {
      if (
        clearGray.data[i] === 127 &&
        clearGray.data[i + 1] === 127 &&
        clearGray.data[i + 2] === 127
      ) {
        clearGray.data[i + 3] = 0;
      }
    }
    offCtx.putImageData(clearGray, 0, 0);

    ctx.imageSmoothingEnabled = false;

    // Blit every enabled element's sample glyphs. For the element currently
    // being dragged, use the drag's live position instead of the project's.
    for (const element of OSD_ELEMENTS) {
      const base = effectivePosition(element, project.value);
      if (!base.enabled) continue;
      const livePos =
        drag && drag.elementId === element.id ? { x: drag.col, y: drag.row } : base;
      const sample = effectiveSample(element, project.value);
      const rows = element.spanRows ?? 1;
      const cols = Math.floor(sample.length / rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const code = sample[r * cols + c]!;
          const col = livePos.x + c;
          const row = livePos.y + r;
          if (col >= dims.osdGrid.cols || col < 0) continue;
          if (row >= dims.osdGrid.rows || row < 0) continue;
          const { x: sx, y: sy } = dims.codeToOrigin(code);
          const dx = col * dims.glyphSize.w;
          const dy = row * dims.glyphSize.h;
          ctx.drawImage(
            off,
            sx,
            sy,
            dims.glyphSize.w,
            dims.glyphSize.h,
            dx,
            dy,
            dims.glyphSize.w,
            dims.glyphSize.h,
          );
        }
      }
    }

    // Realism overlay: horizontal scanlines + a touch of noise. Applied on
    // top of everything (bg + elements) but UNDER the selection highlight so
    // the mint outline still reads crisply. Kept subtle; real goggle video
    // isn't a CRT, but a hint of scanline texture stops the preview from
    // looking like a flat digital mockup.
    if (realism) {
      // Alternating 2-px scanlines at ~10% darkening.
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = "#000";
      for (let y = 0; y < OSD_H_PX; y += 4) {
        ctx.fillRect(0, y, OSD_W_PX, 2);
      }
      ctx.restore();
      // Sparse, deterministic noise sprinkle (same seed each draw so it
      // doesn't shimmer; just breaks up the pristine-canvas feel).
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#fff";
      let s = 0x9e3779b1;
      for (let i = 0; i < 900; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        const r = (s >>> 0) / 0x1_0000_0000;
        const nx = Math.floor(r * OSD_W_PX);
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        const r2 = (s >>> 0) / 0x1_0000_0000;
        const ny = Math.floor(r2 * OSD_H_PX);
        ctx.fillRect(nx, ny, 1, 1);
      }
      ctx.restore();
    }

    // Selection highlight — neon-mint box around the selected element.
    if (selected.value) {
      const el = OSD_ELEMENTS.find((e) => e.id === selected.value);
      if (el) {
        const base = effectivePosition(el, project.value);
        const livePos =
          drag && drag.elementId === el.id ? { x: drag.col, y: drag.row } : base;
        if (base.enabled) {
          const sample = effectiveSample(el, project.value);
          const rows = el.spanRows ?? 1;
          const cols = Math.floor(sample.length / rows);
          ctx.strokeStyle = "#00ffaa";
          ctx.lineWidth = 2;
          ctx.shadowColor = "#00ffaa";
          ctx.shadowBlur = 6;
          ctx.strokeRect(
            livePos.x * dims.glyphSize.w - 1,
            livePos.y * dims.glyphSize.h - 1,
            cols * dims.glyphSize.w + 2,
            rows * dims.glyphSize.h + 2,
          );
          ctx.shadowBlur = 0;
        }
      }
    }
  }, [atlas.value, bg, drag, selected.value, bgImage.value, bgDim, realism]);

  /** Map a pointer event to grid (col, row). */
  const pointerToCell = (e: PointerEvent): { col: number; row: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * OSD_W_PX;
    const py = ((e.clientY - rect.top) / rect.height) * OSD_H_PX;
    const col = Math.floor(px / dims.glyphSize.w);
    const row = Math.floor(py / dims.glyphSize.h);
    if (col < 0 || col >= dims.osdGrid.cols || row < 0 || row >= dims.osdGrid.rows) return null;
    return { col, row };
  };

  /** Find the topmost enabled element whose rendered footprint contains the given cell. */
  const hitTest = (col: number, row: number): OsdElement | null => {
    // Walk in reverse so later-drawn elements win ties visually.
    for (let i = OSD_ELEMENTS.length - 1; i >= 0; i--) {
      const el = OSD_ELEMENTS[i]!;
      const pos = effectivePosition(el, project.value);
      if (!pos.enabled) continue;
      const sample = effectiveSample(el, project.value);
      const rows = el.spanRows ?? 1;
      const cols = Math.floor(sample.length / rows);
      if (
        col >= pos.x &&
        col < pos.x + cols &&
        row >= pos.y &&
        row < pos.y + rows
      ) {
        return el;
      }
    }
    return null;
  };

  const handlePointerDown = (e: PointerEvent) => {
    const cell = pointerToCell(e);
    if (!cell) return;
    const hit = hitTest(cell.col, cell.row);
    if (!hit) {
      selectedOsdElement.value = null;
      return;
    }
    selectedOsdElement.value = hit.id;
    const pos = effectivePosition(hit, project.value);
    // Record the offset from the element's origin so the element doesn't jump
    // under the cursor when dragging from its middle.
    const offsetCol = cell.col - pos.x;
    const offsetRow = cell.row - pos.y;
    const initial: DragState = { elementId: hit.id, col: pos.x, row: pos.y };
    dragStateRef.current = initial;
    setDrag(initial);
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);

    // Stash the offset on the ref via a side channel — cheapest option.
    (dragStateRef.current as DragState & { _offCol?: number; _offRow?: number })._offCol =
      offsetCol;
    (dragStateRef.current as DragState & { _offCol?: number; _offRow?: number })._offRow =
      offsetRow;
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!dragStateRef.current) return;
    const cell = pointerToCell(e);
    if (!cell) return;
    const offCol =
      (dragStateRef.current as DragState & { _offCol?: number })._offCol ?? 0;
    const offRow =
      (dragStateRef.current as DragState & { _offRow?: number })._offRow ?? 0;
    const el = OSD_ELEMENTS.find((x) => x.id === dragStateRef.current!.elementId);
    if (!el) return;
    const sample = effectiveSample(el, project.value);
    const rows = el.spanRows ?? 1;
    const width = Math.floor(sample.length / rows);
    const newCol = Math.max(0, Math.min(dims.osdGrid.cols - width, cell.col - offCol));
    const newRow = Math.max(0, Math.min(dims.osdGrid.rows - rows, cell.row - offRow));
    const next: DragState = { elementId: dragStateRef.current.elementId, col: newCol, row: newRow };
    // Preserve the offsets across renders.
    (next as DragState & { _offCol?: number; _offRow?: number })._offCol = offCol;
    (next as DragState & { _offCol?: number; _offRow?: number })._offRow = offRow;
    dragStateRef.current = next;
    setDrag(next);
  };

  /** Drop a one-off status message in the toolbar for `ms` milliseconds. */
  const flashMsg = (text: string, ms = 1800) => {
    setShareMsg(text);
    window.setTimeout(() => setShareMsg(null), ms);
  };

  const getCanvasBlob = async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  };

  const downloadPng = async () => {
    const blob = await getCanvasBlob();
    if (!blob) {
      flashMsg("export failed");
      return;
    }
    const name = (project.value.meta.name || "osd-preview").replace(/\s+/g, "-").toLowerCase();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-osd.png`;
    a.click();
    URL.revokeObjectURL(url);
    flashMsg("PNG downloaded");
  };

  const copyToClipboard = async () => {
    try {
      const blob = await getCanvasBlob();
      if (!blob) {
        flashMsg("copy failed");
        return;
      }
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        flashMsg("clipboard not supported — use Download PNG");
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flashMsg("copied to clipboard");
    } catch (err) {
      flashMsg(err instanceof Error ? `copy failed: ${err.message}` : "copy failed");
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    const d = dragStateRef.current;
    dragStateRef.current = null;
    if (!d) return;
    const canvas = canvasRef.current;
    try {
      canvas?.releasePointerCapture(e.pointerId);
    } catch {
      // Safari/older browsers can throw if capture was not held
    }
    const el = OSD_ELEMENTS.find((x) => x.id === d.elementId);
    if (!el) {
      setDrag(null);
      return;
    }
    const basePos = effectivePosition(el, project.value);
    if (basePos.x === d.col && basePos.y === d.row) {
      // No movement — skip the mutation to avoid a no-op undo entry.
      setDrag(null);
      return;
    }
    mutate((doc) => {
      // Pick the right layout map for the active mode, creating the analog
      // bucket on first write. Existing custom text + enabled flags carry
      // over — spread-first preserves any per-element fields we add later.
      if (doc.meta.mode === "analog") {
        if (!doc.osdLayout.elementsAnalog) doc.osdLayout.elementsAnalog = {};
        const existing = doc.osdLayout.elementsAnalog[el.id];
        doc.osdLayout.elementsAnalog[el.id] = {
          ...(existing ?? {}),
          x: d.col,
          y: d.row,
          enabled: existing ? existing.enabled : el.defaultEnabled,
        };
      } else {
        const existing = doc.osdLayout.elements[el.id];
        doc.osdLayout.elements[el.id] = {
          ...(existing ?? {}),
          x: d.col,
          y: d.row,
          enabled: existing ? existing.enabled : el.defaultEnabled,
        };
      }
    });
    setDrag(null);
  };

  if (!hasLayers.value) {
    return <EmptyOsdState mode={mode.value} />;
  }

  return (
    <div class="flex flex-col items-center gap-3 w-full">
      <div class="flex gap-4 items-center text-xs font-mono text-slate-400 flex-wrap">
        <label class="flex items-center gap-2">
          <span>Background</span>
          <select
            value={bg}
            onChange={(e: Event) => setBg((e.target as HTMLSelectElement).value as BgKey)}
            class="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-slate-100 text-xs"
          >
            {Object.entries(BG_OPTIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={fitWidth}
            onInput={(e: Event) => setFitWidth((e.target as HTMLInputElement).checked)}
          />
          <span>Fit width</span>
        </label>
        <label
          class="flex items-center gap-2 cursor-pointer"
          title="Subtle scanline + grain overlay to approximate FPV video look"
        >
          <input
            type="checkbox"
            checked={realism}
            onInput={(e: Event) => setRealism((e.target as HTMLInputElement).checked)}
          />
          <span>Realism</span>
        </label>
        {bgImage.value && (
          <label class="flex items-center gap-2">
            <span>Dim</span>
            <input
              type="range"
              min="0"
              max="0.85"
              step="0.05"
              value={bgDim}
              onInput={(e: Event) => setBgDim(parseFloat((e.target as HTMLInputElement).value))}
            />
            <span>{Math.round(bgDim * 100)}%</span>
          </label>
        )}
        <div class="flex items-center gap-2 ml-auto">
          <button
            onClick={copyToClipboard}
            class="px-2 py-1 rounded bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 text-xs"
            title="Copy current OSD view as a PNG to the clipboard"
          >
            ⧉ Copy
          </button>
          <button
            onClick={downloadPng}
            class="px-2 py-1 rounded bg-osd-mint text-slate-900 hover:bg-emerald-300 text-xs font-semibold"
            title="Download current OSD view as a PNG"
          >
            ↓ PNG
          </button>
        </div>
        {shareMsg && <span class="text-osd-mint">{shareMsg}</span>}
        {loading.value && <span class="text-osd-amber">Loading assets…</span>}
        {error.value && <span class="text-osd-alert">{error.value}</span>}
      </div>
      <div
        class="border border-slate-700 bg-slate-800 max-w-full"
        style={{
          width: fitWidth ? "100%" : `${OSD_W_PX}px`,
          aspectRatio: `${OSD_W_PX} / ${OSD_H_PX}`,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          class={drag ? "cursor-grabbing" : "cursor-grab"}
          style={{
            width: "100%",
            height: "100%",
            imageRendering: "pixelated",
            display: "block",
            touchAction: "none",
          }}
        />
      </div>
      <p class="text-[10px] font-mono text-slate-500">
        {OSD_ELEMENTS.filter((e) => effectivePosition(e, project.value).enabled).length} of{" "}
        {OSD_ELEMENTS.length} elements enabled · {dims.osdGrid.cols}×{dims.osdGrid.rows} grid ({OSD_W_PX}×{OSD_H_PX} native)
      </p>
    </div>
  );
}

/**
 * Shown in place of the OSD simulator canvas when no font is loaded. Mirrors
 * the Font tab's empty-state pattern and pitches the FPV-background feature
 * so pilots know that's an option before they even have a font to preview
 * over it. Aspect ratio adapts to the active OSD mode so the empty state
 * visually previews the grid shape they'll be working in.
 */
function EmptyOsdState({ mode }: { mode: OsdMode }) {
  const d = dimsForMode(mode);
  const w = d.osdGrid.cols * d.glyphSize.w;
  const h = d.osdGrid.rows * d.glyphSize.h;
  return (
    <div
      class="border border-dashed border-slate-700 bg-slate-900/40 rounded flex flex-col items-center justify-center gap-5 text-center px-10 py-14 font-mono w-full max-w-3xl"
      style={{ aspectRatio: `${w} / ${h}` }}
    >
      <div class="text-osd-mint text-xl">No font loaded</div>
      <p class="text-sm text-slate-300 leading-relaxed max-w-lg">
        The OSD simulator needs a font to render glyphs over. Head to the{" "}
        <span class="text-osd-cyan">Font</span> tab and drop a{" "}
        <span class="text-osd-cyan">.bmp</span> or{" "}
        <span class="text-osd-cyan">.mcm</span>, then come back here to lay
        out your elements.
      </p>
      <div class="h-px w-24 bg-slate-700" />
      <p class="text-xs text-slate-500 leading-relaxed max-w-lg">
        <span class="text-osd-amber">Tip:</span> once a font is loaded, this
        tab lets you preview the OSD over a real FPV background. Drop your
        own DVR still frame, or pick one of the built-in presets (skyscraper
        dive, mountain surfing, bando, dusk low-light) to see exactly how
        your layout reads in-flight.
      </p>
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
