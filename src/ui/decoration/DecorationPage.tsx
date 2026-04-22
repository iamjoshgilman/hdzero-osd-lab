// Decoration tab — home for all the non-functional personalization. Ships
// first with logo-slot uploaders (BTFL banner, mini-logo, INAV logo); the
// full Craft Name decoration generator lands with the v0.3.0 milestone.

import { useComputed } from "@preact/signals";
import { project, mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import type { LogoLayer } from "@/state/project";

interface LogoSlotSpec {
  slot: LogoLayer["slot"];
  label: string;
  dims: { w: number; h: number };
  renderedAt: string;
  purpose: string;
}

const LOGO_SLOTS: readonly LogoSlotSpec[] = [
  {
    slot: "btfl",
    label: "BTFL Logo (banner)",
    dims: { w: 576, h: 144 },
    renderedAt: "Startup / disarmed splash",
    purpose:
      "The big BETAFLIGHT-style banner. 96 tiles wrapped into glyph codes 160..255. Shown when the Betaflight Configurator 'Logo' OSD element is enabled, typically at the top-center while disarmed.",
  },
  {
    slot: "mini",
    label: "Mini Logo",
    dims: { w: 120, h: 36 },
    renderedAt: "Anywhere via Craft Name `[\\]^_`",
    purpose:
      "A 5-tile inline logo (glyph codes 91..95). Render it in flight by setting your Betaflight Craft Name to the five characters `[\\]^_`.",
  },
  {
    slot: "inav",
    label: "INAV Logo",
    dims: { w: 240, h: 144 },
    renderedAt: "INAV firmware only",
    purpose:
      "Same concept as the BTFL banner but for INAV flight controllers. Uses glyph codes 257..296. Ignored by Betaflight firmware.",
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
  return (
    <div class="max-w-4xl mx-auto w-full p-8 overflow-y-auto">
      <header class="mb-6">
        <h1 class="font-mono text-2xl font-bold mb-2">
          <span class="text-osd-magenta">Decoration</span>
        </h1>
        <p class="text-sm text-slate-400 leading-relaxed max-w-2xl">
          Logo slots and personal-branding extras that aren't bound to a specific OSD element.
          Currently: three logo slots. Full Craft Name designer lands with v0.3.0.
        </p>
      </header>

      <div class="flex flex-col gap-6">
        {LOGO_SLOTS.map((spec) => (
          <LogoSlotCard key={spec.slot} spec={spec} />
        ))}

        <section class="border border-dashed border-slate-700 rounded-lg p-6">
          <h2 class="font-mono text-lg text-osd-amber mb-2">Craft Name Designer</h2>
          <p class="text-sm text-slate-400 leading-snug max-w-xl">
            Coming in <span class="text-osd-amber">v0.3.0</span>. A 15-tile-wide visual
            editor for the Betaflight Craft Name field. Pick glyphs by clicking them in the
            font atlas, drag them into slots, and get the exact 15-character ASCII payload
            to paste into Betaflight Configurator's Craft Name box. Turns the <code class="text-osd-mint">[\\]^_</code>
            {" "}mini-logo trick into a point-and-click flow that scales to any glyph
            arrangement.
          </p>
        </section>
      </div>
    </div>
  );
}

function LogoSlotCard({ spec }: { spec: LogoSlotSpec }) {
  const layer = useComputed(() => findLogoLayerForSlot(spec.slot));

  return (
    <section class="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <header class="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 class="font-mono text-lg text-osd-mint">{spec.label}</h2>
          <p class="text-[11px] text-slate-500 mt-0.5 font-mono">
            {spec.dims.w}×{spec.dims.h} · {spec.renderedAt}
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
            Target size: <span class="text-osd-mint">{spec.dims.w}×{spec.dims.h}</span> (non-
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
          label={`Drop a ${spec.dims.w}×${spec.dims.h} image`}
          onFile={(f) => uploadOrReplaceLogo(spec.slot, f)}
        />
      )}
    </section>
  );
}
