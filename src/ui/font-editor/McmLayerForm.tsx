// Inline form for adding a new MCM (analog OSD) layer OR editing an existing
// one. Analog .mcm files are MAX7456-era bitmap fonts — 256 glyphs at 12×18
// px, 2-bit pixel encoding. The parser upscales each glyph 2× (nearest
// neighbor) into a 24×36 HD tile, so porting an analog font into HD is
// pixel-perfect, not interpolated.
//
// Unlike TTF, MCM is fixed-size and 2-color — no size / outline-thickness /
// palette knobs, just the two ink colors the parser substitutes for white
// (glyph fill) and black (outline).

import { useState } from "preact/hooks";
import { useComputed } from "@preact/signals";
import { project, mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import type { HexColor, McmLayer } from "@/state/project";
import type { SubsetName } from "@/compositor/constants";

interface PendingMcm {
  hash: string;
  name: string;
  mime: string;
}

// Analog MCM has 256 glyphs at codes 0..255 — same printable-ASCII slots as
// HD. "ALL" copies every analog glyph verbatim into the HD atlas at matching
// codes (convert-the-whole-font use case). Subset choices let you layer just
// the letters / numbers / specials on top of an existing base.
const SUBSET_CHOICES: Array<{ value: SubsetName; label: string }> = [
  { value: "ALL", label: "All glyphs (0..255) — convert the whole font" },
  { value: "BTFL_CHARACTERS", label: "Characters (letters + numbers + specials)" },
  { value: "BTFL_LETTERS", label: "Letters A–Z only" },
  { value: "BTFL_LOWLETTERS", label: "Lowercase a–z → uppercase slots" },
  { value: "BTFL_NUMBERS", label: "Numbers 0–9 only" },
  { value: "BTFL_SPECIALS", label: "Punctuation / specials only" },
];

interface Props {
  onClose: () => void;
  /** If set, the form edits this existing layer instead of creating a new one. */
  editing?: McmLayer;
}

export function McmLayerForm({ onClose, editing }: Props) {
  const mode = useComputed(() => project.value.meta.mode);
  const [pending, setPending] = useState<PendingMcm | null>(
    editing
      ? {
          hash: editing.source.kind === "user" ? editing.source.hash : "",
          name: editing.source.kind === "user" ? editing.source.name : editing.source.id,
          mime: editing.source.kind === "user" ? editing.source.mime : "text/plain",
        }
      : null,
  );
  const [subset, setSubset] = useState<SubsetName>(editing?.subset ?? "ALL");
  const [glyphColor, setGlyphColor] = useState<string>(editing?.glyphColor ?? "#E0E0E0");
  const [outlineColor, setOutlineColor] = useState<string>(
    editing?.outlineColor ?? "#000000",
  );
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const hash = await putAsset(buf, {
        name: file.name,
        mime: file.type || "text/plain",
      });
      setPending({ hash, name: file.name, mime: file.type || "text/plain" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const normalizeHex = (raw: string): HexColor =>
    (raw.startsWith("#") ? raw : `#${raw}`) as HexColor;

  const saveLayer = () => {
    if (!pending) return;
    // Analog mode flattens to 2-bit at export — forcing white/black here so
    // the preview matches what the goggle will actually render. Color pickers
    // are hidden in that case, so the user can't pick anything else anyway.
    const finalGlyph = mode.value === "analog" ? "#ffffff" : normalizeHex(glyphColor);
    const finalOutline = mode.value === "analog" ? "#000000" : normalizeHex(outlineColor);
    const base: McmLayer = {
      id: editing?.id ?? `mcm-${Date.now()}`,
      kind: "mcm",
      source: {
        kind: "user",
        hash: pending.hash,
        name: pending.name,
        mime: pending.mime,
      },
      subset,
      glyphColor: finalGlyph as HexColor,
      outlineColor: finalOutline as HexColor,
      enabled: editing?.enabled ?? true,
    };
    mutate((doc) => {
      if (editing) {
        const idx = doc.font.layers.findIndex((l) => l.id === editing.id);
        if (idx >= 0) doc.font.layers[idx] = base;
      } else {
        doc.font.layers.push(base);
      }
    });
    onClose();
  };

  return (
    <div class="bg-slate-800/80 border border-slate-700 rounded p-3 flex flex-col gap-3 font-mono text-xs">
      <header class="flex items-center justify-between">
        <h3 class="text-osd-cyan text-[11px] font-semibold">
          {editing ? "Edit MCM layer" : "Add MCM (analog) layer"}
        </h3>
        <button class="text-slate-500 hover:text-slate-300 text-[10px]" onClick={onClose}>
          close
        </button>
      </header>

      <p class="text-[10px] text-slate-500 leading-snug">
        Analog fonts (MAX7456 era) are 12×18 at 2-bit. Each glyph upscales
        cleanly 2× into the 24×36 HD tile — no interpolation, pixel-perfect.
      </p>

      {!pending ? (
        <FileDrop
          accept=".mcm,text/plain"
          label={busy ? "Storing…" : "Drop a .mcm file"}
          onFile={handleFile}
        />
      ) : (
        <div class="flex items-center gap-2 bg-slate-900 rounded p-2">
          <span class="flex-1 truncate text-[11px] text-slate-200">{pending.name}</span>
          <button
            class="text-slate-500 hover:text-slate-300 text-[10px]"
            onClick={() => setPending(null)}
          >
            {editing ? "replace file" : "change"}
          </button>
        </div>
      )}

      <label class="flex flex-col gap-1 text-slate-400">
        <span>Target subset</span>
        <select
          value={subset}
          onChange={(e: Event) => setSubset((e.target as HTMLSelectElement).value as SubsetName)}
          class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
        >
          {SUBSET_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {mode.value === "hd" ? (
        <>
          <label class="flex flex-col gap-1 text-slate-400">
            <span>Glyph color (replaces MCM white)</span>
            <input
              type="text"
              value={glyphColor}
              onInput={(e: Event) => setGlyphColor((e.target as HTMLInputElement).value)}
              placeholder="#E0E0E0"
              class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
            />
          </label>

          <label class="flex flex-col gap-1 text-slate-400">
            <span>Outline color (replaces MCM black)</span>
            <input
              type="text"
              value={outlineColor}
              onInput={(e: Event) => setOutlineColor((e.target as HTMLInputElement).value)}
              placeholder="#000000"
              class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
            />
          </label>
        </>
      ) : (
        <p class="text-[10px] text-slate-500 leading-snug border border-slate-800 rounded p-2">
          Analog OSD is 2-bit monochrome — glyph pixels are locked to white on
          black, no color. Upload a different .mcm if you want different art.
        </p>
      )}

      {err && <p class="text-osd-alert text-[10px]">{err}</p>}

      <div class="flex gap-2">
        <Button
          variant="primary"
          onClick={saveLayer}
          disabled={!pending}
          class="flex-1 !text-xs"
        >
          {editing ? "Save changes" : "Add layer"}
        </Button>
        <Button variant="secondary" onClick={onClose} class="!text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}
