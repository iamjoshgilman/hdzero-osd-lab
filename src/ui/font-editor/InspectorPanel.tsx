// Right-side inspector panel for the Font editor. Shows everything we know
// about the currently-selected glyph:
//   - its code, matching ASCII char, best-fit category, containing subsets
//   - a close-up preview of the composed tile (4× zoom, nearest-neighbor)
//   - a safety note: whether firmware draws this slot or it's decorative
//
// All state comes from shared signals; no props needed.

import { useComputed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { project } from "@/state/store";
import { selectedGlyph } from "@/state/ui-state";
import { compose } from "@/compositor/compose";
import { extractTile } from "@/compositor/atlas";
import { GLYPH_SIZE } from "@/compositor/constants";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import {
  getGlyphMetadata,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type GlyphMetadata,
} from "./glyph-metadata";

const TILE_ZOOM = 4;
const TILE_VIEW_W = GLYPH_SIZE.w * TILE_ZOOM; // 96
const TILE_VIEW_H = GLYPH_SIZE.h * TILE_ZOOM; // 144

export function InspectorPanel() {
  const { assets } = useResolvedAssets();
  const atlas = useComputed(() => compose(project.value, assets.value));
  const code = useComputed(() => selectedGlyph.value);

  return (
    <aside class="w-[260px] shrink-0 border-l border-slate-800 bg-slate-900 p-4 flex flex-col gap-4 overflow-y-auto font-mono text-xs">
      <h2 class="text-xs uppercase tracking-wider text-slate-400">Glyph inspector</h2>
      {code.value === null ? <EmptyState /> : <GlyphDetails code={code.value} atlas={atlas.value} />}
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

function GlyphDetails({ code, atlas }: { code: number; atlas: Uint8ClampedArray }) {
  const meta = getGlyphMetadata(code);
  const color = CATEGORY_COLORS[meta.category];

  return (
    <div class="flex flex-col gap-4">
      <div>
        <div class="text-2xl font-bold" style={{ color }}>
          #{code}
        </div>
        <div class="text-slate-400">{CATEGORY_LABELS[meta.category]}</div>
      </div>

      <div class="flex gap-3 items-start">
        <TilePreview atlas={atlas} code={code} />
        {meta.asciiChar !== null && <AsciiPreview char={meta.asciiChar} />}
      </div>

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

      <SafetyNote meta={meta} />
    </div>
  );
}

function TilePreview({ atlas, code }: { atlas: Uint8ClampedArray; code: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Draw at native 24×36 then CSS-scale via imageRendering: pixelated for a
    // crisp nearest-neighbor zoom. Keeps the canvas cheap.
    canvas.width = GLYPH_SIZE.w;
    canvas.height = GLYPH_SIZE.h;
    const tile = extractTile(atlas, code);
    const rgba = new Uint8ClampedArray(GLYPH_SIZE.w * GLYPH_SIZE.h * 4);
    for (let i = 0, j = 0; i < tile.length; i += 3, j += 4) {
      rgba[j] = tile[i]!;
      rgba[j + 1] = tile[i + 1]!;
      rgba[j + 2] = tile[i + 2]!;
      rgba[j + 3] = 255;
    }
    ctx.putImageData(new ImageData(rgba, GLYPH_SIZE.w, GLYPH_SIZE.h), 0, 0);
  }, [atlas, code]);

  return (
    <div
      class="border border-slate-700 bg-slate-800"
      style={{ width: `${TILE_VIEW_W}px`, height: `${TILE_VIEW_H}px` }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: `${TILE_VIEW_W}px`,
          height: `${TILE_VIEW_H}px`,
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
