// Inline form for adding a new TTF layer OR editing an existing one. Mirrors
// the Python fork's CLI args (size / outline thickness / vertical stretch /
// colors) with a first-class comma-separated palette input so the headline
// "random color per glyph" feature is discoverable.

import { useEffect, useRef, useState } from "preact/hooks";
import { useComputed } from "@preact/signals";
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
import { newPaletteSeed } from "@/state/project";
import type { HexColor, ProjectDoc, TtfLayer } from "@/state/project";
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

/** Soft cap on palette size. Beyond ~8 colors, per-glyph picks become hard to reason about visually. */
const MAX_PALETTE = 8;

/** Strictly validate that a string is a `#rrggbb` or `#rgb` hex literal. Tolerant of case. */
function isValidHex(s: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());
}

/** Pad a `#rgb` shorthand to `#rrggbb`. The native color picker only emits the long form. */
function normalizeHex(s: string): HexColor {
  const t = s.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` as HexColor;
  }
  return t as HexColor;
}

interface Props {
  onClose: () => void;
  /** If set, the form is editing this existing layer instead of creating a new one. */
  editing?: TtfLayer;
}

/** Convert a single hex or palette back to the text-input form the user typed. */
function colorToInput(c: HexColor | HexColor[]): string {
  return Array.isArray(c) ? c.join(",") : c;
}

/**
 * Parse a comma-separated hex string into the TtfLayer color shape:
 *   "#fff"              → "#ffffff"
 *   "#aaa,#bbb,#ccc"    → ["#aaaaaa","#bbbbbb","#cccccc"]
 * Tolerates missing leading '#'. Invalid entries are dropped. If parsing
 * yields nothing, falls back to the provided default so the layer always has
 * at least one color set.
 */
function parseColorInput(raw: string, fallback: HexColor): HexColor | HexColor[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("#") ? p : `#${p}`))
    .filter(isValidHex)
    .map(normalizeHex);
  if (parts.length === 0) return fallback;
  return parts.length === 1 ? parts[0]! : parts;
}

/** Split a stored color into the swatch array the editor works on. */
function colorToSwatches(c: HexColor | HexColor[]): HexColor[] {
  return Array.isArray(c) ? [...c] : [c];
}

