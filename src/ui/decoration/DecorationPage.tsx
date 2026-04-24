// Decoration tab — home for all the non-functional personalization: BTFL
// banner and mini-logo uploads. Works in both HD and analog modes; the
// only differences are pixel dimensions (analog slots are half HD's) and
// on-goggle trigger mechanics (HD has a firmware SYM_LOGO element for the
// banner; analog doesn't, so pilots trigger via Craft Name / Warnings).

import { useComputed } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  project,
  mutate,
  mutateLive,
  beginEditSession,
  commitEditSession,
  rollbackEditSession,
} from "@/state/store";
import { putAsset } from "@/state/assets";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import { PixelEditor } from "@/ui/pixel-editor/PixelEditor";
import { rgbToPngBlob } from "@/ui/pixel-editor/pixel-ops";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import { ANALOG_GLYPH_SIZE, GLYPH_SIZE } from "@/compositor/constants";
import type { LogoLayer, OsdMode, ProjectDoc } from "@/state/project";

interface LogoSlotSpec {
  slot: LogoLayer["slot"];
  label: string;
  /** Pixel dims per mode — analog is exactly half HD since glyphs are 12×18 vs 24×36. */
  dims: Record<OsdMode, { w: number; h: number }>;
  renderedAt: Record<OsdMode, string>;
  purpose: string;
  /**
   * Both slots are now drawable. Historically BTFL (576×144 / 288×72) was
   * gated off because editing that many pixels in-browser was awkward
   * without zoom + pan; those landed in v0.3.5-v0.3.8, so banner editing
   * is viable — zoom the editor up, scroll around, paint. Kept as a field
   * (not a constant) so we can revisit if a future slot ships read-only.
   */
  drawable: boolean;
}

// INAV logo slot is supported by the compositor (LogoLayer kind="inav") and
// stays in the data model so existing INAV projects don't break. It's just
// hidden from the Decoration page UI since the vast majority of HDZero users
// fly Betaflight. If demand shows up, we can re-add a collapsed "advanced"
// section.
const LOGO_SLOTS: readonly LogoSlotSpec[] = [
  {
    slot: "btfl",
    label: "BTFL Logo (banner)",
    dims: {
      hd: { w: 576, h: 144 },
      analog: { w: 288, h: 72 },
    },
    renderedAt: {
      hd: "Auto-drawn by the Betaflight Logo OSD element (startup / disarmed splash)",
      analog:
        "Trigger by setting Craft Name / Warning text to ASCII chars matching codes 160..255 (no firmware auto-draw on analog)",
    },
    purpose:
      "The big BETAFLIGHT-style banner. 96 tiles wrapped into glyph codes 160..255. HD firmware auto-draws via SYM_LOGO; analog pilots trigger display manually via Craft Name / Warnings.",
    drawable: true,
  },
  {
    slot: "mini",
    label: "Mini Logo",
    dims: {
      hd: { w: 120, h: 36 },
      analog: { w: 60, h: 18 },
    },
    renderedAt: {
      hd: "Anywhere via Craft Name `[\\]^_`",
      analog: "Anywhere via Craft Name `[\\]^_` (same Craft Name trick — works identically)",
    },
    purpose:
      "A 5-tile inline logo (glyph codes 91..95). Render it in flight by setting your Betaflight Craft Name to the five characters `[\\]^_`. Works the same on HD and analog.",
    drawable: true,
  },
];

/** Find the existing logo layer for a given slot, if any. Latest wins if dupes. */
function findLogoLayerForSlot(slot: LogoLayer["slot"]): LogoLayer | undefined {
  const layers = project.value.font.layers;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    if (l.kind === "logo" && l.slot === slot) return l;
  }
  return undefined;
}

