// Inline form for adding a TTF layer to the current project. Mirrors the
// Python fork's CLI args (size / outline thickness / vertical stretch /
// colors) with a first-class comma-separated palette input so the headline
// "random color per glyph" feature is discoverable.

import { useState } from "preact/hooks";
import { mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import type { HexColor, TtfLayer } from "@/state/project";
import type { SubsetName } from "@/compositor/constants";

interface PendingTtf {
  hash: string;
  name: string;
  mime: string;
}

const SUBSET_CHOICES: Array<{ value: SubsetName; label: string }> = [
  { value: "BTFL_LETTERS", label: "Letters A–Z" },
  { value: "BTFL_LOWLETTERS", label: "Lowercase a–z → uppercase slots" },
  { value: "BTFL_NUMBERS", label: "Numbers 0–9" },
  { value: "BTFL_SPECIALS", label: "Punctuation / specials" },
  { value: "BTFL_CHARACTERS", label: "All characters (letters+numbers+specials)" },
];

const WHITERQBBIT_PALETTE = "#00FFAA,#00FFFF,#FF00FF,#FFB000";

interface Props {
  onClose: () => void;
}

export function TtfLayerForm({ onClose }: Props) {
  const [pending, setPending] = useState<PendingTtf | null>(null);
  const [subset, setSubset] = useState<SubsetName>("BTFL_LETTERS");
  const [size, setSize] = useState<number>(22);
  const [outline, setOutline] = useState<number>(1.0);
  const [vStretch, setVStretch] = useState<number>(1.0);
  const [glyphColor, setGlyphColor] = useState<string>("#E0E0E0");
  const [outlineColor, setOutlineColor] = useState<string>("#000000");
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const hash = await putAsset(buf, {
        name: file.name,
        mime: file.type || "font/ttf",
      });
      setPending({ hash, name: file.name, mime: file.type || "font/ttf" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const parseColor = (raw: string): HexColor | HexColor[] => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const asHex = parts.map((p) => (p.startsWith("#") ? p : `#${p}`) as HexColor);
    return asHex.length === 1 ? asHex[0]! : asHex;
  };

  const addLayer = () => {
    if (!pending) return;
    const layer: TtfLayer = {
      id: `ttf-${Date.now()}`,
      kind: "ttf",
      source: {
        kind: "user",
        hash: pending.hash,
        name: pending.name,
        mime: pending.mime,
      },
      subset,
      size,
      outlineThickness: outline,
      vStretch,
      glyphOffset: { x: 0, y: 0 },
      outlineOffset: { x: 0, y: 0 },
      glyphColor: parseColor(glyphColor),
      outlineColor: parseColor(outlineColor),
      superSampling: 8,
      enabled: true,
    };
    mutate((doc) => {
      doc.font.layers.push(layer);
    });
    onClose();
  };

  return (
    <div class="bg-slate-800/80 border border-slate-700 rounded p-3 flex flex-col gap-3 font-mono text-xs">
      <header class="flex items-center justify-between">
        <h3 class="text-osd-cyan text-[11px] font-semibold">Add TTF layer</h3>
        <button class="text-slate-500 hover:text-slate-300 text-[10px]" onClick={onClose}>
          close
        </button>
      </header>

      {!pending ? (
        <FileDrop
          accept=".ttf,.otf,font/*"
          label={busy ? "Storing…" : "Drop a .ttf / .otf"}
          onFile={handleFile}
        />
      ) : (
        <div class="flex items-center gap-2 bg-slate-900 rounded p-2">
          <span class="flex-1 truncate text-[11px] text-slate-200">{pending.name}</span>
          <button
            class="text-slate-500 hover:text-slate-300 text-[10px]"
            onClick={() => setPending(null)}
          >
            change
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

      <div class="grid grid-cols-3 gap-2">
        <NumberField label="Size" value={size} step={1} min={10} max={40} onChange={setSize} />
        <NumberField
          label="Outline"
          value={outline}
          step={0.1}
          min={0}
          max={3}
          onChange={setOutline}
        />
        <NumberField
          label="V-Stretch"
          value={vStretch}
          step={0.05}
          min={0.8}
          max={2}
          onChange={setVStretch}
        />
      </div>

      <label class="flex flex-col gap-1 text-slate-400">
        <span>Glyph color (single hex or comma-separated palette)</span>
        <input
          type="text"
          value={glyphColor}
          onInput={(e: Event) => setGlyphColor((e.target as HTMLInputElement).value)}
          placeholder="#E0E0E0  or  #00FFAA,#00FFFF,#FF00FF,#FFB000"
          class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
        <button
          type="button"
          class="text-left text-[10px] text-osd-mint hover:underline w-fit"
          onClick={() => setGlyphColor(WHITERQBBIT_PALETTE)}
        >
          ▸ Use WhiteRqbbit palette ({WHITERQBBIT_PALETTE.split(",").length} colors, random per glyph)
        </button>
      </label>

      <label class="flex flex-col gap-1 text-slate-400">
        <span>Outline color</span>
        <input
          type="text"
          value={outlineColor}
          onInput={(e: Event) => setOutlineColor((e.target as HTMLInputElement).value)}
          placeholder="#000000"
          class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
      </label>

      {err && <p class="text-osd-alert text-[10px]">{err}</p>}

      <div class="flex gap-2">
        <Button
          variant="primary"
          onClick={addLayer}
          disabled={!pending}
          class="flex-1 !text-xs"
        >
          Add layer
        </Button>
        <Button variant="secondary" onClick={onClose} class="!text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label class="flex flex-col gap-1 text-slate-400">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onInput={(e: Event) => {
          const n = parseFloat((e.target as HTMLInputElement).value);
          if (Number.isFinite(n)) onChange(n);
        }}
        class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 w-full"
      />
    </label>
  );
}