export function TtfLayerForm({ onClose, editing }: Props) {
  const mode = useComputed(() => project.value.meta.mode);
  const [pending, setPending] = useState<PendingTtf | null>(
    editing
      ? {
          hash: editing.source.kind === "user" ? editing.source.hash : "",
          name: editing.source.kind === "user" ? editing.source.name : editing.source.id,
          mime: editing.source.kind === "user" ? editing.source.mime : "font/ttf",
        }
      : null,
  );
  const [subset, setSubset] = useState<SubsetName>(editing?.subset ?? "BTFL_LETTERS");
  const [size, setSize] = useState<number>(editing?.size ?? 22);
  const [outline, setOutline] = useState<number>(editing?.outlineThickness ?? 1.0);
  const [vStretch, setVStretch] = useState<number>(editing?.vStretch ?? 1.0);
  // Two canonical representations of each color:
  //   - swatches[]: what the visual swatch editor binds to. Always a list.
  //   - rawInput:  what the raw-hex text field shows. Always a comma-separated string.
  // Editing one resyncs the other so the user can hop between modes. Raw
  // input ONLY overwrites swatches on blur (or Save), so typing a partial
  // hex ("#abc") doesn't wipe the other swatches mid-keystroke.
  const [glyphSwatches, setGlyphSwatches] = useState<HexColor[]>(
    editing ? colorToSwatches(editing.glyphColor) : ["#E0E0E0"],
  );
  const [glyphRaw, setGlyphRaw] = useState<string>(
    editing ? colorToInput(editing.glyphColor) : "#E0E0E0",
  );
  const [outlineSwatches, setOutlineSwatches] = useState<HexColor[]>(
    editing ? colorToSwatches(editing.outlineColor) : ["#000000"],
  );
  const [outlineRaw, setOutlineRaw] = useState<string>(
    editing ? colorToInput(editing.outlineColor) : "#000000",
  );
  const [paletteSeed, setPaletteSeed] = useState<number>(
    editing?.paletteSeed ?? newPaletteSeed(),
  );
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  // Live-edit session state. In editing mode, every field change writes
  // through to the project doc in real time (via mutateLive) so the preview
  // updates as you tweak. The snapshot taken on mount lets Save collapse the
  // whole session to one undo entry and Cancel roll everything back.
  //
  // Why a ref not state: the snapshot is a large object that should NOT
  // trigger re-renders when captured/cleared.
  const sessionSnapshotRef = useRef<ProjectDoc | null>(null);
  const editingId = editing?.id;

  useEffect(() => {
    if (!editingId) return;
    sessionSnapshotRef.current = beginEditSession();
    return () => {
      // Unmount without explicit Save/Cancel (e.g. user clicked another
      // layer's edit pencil). Treat as Save: live changes are already
      // visible, dropping them would feel like data loss. Commit a single
      // undo entry anchored on the pre-session snapshot.
      if (sessionSnapshotRef.current) {
        commitEditSession(sessionSnapshotRef.current);
        sessionSnapshotRef.current = null;
      }
    };
  }, [editingId]);

  /**
   * Apply a patch to the layer being edited as a live (non-undo) mutation.
   * No-op when creating a new layer — there's no layer in the doc yet, so
   * the new-layer flow still writes once on "Add layer".
   */
  const liveUpdateLayer = (patch: (layer: TtfLayer) => void) => {
    if (!editingId) return;
    mutateLive((doc) => {
      const l = doc.font.layers.find((x) => x.id === editingId);
      if (l && l.kind === "ttf") patch(l);
    });
  };

  /** Convert swatch array to the stored color shape (single value vs list). */
  const swatchesToColor = (s: HexColor[]): HexColor | HexColor[] =>
    s.length === 1 ? s[0]! : [...s];

  /** Swatch edit → also reflect in the raw text field AND live-write to the doc. */
  const updateGlyphSwatches = (next: HexColor[]) => {
    setGlyphSwatches(next);
    setGlyphRaw(next.join(","));
    liveUpdateLayer((l) => {
      l.glyphColor = swatchesToColor(next);
    });
  };
  const updateOutlineSwatches = (next: HexColor[]) => {
    setOutlineSwatches(next);
    setOutlineRaw(next.join(","));
    liveUpdateLayer((l) => {
      l.outlineColor = swatchesToColor(next);
    });
  };

  /** Raw-text commit (blur or Enter) → push back into swatches + live-write. */
  const commitGlyphRaw = () => {
    const parsed = parseColorInput(glyphRaw, "#E0E0E0");
    const next = Array.isArray(parsed) ? parsed : [parsed];
    setGlyphSwatches(next);
    setGlyphRaw(next.join(","));
    liveUpdateLayer((l) => {
      l.glyphColor = swatchesToColor(next);
    });
  };
  const commitOutlineRaw = () => {
    const parsed = parseColorInput(outlineRaw, "#000000");
    const next = Array.isArray(parsed) ? parsed : [parsed];
    setOutlineSwatches(next);
    setOutlineRaw(next.join(","));
    liveUpdateLayer((l) => {
      l.outlineColor = swatchesToColor(next);
    });
  };

  /** Live-write wrappers for simple fields. Kept inline so every control uses them. */
  const onSubsetChange = (v: SubsetName) => {
    setSubset(v);
    liveUpdateLayer((l) => {
      l.subset = v;
    });
  };
  const onSizeChange = (v: number) => {
    setSize(v);
    liveUpdateLayer((l) => {
      l.size = v;
    });
  };
  const onOutlineChange = (v: number) => {
    setOutline(v);
    liveUpdateLayer((l) => {
      l.outlineThickness = v;
    });
  };
  const onVStretchChange = (v: number) => {
    setVStretch(v);
    liveUpdateLayer((l) => {
      l.vStretch = v;
    });
  };
  const onReroll = () => {
    const s = newPaletteSeed();
    setPaletteSeed(s);
    liveUpdateLayer((l) => {
      l.paletteSeed = s;
    });
  };

  const usesPalette = glyphSwatches.length >= 2 || outlineSwatches.length >= 2;

  const handleFile = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const hash = await putAsset(buf, {
        name: file.name,
        mime: file.type || "font/ttf",
      });
      const next = { hash, name: file.name, mime: file.type || "font/ttf" };
      setPending(next);
      // Live-edit: swap the layer's source so the preview picks up the new
      // file immediately. New-layer flow skips this (no layer exists yet).
      liveUpdateLayer((l) => {
        l.source = { kind: "user", hash: next.hash, name: next.name, mime: next.mime };
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Explicit Save: commits the live-edit session OR pushes a new layer. */
  const saveLayer = () => {
    if (!pending) return;
    if (editing) {
      // Edit mode: live changes are already in the doc. Commit the session
      // so a single undo rewinds all of them as one step.
      if (sessionSnapshotRef.current) {
        commitEditSession(sessionSnapshotRef.current);
        sessionSnapshotRef.current = null;
      }
      onClose();
      return;
    }
    // New-layer mode: one atomic mutate that appends the configured layer.
    const glyphFinal: HexColor | HexColor[] =
      glyphSwatches.length === 1 ? glyphSwatches[0]! : [...glyphSwatches];
    const outlineFinal: HexColor | HexColor[] =
      outlineSwatches.length === 1 ? outlineSwatches[0]! : [...outlineSwatches];
    const base: TtfLayer = {
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
      glyphColor: glyphFinal,
      outlineColor: outlineFinal,
      superSampling: 8,
      paletteSeed,
      enabled: true,
    };
    mutate((doc) => {
      doc.font.layers.push(base);
    });
    onClose();
  };

  /** Cancel / close: rollback the live session if one is active. */
  const cancelEdit = () => {
    if (sessionSnapshotRef.current) {
      rollbackEditSession(sessionSnapshotRef.current);
      sessionSnapshotRef.current = null;
    }
    onClose();
  };

  return (
    <div class="bg-slate-800/80 border border-slate-700 rounded p-3 flex flex-col gap-3 font-mono text-xs">
      <header class="flex items-center justify-between">
        <h3 class="text-osd-cyan text-[11px] font-semibold">
          {editing ? "Edit TTF layer" : "Add TTF layer"}
        </h3>
        <button
          class="text-slate-500 hover:text-slate-300 text-[10px]"
          onClick={cancelEdit}
          title={editing ? "Close without keeping changes" : "Close"}
        >
          close
        </button>
      </header>

      {mode.value === "analog" && (
        <p class="text-[10px] text-slate-500 leading-snug border border-slate-800 rounded p-2">
          <span class="text-osd-amber">Analog note:</span> renders at native
          12×18. Most regular TTFs look chunky that small — try pixel fonts
          like <span class="text-osd-cyan">Press Start 2P</span>,{" "}
          <span class="text-osd-cyan">PixelOperator</span>, or{" "}
          <span class="text-osd-cyan">Minogram</span> for crisp results, and
          shrink the Size down toward 10–14.
        </p>
      )}

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
            {editing ? "replace file" : "change"}
          </button>
        </div>
      )}

      <label class="flex flex-col gap-1 text-slate-400">
        <span>Target subset</span>
        <select
          value={subset}
          onChange={(e: Event) =>
            onSubsetChange((e.target as HTMLSelectElement).value as SubsetName)
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

      <div class="grid grid-cols-3 gap-2">
        <NumberField label="Size" value={size} step={1} min={10} max={60} onChange={onSizeChange} />
        <NumberField
          label="Outline"
          value={outline}
          step={0.1}
          min={0}
          max={3}
          onChange={onOutlineChange}
        />
        <NumberField
          label="V-Stretch"
          value={vStretch}
          step={0.05}
          min={0.8}
          max={2}
          onChange={onVStretchChange}
        />
      </div>

      <div class="flex flex-col gap-1 text-slate-400">
        <div class="flex items-center justify-between">
          <span>
            Glyph color{" "}
            {glyphSwatches.length >= 2 && (
              <span class="text-[10px] text-slate-500">
                (palette — random per glyph)
              </span>
            )}
          </span>
          {glyphSwatches.length >= 2 && (
            <button
              type="button"
              aria-label="Reroll palette colors"
              title="Reroll — randomize which glyphs get which colors"
              class="text-osd-mint hover:text-emerald-300 text-base leading-none font-semibold px-1.5 py-0.5 rounded border border-osd-mint/40 hover:border-osd-mint flex items-center gap-1"
              onClick={onReroll}
            >
              <span aria-hidden="true">↻</span>
              <span class="text-[10px]">reroll</span>
            </button>
          )}
        </div>
        <SwatchEditor
          swatches={glyphSwatches}
          onChange={updateGlyphSwatches}
        />
        <button
          type="button"
          class="text-left text-[10px] text-osd-mint hover:underline w-fit"
          onClick={() => {
            const preset = WHITERQBBIT_PALETTE.split(",") as HexColor[];
            updateGlyphSwatches(preset);
          }}
        >
          ▸ Use WhiteRqbbit palette ({WHITERQBBIT_PALETTE.split(",").length} colors, random per glyph)
        </button>
        <details class="text-[10px] text-slate-500 mt-1">
          <summary class="cursor-pointer hover:text-slate-300 select-none">
            raw hex (comma-separated)
          </summary>
          <input
            type="text"
            value={glyphRaw}
            onInput={(e: Event) => setGlyphRaw((e.target as HTMLInputElement).value)}
            onBlur={commitGlyphRaw}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                commitGlyphRaw();
                e.preventDefault();
              }
            }}
            placeholder="#E0E0E0  or  #00FFAA,#00FFFF,#FF00FF,#FFB000"
            class="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px]"
          />
        </details>
      </div>

      <div class="flex flex-col gap-1 text-slate-400">
        <div class="flex items-center justify-between">
          <span>
            Outline color{" "}
            {outlineSwatches.length >= 2 && (
              <span class="text-[10px] text-slate-500">
                (palette — random per glyph)
              </span>
            )}
          </span>
        </div>
        <SwatchEditor
          swatches={outlineSwatches}
          onChange={updateOutlineSwatches}
        />
        <details class="text-[10px] text-slate-500 mt-1">
          <summary class="cursor-pointer hover:text-slate-300 select-none">
            raw hex (comma-separated)
          </summary>
          <input
            type="text"
            value={outlineRaw}
            onInput={(e: Event) => setOutlineRaw((e.target as HTMLInputElement).value)}
            onBlur={commitOutlineRaw}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                commitOutlineRaw();
                e.preventDefault();
              }
            }}
            placeholder="#000000"
            class="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px]"
          />
        </details>
      </div>

      {usesPalette && (
        <p class="text-[10px] text-slate-500 leading-snug">
          <span class="text-osd-amber">Tip:</span> palette picks are now pinned
          — tab switches and background changes won't reshuffle. Hit{" "}
          <span class="text-osd-mint">↻ reroll</span> to roll again.
        </p>
      )}

      {err && <p class="text-osd-alert text-[10px]">{err}</p>}

      <div class="flex gap-2">
        <Button
          variant="primary"
          onClick={saveLayer}
          disabled={!pending || busy}
          class="flex-1 !text-xs"
          title={
            editing
              ? "Keep all current changes and close."
              : "Create this layer."
          }
        >
          {busy ? "Storing…" : editing ? "Save changes" : "Add layer"}
        </Button>
        <Button
          variant="secondary"
          onClick={cancelEdit}
          class="!text-xs"
          title={
            editing
              ? "Discard changes since you opened this editor."
              : "Close without creating a layer."
          }
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Swatch-based color list editor. One swatch = solid color mode; two or more
 * = palette mode (glyphs pick one at random per render). Each swatch is a
 * clickable square that opens the browser's native color picker on click. An
 * × on hover removes the swatch (disabled when only one remains — a layer
 * always needs at least one color). Trailing `+` adds a new swatch, capped
 * at MAX_PALETTE to keep per-glyph picks visually distinguishable.
 */