async function uploadOrReplaceLogo(
  slot: LogoLayer["slot"],
  file: File,
): Promise<void> {
  const buf = await file.arrayBuffer();
  const hash = await putAsset(buf, {
    name: file.name,
    mime: file.type || "image/png",
  });
  mutate((doc) => {
    // Remove any existing layer for this slot — only one logo per slot.
    doc.font.layers = doc.font.layers.filter(
      (l) => !(l.kind === "logo" && l.slot === slot),
    );
    const layer: LogoLayer = {
      id: `logo-${slot}-${Date.now()}`,
      kind: "logo",
      source: {
        kind: "user",
        hash,
        name: file.name,
        mime: file.type || "image/png",
      },
      slot,
      enabled: true,
    };
    doc.font.layers.push(layer);
  });
}

/**
 * Save a drawn logo image as an asset + replace the slot's layer. Same
 * destination as a file upload — goes through the compositor's existing
 * Z-wrap logic at compose time, so the user-facing canvas is "normal" and
 * the tile splitting stays invisible.
 */
async function saveDrawnLogo(
  slot: LogoLayer["slot"],
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
): Promise<void> {
  const blob = await rgbToPngBlob(pixels, w, h);
  const buf = await blob.arrayBuffer();
  const name = `drawn-${slot}-${Date.now()}.png`;
  const hash = await putAsset(buf, { name, mime: "image/png" });
  mutate((doc) => {
    doc.font.layers = doc.font.layers.filter(
      (l) => !(l.kind === "logo" && l.slot === slot),
    );
    const layer: LogoLayer = {
      id: `logo-${slot}-${Date.now()}`,
      kind: "logo",
      source: { kind: "user", hash, name, mime: "image/png" },
      slot,
      enabled: true,
    };
    doc.font.layers.push(layer);
  });
}

/** Blank chroma-gray RGB buffer at the given slot dimensions. */
function blankSlotPixels(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = 127;
    buf[i + 1] = 127;
    buf[i + 2] = 127;
  }
  return buf;
}

/** RGBA → RGB copy for seeding the editor from an existing scaled logo image. */
function rgbaToRgb(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = rgba[i]!;
    out[j + 1] = rgba[i + 1]!;
    out[j + 2] = rgba[i + 2]!;
  }
  return out;
}

function clearLogoSlot(slot: LogoLayer["slot"]): void {
  mutate((doc) => {
    doc.font.layers = doc.font.layers.filter(
      (l) => !(l.kind === "logo" && l.slot === slot),
    );
  });
}

export function DecorationPage() {
  const mode = project.value.meta.mode;
  return (
    <div class="max-w-4xl mx-auto w-full p-8 overflow-y-auto">
      <header class="mb-6">
        <h1 class="font-mono text-2xl font-bold mb-2">
          <span class="text-osd-magenta">Decoration</span>
        </h1>
        <p class="text-sm text-slate-400 leading-relaxed max-w-2xl">
          Upload the two logo images your font ships. The mini-logo renders anywhere you
          type <code class="text-osd-mint">[\]^_</code> — select the Craft Name in the OSD
          Preview tab and paste it into the text field to see it inline.
          {mode === "analog" && (
            <>
              {" "}
              <span class="text-osd-amber">Analog note:</span> the big banner
              has no firmware auto-draw on MAX7456, so you trigger it via Craft
              Name / Warning text set to the ASCII chars matching the banner
              slots. The mini-logo mechanic is identical to HD.
            </>
          )}
        </p>
      </header>

      <div class="flex flex-col gap-6">
        {LOGO_SLOTS.map((spec) => (
          <LogoSlotCard key={spec.slot} spec={spec} mode={mode} />
        ))}
      </div>
    </div>
  );
}

/**
 * Live preview of a resolved logo layer. Reads the post-aspect-fit + scaled
 * RGBA buffer from the resolver and paints it to a canvas at native tile
 * resolution, then CSS-upscales with `imageRendering: pixelated` so the
 * user can actually see the pixels at a readable size.
 *
 * Chroma-gray (127,127,127) areas render as transparent on the goggle, so
 * we translate them to alpha=0 in the preview and show a dark slate bg
 * through — matches the "transparent on goggle" mental model and makes the
 * logo silhouette pop against what would otherwise be a chunk of literal
 * gray inside the card.
 *
 * Target preview width is capped at ~480px; aspect is preserved.
 */
