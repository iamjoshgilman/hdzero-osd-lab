// Renders a simulated 53×20 Betaflight OSD using the current composed font
// as a sprite atlas. Each enabled element from OSD_ELEMENTS draws its sample
// glyph sequence at the element's effective position (project layout override
// if present, otherwise the schema default).
//
// alpha.2 scope: rendering only. Drag-to-reposition + element selection land
// in alpha.3.

import { useEffect, useRef, useState } from "preact/hooks";
import { useComputed } from "@preact/signals";
import { project } from "@/state/store";
import { compose } from "@/compositor/compose";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import { FONT_SIZE, GLYPH_SIZE, codeToOrigin } from "@/compositor/constants";
import { OSD_ELEMENTS, OSD_GRID, type OsdElement } from "@/osd-schema/elements";
import type { ProjectDoc } from "@/state/project";

const OSD_W_PX = OSD_GRID.cols * GLYPH_SIZE.w; // 1272
const OSD_H_PX = OSD_GRID.rows * GLYPH_SIZE.h; // 720

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
 * Resolve an element's actual position in the current project. Project
 * layout overrides win; otherwise we fall back to the schema defaults so a
 * fresh project shows a sensible OSD layout with no setup.
 */
function effectivePosition(element: OsdElement, doc: ProjectDoc): EffectivePosition {
  const override = doc.osdLayout.elements[element.id];
  if (override) return override;
  return {
    x: element.defaultPos.x,
    y: element.defaultPos.y,
    enabled: element.defaultEnabled,
  };
}

export function OsdCanvas() {
  const { assets, loading, error } = useResolvedAssets();
  const atlas = useComputed(() => compose(project.value, assets.value));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bg, setBg] = useState<BgKey>("chroma");
  const [fitWidth, setFitWidth] = useState<boolean>(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = OSD_W_PX;
    canvas.height = OSD_H_PX;

    // Background fill
    ctx.fillStyle = BG_OPTIONS[bg].rgb;
    ctx.fillRect(0, 0, OSD_W_PX, OSD_H_PX);

    // Turn the composed RGB atlas into an ImageData we can sample from.
    const rgba = rgbToRgba(atlas.value);
    const copy = new Uint8ClampedArray(new ArrayBuffer(rgba.byteLength));
    copy.set(rgba);
    const atlasImg = new ImageData(copy, FONT_SIZE.w, FONT_SIZE.h);

    // Offscreen atlas canvas for fast drawImage-based blitting.
    const off = document.createElement("canvas");
    off.width = FONT_SIZE.w;
    off.height = FONT_SIZE.h;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.putImageData(atlasImg, 0, 0);

    // Treat chroma-gray pixels as transparent so the OSD bg shows through.
    // We do this with a second offscreen pass where we clear chroma-gray via
    // globalCompositeOperation; simpler approach: use ImageData walk.
    const clearGray = offCtx.getImageData(0, 0, FONT_SIZE.w, FONT_SIZE.h);
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

    // Blit every enabled element's sample glyphs.
    for (const element of OSD_ELEMENTS) {
      const pos = effectivePosition(element, project.value);
      if (!pos.enabled) continue;
      for (let i = 0; i < element.sample.length; i++) {
        const code = element.sample[i]!;
        const col = pos.x + i;
        if (col >= OSD_GRID.cols) break;
        const { x: sx, y: sy } = codeToOrigin(code);
        const dx = col * GLYPH_SIZE.w;
        const dy = pos.y * GLYPH_SIZE.h;
        ctx.drawImage(off, sx, sy, GLYPH_SIZE.w, GLYPH_SIZE.h, dx, dy, GLYPH_SIZE.w, GLYPH_SIZE.h);
      }
    }
  }, [atlas.value, bg]);

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
          style={{
            width: "100%",
            height: "100%",
            imageRendering: "pixelated",
            display: "block",
          }}
        />
      </div>
      <p class="text-[10px] font-mono text-slate-500">
        {OSD_ELEMENTS.filter((e) => effectivePosition(e, project.value).enabled).length} of{" "}
        {OSD_ELEMENTS.length} elements enabled · 53×20 grid ({OSD_W_PX}×{OSD_H_PX} native)
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
