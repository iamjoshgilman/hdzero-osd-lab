// Decoration tab — home for all the non-functional personalization: BTFL
// banner and mini-logo uploads. Works in both HD and analog modes; the
// only differences are pixel dimensions (analog slots are half HD's) and
// on-goggle trigger mechanics (HD has a firmware SYM_LOGO element for the
// banner; analog doesn't, so pilots trigger via Craft Name / Warnings).

import { useComputed } from "@preact/signals";
import { project, mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import type { LogoLayer, OsdMode } from "@/state/project";

interface LogoSlotSpec {
  slot: LogoLayer["slot"];
  label: string;
  /** Pixel dims per mode — analog is exactly half HD since glyphs are 12×18 vs 24×36. */
  dims: Record<OsdMode, { w: number; h: number }>;
  renderedAt: Record<OsdMode, string>;
  purpose: string;
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

function LogoSlotCard({ spec, mode }: { spec: LogoSlotSpec; mode: OsdMode }) {
  const layer = useComputed(() => findLogoLayerForSlot(spec.slot));
  const dims = spec.dims[mode];
  const renderedAt = spec.renderedAt[mode];

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
        <div class="flex items-center gap-2 bg-slate-800 rounded p-2">
          <span class="flex-1 truncate text-[11px] font-mono text-slate-200">
            {layer.value.source.kind === "user"
              ? layer.value.source.name
              : layer.value.source.id}
          </span>
          <div class="flex gap-2">
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
      ) : (
        <FileDrop
          accept="image/*"
          label={`Drop a ${dims.w}×${dims.h} image`}
          onFile={(f) => uploadOrReplaceLogo(spec.slot, f)}
        />
      )}
    </section>
  );
}
