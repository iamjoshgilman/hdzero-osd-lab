// Inline edit form for a bitmap layer. Unlike TTF, bitmap layers have almost
// no config — the main "edit" action is swapping the underlying BMP (to load
// a different base font) or changing which subset it targets.
//
// Creation is handled by the existing drop zone + sample picker in
// LayersPanel; this form is edit-only.

import { useState } from "preact/hooks";
import { mutate } from "@/state/store";
import { putAsset } from "@/state/assets";
import { addSampleFontAsBaseLayer } from "@/state/bootstrap";
import { FileDrop } from "@/ui/shared/FileDrop";
import { Button } from "@/ui/shared/Button";
import type { BitmapLayer } from "@/state/project";
import type { SubsetName } from "@/compositor/constants";

// Same curated list the LayersPanel uses. Keeping a local copy to avoid the
// two components importing each other. If this gets out of sync we'll pull
// into a shared module.
interface SampleEntry {
  file: string;
  label: string;
}
const SAMPLES: readonly SampleEntry[] = [
  { file: "BTFL_SNEAKY_FPV_Default_V1.0.0.bmp", label: "Sneaky FPV — Default" },
  { file: "BTFL_Ligen_Rainbow_V1.0.1.bmp", label: "Ligen — Rainbow" },
  { file: "BTFL_johhngoblin_teamBBL_v1.0.0.bmp", label: "johhngoblin — Team BBL" },
  {
    file: "BTFL_ondrascz_minimal_uppercase_color_bf-plain_V1.0.0.bmp",
    label: "ondrascz — Minimal Upper Color",
  },
  { file: "ondrascz-color.bmp", label: "ondrascz — Color (MIT)" },
];

const SUBSET_CHOICES: Array<{ value: SubsetName; label: string }> = [
  { value: "ALL", label: "All glyphs (0..511) — typical base font" },
  { value: "BTFL_CHARACTERS", label: "Characters (letters + numbers + specials)" },
  { value: "BTFL_LETTERS", label: "Letters A–Z only" },
  { value: "BTFL_NUMBERS", label: "Numbers 0–9 only" },
  { value: "BTFL_SPECIALS", label: "Punctuation / specials only" },
  { value: "BTFL_LOGO", label: "BTFL logo tiles (160..255)" },
  { value: "BTFL_MINILOGO", label: "Mini-logo tiles (91..95)" },
];

interface Props {
  onClose: () => void;
  editing: BitmapLayer;
}

export function BitmapLayerForm({ onClose, editing }: Props) {
  const [subset, setSubset] = useState<SubsetName>(editing.subset);
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingNewSource, setPendingNewSource] = useState<
    BitmapLayer["source"] | null
  >(null);

  const currentName =
    editing.source.kind === "user" ? editing.source.name : editing.source.id;

  const replaceWithFile = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const hash = await putAsset(buf, {
        name: file.name,
        mime: file.type || "image/bmp",
      });
      setPendingNewSource({
        kind: "user",
        hash,
        name: file.name,
        mime: file.type || "image/bmp",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const replaceWithSample = async (sample: SampleEntry) => {
    setErr(null);
    setBusy(true);
    try {
      // Reuse the bootstrap helper's fetch+hash flow, but intercept before it
      // pushes a new layer. Easiest path: replicate the tiny fetch+putAsset
      // here. If this sprouts more logic, extract a shared fetchSampleAsRef.
      const res = await fetch(
        `${import.meta.env.BASE_URL}sample-fonts/${sample.file}`,
      );
      if (!res.ok) throw new Error(`sample fetch failed (HTTP ${res.status})`);
      const buf = await res.arrayBuffer();
      const hash = await putAsset(buf, {
        name: sample.label,
        mime: "image/bmp",
      });
      setPendingNewSource({
        kind: "user",
        hash,
        name: sample.label,
        mime: "image/bmp",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
    // addSampleFontAsBaseLayer unused in this file — kept imported for possible future inline-add flow.
    void addSampleFontAsBaseLayer;
  };

  const save = () => {
    mutate((doc) => {
      const idx = doc.font.layers.findIndex((l) => l.id === editing.id);
      if (idx < 0) return;
      const layer = doc.font.layers[idx]!;
      if (layer.kind !== "bitmap") return;
      layer.subset = subset;
      if (pendingNewSource) layer.source = pendingNewSource;
    });
    onClose();
  };

  const hasChanges = pendingNewSource !== null || subset !== editing.subset;

  return (
    <div class="bg-slate-800/80 border border-slate-700 rounded p-3 flex flex-col gap-3 font-mono text-xs">
      <header class="flex items-center justify-between">
        <h3 class="text-osd-cyan text-[11px] font-semibold">Edit bitmap layer</h3>
        <button class="text-slate-500 hover:text-slate-300 text-[10px]" onClick={onClose}>
          close
        </button>
      </header>

      <div class="flex flex-col gap-1">
        <span class="text-[10px] text-slate-500">Current source</span>
        <div class="flex items-center gap-2 bg-slate-900 rounded p-2">
          <span class="flex-1 truncate text-[11px] text-slate-200">
            {pendingNewSource
              ? pendingNewSource.kind === "user"
                ? pendingNewSource.name
                : pendingNewSource.id
              : currentName}
          </span>
          {pendingNewSource && (
            <button
              class="text-slate-500 hover:text-slate-300 text-[10px]"
              onClick={() => setPendingNewSource(null)}
            >
              undo
            </button>
          )}
        </div>
      </div>

      <FileDrop
        accept=".bmp,image/bmp"
        label={busy ? "Storing…" : "Drop a new BMP to replace"}
        onFile={replaceWithFile}
      />

      <label class="flex flex-col gap-1 text-slate-400">
        <span>or pick a sample:</span>
        <select
          onChange={(e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            if (!v) return;
            const sample = SAMPLES.find((s) => s.file === v);
            if (sample) void replaceWithSample(sample);
            (e.target as HTMLSelectElement).value = "";
          }}
          class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
          defaultValue=""
        >
          <option value="">Pick a font…</option>
          {SAMPLES.map((s) => (
            <option key={s.file} value={s.file}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label class="flex flex-col gap-1 text-slate-400">
        <span>Target subset</span>
        <select
          value={subset}
          onChange={(e: Event) =>
            setSubset((e.target as HTMLSelectElement).value as SubsetName)
          }
          class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
        >
          {SUBSET_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {err && <p class="text-osd-alert text-[10px]">{err}</p>}

      <div class="flex gap-2">
        <Button
          variant="primary"
          onClick={save}
          disabled={!hasChanges || busy}
          class="flex-1 !text-xs"
        >
          Save changes
        </Button>
        <Button variant="secondary" onClick={onClose} class="!text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}