function LogoPreview({
  layerId,
  dims,
}: {
  layerId: string;
  dims: { w: number; h: number };
}) {
  const { assets } = useResolvedAssets();
  const rgba = useComputed(() => assets.value.logo.get(layerId) ?? null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const src = rgba.value;
    if (!src || src.width !== dims.w || src.height !== dims.h) {
      // Not resolved yet (or still in flight on a mode switch). Paint
      // transparent so the dark card bg shows and the preview appears
      // "loading" rather than showing stale pixels.
      ctx.clearRect(0, 0, dims.w, dims.h);
      return;
    }
    // Copy the RGBA, rewriting chroma-gray pixels to fully transparent so
    // the preview mimics the on-goggle transparent-key behavior.
    const copy = new Uint8ClampedArray(src.data.length);
    for (let i = 0; i < src.data.length; i += 4) {
      const r = src.data[i]!;
      const g = src.data[i + 1]!;
      const b = src.data[i + 2]!;
      if (r === 127 && g === 127 && b === 127) {
        copy[i] = 0;
        copy[i + 1] = 0;
        copy[i + 2] = 0;
        copy[i + 3] = 0;
      } else {
        copy[i] = r;
        copy[i + 1] = g;
        copy[i + 2] = b;
        copy[i + 3] = src.data[i + 3]!;
      }
    }
    ctx.putImageData(new ImageData(copy, dims.w, dims.h), 0, 0);
  }, [rgba.value, dims.w, dims.h]);

  // Fit to a ~480px preview width max; if the logo is tiny (mini analog
  // 60×18) we still zoom up to something readable.
  const MAX_PREVIEW_W = 480;
  const MIN_ZOOM = 2;
  const zoomFromWidth = MAX_PREVIEW_W / dims.w;
  const zoom = Math.max(MIN_ZOOM, Math.min(zoomFromWidth, 8));
  const viewW = Math.round(dims.w * zoom);
  const viewH = Math.round(dims.h * zoom);

  return (
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
        Preview
      </span>
      <div
        class="border border-slate-800 bg-slate-950 rounded p-2 overflow-auto"
        // overflow-auto so a BTFL banner at the widest CSS zoom still fits
        // into narrow viewports (the card has a max width in its section).
      >
        <canvas
          ref={canvasRef}
          style={{
            width: `${viewW}px`,
            height: `${viewH}px`,
            imageRendering: "pixelated",
            display: "block",
          }}
          aria-label="Logo preview"
        />
      </div>
      <p class="text-[10px] text-slate-500 leading-snug">
        Chroma-gray pixels show as transparent (dark bg) — that's what
        renders as "see-through" on the goggle.
      </p>
    </div>
  );
}

/** Slider bounds for logo scale. Wider range than glyph overrides because
 * logos more commonly ship with large baked-in margins (PNG templates from
 * design tools often pad 20–40% on each side).
 */
const LOGO_SCALE_MIN = 0.5;
const LOGO_SCALE_MAX = 3.0;
const LOGO_SCALE_STEP = 0.05;