function SwatchEditor({
  swatches,
  onChange,
}: {
  swatches: HexColor[];
  onChange: (next: HexColor[]) => void;
}) {
  const atCap = swatches.length >= MAX_PALETTE;
  return (
    <div class="flex flex-wrap items-center gap-1.5">
      {swatches.map((hex, i) => {
        const onSwatch = (next: HexColor) => {
          const copy = [...swatches];
          copy[i] = next;
          onChange(copy);
        };
        // Only pass onRemove when removal is allowed — under
        // exactOptionalPropertyTypes we can't pass `undefined` for an
        // optional prop, and we want SwatchCell to render the × badge only
        // when there's a handler to wire it to.
        const cellProps =
          swatches.length > 1
            ? {
                hex,
                onChange: onSwatch,
                onRemove: () => onChange(swatches.filter((_, j) => j !== i)),
              }
            : { hex, onChange: onSwatch };
        // Key on position only, NOT on `hex`. If the key changed with the
        // color, every picker update would remount the input and the native
        // picker dialog would close mid-interaction.
        return <SwatchCell key={i} {...cellProps} />;
      })}
      {!atCap && (
        <button
          type="button"
          aria-label="Add color"
          title="Add color"
          class="w-7 h-7 rounded border border-dashed border-slate-600 text-slate-400 hover:text-osd-mint hover:border-osd-mint text-base leading-none flex items-center justify-center"
          onClick={() => {
            // Seed new swatch with the last one so the user sees a visible
            // addition rather than a black square they didn't choose.
            const seed = swatches[swatches.length - 1] ?? ("#ffffff" as HexColor);
            onChange([...swatches, seed]);
          }}
        >
          +
        </button>
      )}
    </div>
  );
}

function SwatchCell({
  hex,
  onChange,
  onRemove,
}: {
  hex: HexColor;
  onChange: (next: HexColor) => void;
  onRemove?: () => void;
}) {
  return (
    <span class="relative group inline-block select-none" draggable={false}>
      <input
        type="color"
        value={hex}
        // onChange fires on picker commit; onInput fires continuously as the
        // user drags in the picker. We use onChange only so in-flight picker
        // interactions don't trigger a parent re-render that could fight the
        // open dialog. Live-preview is a nice-to-have; picker stability
        // matters more.
        onChange={(e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          if (isValidHex(v)) onChange(normalizeHex(v));
        }}
        title={hex}
        aria-label={`Color ${hex} — click to change`}
        draggable={false}
        class="swatch-input block w-7 h-7 border border-slate-600"
      />
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove color ${hex}`}
          title="Remove"
          onClick={onRemove}
          class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-slate-800 border border-slate-600 text-slate-300 hover:bg-osd-alert hover:text-white hover:border-osd-alert text-[9px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </span>
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