function LogoSlotCard({ spec, mode }: { spec: LogoSlotSpec; mode: OsdMode }) {
  const layer = useComputed(() => findLogoLayerForSlot(spec.slot));
  const { assets } = useResolvedAssets();
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dims = spec.dims[mode];
  const renderedAt = spec.renderedAt[mode];

  // Per-mode tile boundary so the grid overlay marks glyph cells instead of
  // drawing a 576-line pixel mesh on the banner canvas.
  const tileBoundary = mode === "analog" ? ANALOG_GLYPH_SIZE : GLYPH_SIZE;

  // Live-edit session anchor — captured lazily on the first scale-slider
  // movement inside the editor. Rolled back on Cancel; on Save we also roll
  // back first when the user drew, so saveDrawnLogo's mutate() lands a clean
  // single undo step back to pre-open state.
  const sessionSnapshotRef = useRef<ProjectDoc | null>(null);

  const openEditor = () => {
    setSaveError(null);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    sessionSnapshotRef.current = null;
    setEditorOpen(false);
  };

  const handleScaleInput = (v: number) => {
    const current = layer.value;
    if (!current) return;
    if (!sessionSnapshotRef.current) {
      sessionSnapshotRef.current = beginEditSession();
    }
    const clamped = Math.max(LOGO_SCALE_MIN, Math.min(LOGO_SCALE_MAX, v));
    mutateLive((doc) => {
      const target = doc.font.layers.find((l) => l.id === current.id);
      if (!target || target.kind !== "logo") return;
      if (clamped === 1) delete target.scale;
      else target.scale = clamped;
    });
  };

  const handleScaleReset = () => {
    const current = layer.value;
    if (!current) return;
    if (!sessionSnapshotRef.current) {
      sessionSnapshotRef.current = beginEditSession();
    }
    mutateLive((doc) => {
      const target = doc.font.layers.find((l) => l.id === current.id);
      if (target && target.kind === "logo") delete target.scale;
    });
  };

  const handleSave = async (pixels: Uint8ClampedArray, meta: { modified: boolean }) => {
    setSaveError(null);
    try {
      if (meta.modified) {
        // User drew over the rasterized view. Roll back the live scale
        // session first so the pre-open state anchors the undo entry, then
        // replace the layer with a PNG of the drawn pixels (scale=1 on the
        // new layer since the drawing is already at slot size).
        if (sessionSnapshotRef.current) {
          rollbackEditSession(sessionSnapshotRef.current);
          sessionSnapshotRef.current = null;
        }
        await saveDrawnLogo(spec.slot, pixels, dims.w, dims.h);
      } else if (sessionSnapshotRef.current) {
        // Scale-only save — commit the live changes as a single undo entry.
        commitEditSession(sessionSnapshotRef.current);
        sessionSnapshotRef.current = null;
      }
      closeEditor();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancel = () => {
    if (sessionSnapshotRef.current) {
      rollbackEditSession(sessionSnapshotRef.current);
      sessionSnapshotRef.current = null;
    }
    closeEditor();
  };

  // Seed the editor from the currently-resolved scaled logo image if a layer
  // exists; otherwise blank chroma-gray. Re-evaluated on every render so a
  // scale-slider mutateLive re-rasterization flows in as a fresh
  // `initialPixels` buffer — the editor's reseed effect picks it up.
  const seedPixels = (): Uint8ClampedArray => {
    const current = layer.value;
    if (current) {
      const rgba = assets.value.logo.get(current.id);
      if (rgba && rgba.width === dims.w && rgba.height === dims.h) {
        return rgbaToRgb(rgba.data);
      }
    }
    return blankSlotPixels(dims.w, dims.h);
  };

  return (
    <section class="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <header class="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 class="font-mono text-lg text-osd-mint">{spec.label}</h2>
          <p class="text-[11px] text-slate-500 mt-0.5 font-mono">
            {dims.w}×{dims.h} · {renderedAt}
          </p>
        </div>
        <div class="text-right text-[10px] text-slate-500 font-mono">
          slot: <span class="text-slate-300">{spec.slot}</span>
        </div>
      </header>

      <p class="text-[11px] text-slate-400 leading-snug mb-3 max-w-2xl">{spec.purpose}</p>

      {saveError && (
        <p class="text-[11px] text-osd-alert leading-snug mb-3" role="alert">
          ⚠ {saveError}
        </p>
      )}

      <div class="bg-slate-950/60 border border-slate-800 rounded p-3 mb-3 text-[11px] font-mono">
        <div class="text-slate-500 uppercase tracking-wider text-[9px] mb-1">
          Source-image guidance
        </div>
        <ul class="text-slate-300 leading-snug list-disc list-inside">
          <li>
            Target size: <span class="text-osd-mint">{dims.w}×{dims.h}</span> (non-
            matching sizes are scaled to fit while preserving aspect; letterboxed with
            chroma-gray).
          </li>
          <li>
            Transparent PNG recommended so non-logo pixels stay see-through (chroma-gray
            127,127,127 = transparent on goggle).
          </li>
          <li>
            High contrast bold shapes read best; fine detail gets lost at this resolution.
          </li>
        </ul>
      </div>

      {layer.value ? (
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 bg-slate-800 rounded p-2">
            <span class="flex-1 truncate text-[11px] font-mono text-slate-200">
              {layer.value.source.kind === "user"
                ? layer.value.source.name
                : layer.value.source.id}
            </span>
            <div class="flex gap-2">
              <Button
                variant="secondary"
                onClick={openEditor}
                class="!px-3 !py-1 !text-[10px]"
                title="Open the editor — scale, paint, preview"
              >
                ✎ Edit
              </Button>
              <FileDrop
                accept="image/*"
                label="Replace"
                onFile={(f) => uploadOrReplaceLogo(spec.slot, f)}
                class="!p-2 !text-[10px]"
              />
              <Button
                variant="danger"
                onClick={() => clearLogoSlot(spec.slot)}
                class="!px-3 !py-1 !text-[10px]"
              >
                Clear
              </Button>
            </div>
          </div>
          <LogoPreview layerId={layer.value.id} dims={dims} />
        </div>
      ) : spec.drawable ? (
        <div class="flex flex-col gap-2">
          <FileDrop
            accept="image/*"
            label={`Drop a ${dims.w}×${dims.h} image`}
            onFile={(f) => uploadOrReplaceLogo(spec.slot, f)}
          />
          <div class="flex items-center gap-2 text-[10px] text-slate-500">
            <span class="flex-1 border-t border-slate-800" />
            <span class="font-mono">or</span>
            <span class="flex-1 border-t border-slate-800" />
          </div>
          <Button
            variant="secondary"
            onClick={openEditor}
            class="!text-[11px] !py-2"
            title="Draw this logo pixel-by-pixel in-browser"
          >
            ✎ Draw from scratch
          </Button>
        </div>
      ) : (
        <FileDrop
          accept="image/*"
          label={`Drop a ${dims.w}×${dims.h} image`}
          onFile={(f) => uploadOrReplaceLogo(spec.slot, f)}
        />
      )}

      {editorOpen && (
        // Only wire scaleControls when a layer exists (nothing to scale
        // otherwise). Under exactOptionalPropertyTypes we can't pass
        // `undefined` for an optional prop, so conditionally spread.
        <PixelEditor
          width={dims.w}
          height={dims.h}
          initialPixels={seedPixels()}
          mode={mode}
          title={`${spec.label} · ${dims.w}×${dims.h}`}
          tileBoundary={tileBoundary}
          // BTFL banner (drawable=false) opens in scale-and-preview mode.
          // Mini-logo (drawable=true) opens with full paint tools.
          toolsEnabled={spec.drawable}
          {...(layer.value
            ? {
                scaleControls: {
                  value: layer.value.scale ?? 1.0,
                  min: LOGO_SCALE_MIN,
                  max: LOGO_SCALE_MAX,
                  step: LOGO_SCALE_STEP,
                  onInput: handleScaleInput,
                  // Intra-drag release is a no-op — the whole modal lifetime
                  // is a single edit session, committed on Save or rolled
                  // back on Cancel. Coalescing per-drag would push multiple
                  // undo entries for one editor session.
                  onCommit: () => {},
                  onReset: handleScaleReset,
                },
              }
            : {})}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </section>
  );
}
