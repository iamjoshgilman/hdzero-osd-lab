# hdzero-osd-lab — Implementation Plan

Current release: **v0.3.8**. See [CHANGELOG.md](CHANGELOG.md) for per-release detail.

## 1. Elevator Pitch

hdzero-osd-lab is a purely client-side, browser-based studio for designing OSD fonts for Betaflight quads. It supports two targets: **HDZero HD** (24-bit color, 384×1152 BMP on SD card) and **analog MAX7456** (2-bit monochrome, .mcm flashed via Configurator's Font Manager). Pilots toggle between modes and the whole UI adapts — theme, dimensions, file formats, install flow. Built on top of the conceptual groundwork from the Python-based `HD-OSD-Font-Tools`, reimplemented in TypeScript with a WYSIWYG glyph atlas, TTF palette rendering, PNG glyph overrides, live simulated OSD preview with drag-positioned elements over FPV backgrounds, and end-to-end project persistence.

## 1.5 Status (as of v0.3.8)

**Shipped and stable:**

- ✅ Phase 1 (v0.1.0) — Compositor MVP. BMP/MCM/TTF layers, glyph overrides, byte-perfect BMP export.
- ✅ Phase 2 (v0.2.0 → v0.2.23) — Live 53×20 OSD preview with 64 elements, drag-to-position, FPV background compositing, per-glyph tints, realism toggle, PNG export/copy-to-clipboard, layer reorder + edit, empty-state placeholders.
- ✅ Phase 2.x follow-up queue — project persistence, How-To tab, logo uploader, MCM layer UI, goggle install guide.
- ✅ Phase 3 (v0.3.0) — Analog (MAX7456) mode with full dual-target support, phosphor-CRT theme swap, MCM encoder, mode-isolated project state, mode-aware everything.
- ✅ v0.3.1 — In-browser pixel editor for single glyphs (from the Inspector) and mini-logos (from Decoration). Pencil / eraser / fill / eyedropper, HSL shade row + presets in HD, three-state palette in analog. Saves through the existing glyph-override / logo-layer pipeline.
- ✅ v0.3.2 — 23-issue polish pass driven by 6 parallel codebase audits. Closed several mode-switch race conditions, added a persistent error banner for storage failures (private browsing, quota, autosave), modal focus trap + aria-labels for the pixel editor, inline errors throughout (replacing OS dialogs), runtime shape validation on JSON/IDB reads.
- ✅ v0.3.3 — Stabilized TTF palette layers (per-glyph random colors no longer reshuffle on FPV background swap, OSD drag, or tab switch) via per-layer `paletteSeed` + rasterization cache. Shipped a swatch-based palette editor with `↻ reroll`, and made the Edit TTF form live-preview every field (size, outline, stretch, colors, file replace) with single-undo-entry session semantics (Save commits, Cancel rolls back).
- ✅ v0.3.4 — SVG support for glyph overrides via an `HTMLImageElement` + canvas rasterization path (works around cross-browser gaps in `createImageBitmap` on SVG). Per-override decode errors now surface inline under each override row — previously a single bad file silently blanked all overrides.
- ✅ v0.3.5 — Scale knob on glyph overrides (`OverrideSource.scale`, slider in Inspector). Lets pilots push icons with internal viewBox padding out to fill the tile instead of rendering small under pure aspect-fit. Content past the tile edge clips. Slider uses the live-edit session pattern so a drag is one undo entry.
- ✅ v0.3.6 — Same scale knob extended to logo layers (`LogoLayer.scale`, slider in each LogoSlotCard on the Decoration page). Crops the baked-in padding PNG logo templates ship with so the BTFL banner / mini-logo actually fills the slot.
- ✅ v0.3.7 — Live preview on each Decoration logo card so dialing in the v0.3.6 scale slider isn't blind. Reads the resolver's post-scaled RGBA, renders chroma-gray as transparent over a dark bg, CSS-pixelated-upscales to fit the card.
- ✅ v0.3.8 — Editor-overhaul batch: canvas scroll-to-edges fix (flex-centering + overflow was hiding the left edge when zoomed past container); scale slider moved from Decoration cards INTO the pixel-editor modal where paint tools also live, so both BTFL banner and mini-logo share one "✎ Edit" affordance; BTFL banner became drawable (zoom + scroll + scale made pixel-by-pixel viable); 1–16 px square brush for pencil/eraser with hover outline; shift-drag axis-lock for straight lines.

**Planned next:** small follow-ups (HDZero font library browser, analog sample fonts) plus larger Phase 4 items (zip import/export, URL-fragment sharing, a11y completeness). See "Planned next" under Phase 4 below — no monolithic v1.0 milestone, items ship when worth shipping.

## 2. Non-Goals

- **Not** a replacement for Betaflight Configurator. We never flash, never talk MSP, never touch the FC directly. (The tool *produces* a `.mcm` the pilot uploads via Configurator in analog mode; we don't connect to the FC ourselves.)
- **Not** a firmware tool. No goggle firmware flashing, no SD card writing (browsers cannot write arbitrary paths anyway — we emit downloadable BMP / MCM).
- **Not** a general-purpose pixel editor. The in-browser glyph editor (shipped in v0.3.1) is constrained to the tile grid with OSD palette semantics — chroma-key gray = transparent, mode-appropriate color constraints. It's not trying to replace Aseprite.
- **Not** a DVR / VTX / radio tool. Scope is strictly the OSD font + the Craft Name / warning-string payloads that ride on top of it.
- **Not** a multi-user / cloud-sync service. Projects persist to browser IndexedDB; sharing happens via file export (zip import/export TBD).

## 3. High-Level Architecture

Four horizontal layers, each an independent module with a narrow public surface. All logic is TypeScript; the only runtime is a static Vite bundle.

```
+----------------------------------------------------------+
|  UI LAYER (Preact + Tailwind)                            |
|    - Studio shell, routing, panels, drag/drop            |
|    - Glyph grid editor, per-tile painter                 |
|    - OSD live preview canvas                             |
|    - Decoration generator workspace                      |
+----------------------------------------------------------+
|  APPLICATION STATE (signals / zustand-lite store)        |
|    - Project document (single JSON source of truth)      |
|    - Undo / redo (command pattern)                       |
|    - Derived selectors (memoized)                        |
+----------------------------------------------------------+
|  DOMAIN / COMPOSITOR (pure TS, no DOM)                   |
|    - Font canvas model: 512 tiles, 24×36 each, RGB       |
|    - Loaders: BMP, PNG, MCM, TTF (opentype.js),          |
|      arbitrary image-into-glyph                          |
|    - Subset compositor (port of                          |
|      SWITCH_EXT_SUBSET_OFFSET_MATRIX)                    |
|    - Palette engine (per-glyph random from color list)   |
|    - BMP encoder (24-bit BITMAPINFOHEADER, 384×1152)     |
+----------------------------------------------------------+
|  OSD SCHEMA                                              |
|    - Betaflight element table (code, label, default pos, |
|      width) — reimplemented, not copied                  |
|    - HDZero-specific additions                           |
|    - Craft-name-slot rules (15 chars, printable subset)  |
+----------------------------------------------------------+
```

### Module Responsibilities

- `compositor/` — all pixel math. Takes a project document, produces a `Uint8ClampedArray` representing the 384×1152 RGB font image. No `document`, no `window` imports.
- `encoders/` — binary writers. BMP v3 (24-bit, bottom-up DIB). Optionally PNG via the OffscreenCanvas API in phase 3+.
- `loaders/` — binary readers. BMP decoder, MCM parser, TTF rasterizer using `opentype.js` + a canvas, generic image loader producing the 24×36 tile sprite.
- `osd-schema/` — static data describing Betaflight OSD elements. Reimplemented from public knowledge; no code copied from `betaflight-configurator` (GPL-3.0). Referenced files listed below for provenance and for maintainers to cross-check.
- `decoration/` — rules + helpers for the Craft Name and post-flight stats decoration generator. Maps visual arrangements to the 15-character ASCII payload.
- `ui/` — Preact components. Each panel is a thin shell that reads signals and dispatches commands.
- `state/` — the project document, undo/redo stack, persistence to `localStorage` plus file-based import/export.

### Betaflight / HDZero schema provenance

Our `osd-schema` will be derived by reading the following open-source files in the Betaflight Configurator repo (GPL-3.0) to cross-check element names/codes. We reimplement the data from scratch in TypeScript and do not include GPL code in our MIT repo. Reference files (for maintainers):

- `betaflight/betaflight-configurator` — `src/js/tabs/osd.js` (element table and default positions), `src/js/msp/MSPCodes.js` (adjacent context), `locales/en/messages.json` (human labels).
- `hd-zero/hdzero-configurator` — any HD-specific element additions.

The schema module will include a short comment at the top: *"Data-only table reimplemented from publicly documented Betaflight OSD element assignments. No GPL code is copied."*

## 4. Repo File / Folder Layout

```
hdzero-osd-lab/
  README.md
  PLAN.md                 <-- this file
  CHANGELOG.md
  LICENSE                 <-- MIT
  NOTICE                  <-- attributions: ondrascz, Betaflight, game-icons.net
  package.json
  pnpm-lock.yaml
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
  index.html
  .github/
    workflows/
      ci.yml
      pages.yml
  public/
    favicon.svg
    sample-fonts/
      BTFL_default.bmp    <-- shipped sample
  src/
    main.tsx
    app.tsx
    compositor/
      index.ts
      types.ts
      canvas.ts           <-- offscreen tile canvas + RGB buffer ops
      subsets.ts          <-- GLYPH_SUBSET_* tables
      matrix.ts           <-- SWITCH_EXT_SUBSET_OFFSET_MATRIX port
      palette.ts
      compose.ts          <-- top-level compose(projectDoc) -> RGBA buffer
    loaders/
      bmp.ts              <-- decode 384x1152 BMP -> tiles
      mcm.ts              <-- decode .mcm ascii -> tiles
      ttf.ts              <-- opentype.js + canvas rasterizer
      image-to-tile.ts    <-- any PNG/SVG -> centered 24x36 tile
      svg.ts              <-- DOMParser + <img> + canvas
    encoders/
      bmp.ts              <-- 24-bit BMP writer, Uint8Array
      png.ts
    osd-schema/
      elements.ts         <-- element table (code, label, w, h, default pos)
      hdzero.ts           <-- HD-specific overrides
      craft-name.ts       <-- 15-char ASCII rules
    decoration/
      craft-name-studio.ts
      stats-studio.ts
      char-map.ts         <-- printable glyph codes usable in strings
    state/
      project.ts          <-- ProjectDoc type, defaults
      store.ts
      undo.ts
      persistence.ts
    ui/
      shell/
        AppShell.tsx
        TopBar.tsx
        StatusBar.tsx
      font-editor/
        FontGrid.tsx
        GlyphInspector.tsx
        LayerList.tsx
        PalettePicker.tsx
      osd-preview/
        OsdCanvas.tsx
        ElementLibrary.tsx
        ElementInspector.tsx
      decoration/
        CraftNameDesigner.tsx
        StatsDesigner.tsx
        ExportPanel.tsx
      shared/
        Button.tsx
        Slider.tsx
        FileDrop.tsx
        HexInput.tsx
    workers/
      ttf-raster.worker.ts  <-- phase 2+; offload heavy TTF render
    test/
      compositor/
        matrix.test.ts
        palette.test.ts
        bmp-roundtrip.test.ts
      loaders/
        mcm.test.ts
        ttf.test.ts
      decoration/
        craft-name.test.ts
      fixtures/
        BTFL_minimal.bmp
        sample.mcm
        sample.ttf
  docs/
    ARCHITECTURE.md
    SCHEMA.md
    CONTRIBUTING.md
```

## 5. Data Model — the Project Document

A single JSON document is the source of truth. Every UI action is a pure transformation on this document; the compositor is a pure function of it.

```ts
// src/state/project.ts
export type ProjectDoc = {
  schemaVersion: 1;
  meta: {
    name: string;
    createdAt: string;       // ISO
    updatedAt: string;
    rngSeed: number | null;  // null = unseeded (matches Python tool default)
  };
  font: {
    // ordered list of compositor layers; later layers overwrite earlier
    layers: Layer[];
    // per-tile overrides, always win (matches -glyph behavior)
    overrides: Record<number, OverrideSource>; // key = glyph code 0..511
  };
  osdLayout: {
    // Betaflight OSD element positions (user's chosen layout, not the font)
    elements: Record<ElementId, { x: number; y: number; enabled: boolean }>;
  };
  decorations: {
    craftName: CraftNameDecoration;
    stats: StatsDecoration[];
  };
};

export type Layer =
  | { kind: "bitmap"; source: AssetRef; subset: SubsetName } // base BMP/PNG
  | { kind: "mcm";    source: AssetRef; subset: SubsetName;
                      glyphColor: HexColor; outlineColor: HexColor }
  | { kind: "ttf";    source: AssetRef; subset: SubsetName;
                      size: number; outlineThickness: number;
                      vStretch: number;
                      glyphOffset: { x: number; y: number };
                      outlineOffset: { x: number; y: number };
                      glyphColor: HexColor | HexColor[];    // palette
                      outlineColor: HexColor | HexColor[]; }
  | { kind: "logo";   source: AssetRef; size: "btfl" | "inav" | "mini" };

export type OverrideSource = {
  source: AssetRef;    // PNG/BMP/SVG
  tintColor?: HexColor;
};

export type AssetRef =
  | { kind: "builtin"; id: string }
  | { kind: "user";    hash: string; name: string; mime: string };
  // user assets live in an IndexedDB-backed blob cache, addressed by hash

export type CraftNameDecoration = {
  // 15 printable ASCII slots; each slot either a literal char
  // or a glyph code chosen via the mini-logo trick (91..95 etc).
  slots: Array<
    | { kind: "char"; ch: string }         // e.g. 'A'
    | { kind: "glyph"; code: number }      // raw glyph code mapped to printable byte
  >;
  // resolved string the user pastes into BF Configurator
  resolvedPayload: string;                 // derived, cached for UX
};

export type StatsDecoration = {
  id: string;
  label: string;                           // e.g. "Post-flight message"
  content: Array<Slot>;                    // similar to CraftName
};
```

### Why IndexedDB for assets

The project JSON must stay small and human-readable. User-supplied binaries (TTFs, logos, source BMPs) are stored separately in IndexedDB keyed by SHA-256, and referenced from the document by hash. Exporting a project bundles JSON + assets as a `.hdzero-osd-lab.zip`. Importing unpacks it.

## 6. Phased Roadmap

Each phase is a git tag. Every phase has a user-visible deliverable and acceptance criteria.

---

### Phase 1 — v0.1 "Compositor MVP" ✅ shipped (v0.1.0, 2026-04-21)

**Goal.** A headless, correct reimplementation of the Python tool. You can load a base BMP + a TTF + a logo + overrides and get a downloadable 384×1152 BMP that is byte-level indistinguishable (modulo RNG and TTF rasterizer differences) from what `fontbuilder.py` emits.

**User-visible deliverable.** Single-page app. A sidebar of "layers" you can add (Base bitmap, TTF subset, Logo, Glyph override). A center canvas showing the composed 384×1152 font preview, zoomable. "Download BMP" button.

**Acceptance criteria.**

- `compose(project)` produces an RGB buffer matching the Python tool's output for a fixture project (base + btflletters TTF) within a configurable per-pixel tolerance (≤ 2 in each channel, to allow for antialiasing differences between pygame.font and Canvas 2D text).
- BMP download produces a 1,327,158-byte 24-bit BMP (v3 header), opens correctly in Windows Explorer thumbnail and in Paint.
- MCM loader reads `CrazySkull_Cuffed.mcm` without error and renders its full glyph set.
- Palette mode: a comma-separated hex list scatters random colors per glyph. RNG defaults to unseeded; a "seed" control locks output.
- Glyph override: drag-and-drop PNG onto any tile replaces it, aspect-ratio-preserving scale, centered on chroma-gray (127,127,127).

---

### Phase 2 — v0.2 "OSD Live Preview" ✅ shipped (v0.2.0 → v0.2.23, 2026-04-22)

**Goal.** Simulate what the font will look like in-flight. Pick an OSD element from a library, drag it onto a 53×20 grid, see it render using the current composed font in real time.

**User-visible deliverable.**

- New "Preview" tab alongside "Font".
- A 53×20 OSD grid (53 * 24 × 20 * 36 pixels, scaled to fit) over an optional background image (goggle capture stills shipped in `public/`).
- Element library panel: RSSI, Battery voltage, Flight time, Home arrow, Craft name, Logo, Warnings, etc. Each element is a list of glyph codes + default position + default enabled state.
- Drag to reposition, toggle enabled, inspector shows the glyph codes in use.
- Changing the font in the editor updates the preview instantly.

**Acceptance criteria.**

- All top-20 Betaflight OSD elements are represented with correct glyph codes.
- Positions persist in `project.osdLayout` and round-trip through JSON.
- Rendering uses the compositor's RGB buffer as a sprite atlas (no re-rasterization per frame); panning/zooming hits 60 fps.
- HDZero-specific elements (if any) distinguished visually.

---

### Phase 3 — v0.3 "Analog mode" ✅ shipped

**Shipped instead of the original "Decoration Generator" plan.** User feedback during v0.2.x made it clear the larger audience win was extending the tool to cover analog Betaflight pilots (MAX7456 FCs + `.mcm` fonts), not a visual Craft Name designer. The existing Craft Name text input in the OSD Preview element panel covers 90% of the original Decoration Generator's intent — pilots type their payload, see it render inline over the OSD. The separate visual glyph-picker is deferred.

**What shipped in v0.3.0:** mode toggle (HDZero ↔ Analog) with full theme swap to a phosphor-CRT aesthetic, parallel 12×18 compositor path, MCM encoder, mode-isolated project state via font archive, mode-aware OSD grid + font preview + Decoration tab + How-To. Full detail in CHANGELOG.

**Deferred to a future release (v0.4 or beyond):**

- Visual 15-slot Craft Name glyph picker (the original Phase 3 concept). Covered at 90% by the existing text-input flow; the remaining 10% is "drag glyphs from the atlas into slots" which adds convenience but not new capability.

---

### Phase 3 (original, now deferred) — "Decoration Generator"

**Goal.** The novel feature. Since Betaflight's OSD elements have fixed glyph codes, the only freeform slots are Craft Name (15 chars) and post-flight warning/stats strings. This phase gives users a visual designer for those, with live mapping to the exact ASCII payload to paste.

**Why this matters (explain clearly in the plan and the UI).** In Betaflight Configurator, most OSD values (battery icon, RSSI symbol, compass) are rendered by the firmware by emitting a specific glyph code. Pilots cannot change which code a flight-time element uses. The **one** place a pilot controls raw glyph codes is freeform text: Craft Name, post-flight warning messages, and certain OSD "text" elements. By designing a custom font that puts a logo into, say, codes 91..95, and then setting their Craft Name to the ASCII characters that render those codes (`[`, `\`, `]`, `^`, `_`), a pilot makes a 5-tile inline logo appear on their OSD. The Decoration Generator automates this trick: the pilot paints a visual arrangement on a mini-canvas, and the tool emits the exact 15-char string they paste into Configurator's Craft Name field.

**User-visible deliverable.**

- "Decoration" tab.
- Craft Name designer: a 15-tile-wide canvas. User drags glyphs from the font grid into slots. Each slot displays both the rendered glyph and the underlying printable ASCII character (e.g., slot 6 = `\` rendering the mini-logo second tile). Live "Payload" string at the bottom, one-click copy to clipboard.
- Stats/Warning designer: same mechanics, longer canvas (up to ~30 chars), with presets for common stats strings.
- Clear UI annotation: "Paste this into Betaflight Configurator's Configuration → Personal → Craft Name."

**Acceptance criteria.**

- Every slot shows either a literal character (typed) or a glyph code chosen via a picker; the picker filters to printable ASCII 32–126 and flags codes above 126 as "only usable if paired with the right font-building trick".
- Copying the payload gives exactly the string BF Configurator accepts; non-ASCII bytes are validated and warned.
- Presets: "WhiteRqbbit mini-logo" (`[\]^_`) ships as a demo, proving the pipeline.
- Project JSON stores the decoration alongside font and OSD layout so a single shared file captures the full build.

---

### Phase 2.x — Post-v0.2 follow-ups ✅ mostly shipped

User-requested papercut fixes and small wins that rode alongside v0.2.x / v0.3.0:

- ~~**How-To tab**~~ — shipped v0.2.18 (mode-aware, installation flow per target).
- ~~**Logo / mini-logo uploader**~~ — shipped v0.2.11, fixed rendering in v0.2.12, extended to analog in v0.3.0 with halved dimensions.
- ~~**MCM layer UI**~~ — shipped v0.2.22 (form + layer card), render bug fix v0.2.23.
- ~~**Project persistence across reloads**~~ — shipped v0.2.17 (IndexedDB-backed auto-save).
- ~~**Goggle install walkthrough in-app**~~ — shipped v0.2.19, split per-mode in v0.3.0.

**Not yet shipped (still on the list):**

- **HDZero library browser** — fetch-and-preview community BTFL fonts inline without leaving the app.
- **Seed control for palette layers** — UI for `project.meta.rngSeed` so users can lock a pleasing random palette roll reproducibly or shuffle until they like the result.
- **Analog sample fonts** — bundled `.mcm` fonts for the analog mode sample dropdown. Blocked on finding redistributable sources.

### Phase 4 — "Planned next"

Not a monolithic v1.0 release anymore — "polish as we go" has been the actual pattern (MIT-licensed, CI green on every commit). What's left is a short list of specific features, each shippable on its own timeline.

#### v0.3.1 — In-browser pixel editor

The biggest outstanding capability gap: pilots can upload/compose/override glyphs but can't *draw* them. Closing that loop turns the tool into a self-contained font designer.

**Approach — self-rolled, not Piskel embed:**

- A tile is 216 pixels (analog) or 864 (HD) — too small to justify pulling in a full editor.
- Tight integration with the compositor matters. Edits need to flow through the existing glyph-override pipeline (no export/import dance).
- Estimated scope: ~200 lines + pure pixel ops. Maybe 3–4 hours of focused work for the single-glyph editor; multi-tile canvas is a follow-up on the same primitives.

**Single-glyph editor (main deliverable):**

- Modal popup triggered by a new "✎ Draw" button in the Glyph Inspector.
- Canvas renders the current composed tile at ~16× zoom with nearest-neighbor.
- Toolbar: pencil, eraser (→ chroma-gray), fill bucket, eyedropper, color swatch, grid toggle, undo/redo (editor-scoped).
- Mode-aware color constraints: HD = free-form 24-bit picker; analog = 3-button palette (black / white / transparent) so the editor can't mislead the preview.
- Seed from "whatever the glyph looks like right now" (extracted from the composed atlas). Option to clear to blank.
- Save writes through the existing glyph-override mechanism. Persists via autosave; shows up in the LayersPanel overrides list.

**Multi-tile canvas (v0.3.2 follow-up):**

- "✎ Design" button next to each Decoration logo slot.
- Canvas sized to the slot's full dimensions (576×144 / 120×36 in HD, halved in analog) with a tile-boundary grid overlay so users can see where glyphs break.
- Save feeds the image through the existing logo-uploader pipeline — same code path as "drop a PNG."

#### Known smaller items

- Zip import/export (`.hdzero-osd-lab.zip` = JSON + user-uploaded assets). Currently assets persist in IndexedDB only, no portable bundle.
- Shareable URL encoding for small projects (`#fragment`-encoded doc, server-less).
- A11y pass — keyboard nav on the element library and OSD canvas, visible-focus outlines, ARIA on the mode toggle.
- HDZero library browser (Phase 2.x carryover) — fetch community fonts inline.
- Seed control for TTF palette layers.

Nothing in this section is time-boxed; items ship when they're worth shipping. No v1.0 milestone planned — SemVer keeps working incrementally.

---

## 7. Testing Strategy

What actually ships:

- **Vitest unit tests**, 182 as of v0.3.0 across 21 files. Cover the compositor (atlas ops, compose dispatch, both HD and analog paths), loaders (BMP decode, MCM parse native + upscaled, image-to-tile at both target sizes, TTF arg validation), encoders (BMP byte-exact, MCM round-trip), state (project defaults + migration, persistence, undo, switchMode isolation, autosave debounce), and OSD schema invariants.
- **Typecheck gate** via `tsc --noEmit` in strict mode with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- **CI on every push/PR** (`.github/workflows/build.yml`) runs typecheck + tests + production build, uploads `dist/` as a 30-day artifact.
- **Browser verify before push** — features that touch `src/` get hands-on verification in `npm run dev` before the push.

**Deliberately not pursuing:**

- Playwright e2e. Manual browser verification has caught every real bug so far; the e2e infrastructure cost wouldn't pay off for a solo-maintained hobby project.
- Lighthouse budget checks. Bundle's ~53 KB gzipped; that's well under any reasonable budget without automated gating.
- Golden image regression suites. The unit tests cover the byte-level invariants; visual regressions get caught during browser verify.
- Cross-browser matrix. Works on current Chrome/Firefox/Edge. Safari not tested — the tool uses OffscreenCanvas and FontFace which Safari supports but is sometimes funky about; we don't block on Safari bugs.

## 8. Build + Release

- **CI** — `.github/workflows/build.yml`. On every push and PR: `npm ci`, typecheck, `npm run test:run`, `npm run build`. Uploads `dist/` as a 30-day artifact. Green badge in README.
- **Output** — `dist/` is a pure static bundle (HTML + JS + CSS + assets). No backend, no API routes, no runtime config. Deployable on anything that serves static files.
- **Releases** — tag per version (`v0.1.0`, `v0.2.x`, `v0.3.0`, etc.) pushed to GitHub after the feature is browser-verified. Releases page renders the CHANGELOG entry and links the tagged commit.

## 9. Versioning

- **SemVer.** Patch = fix / small polish. Minor = feature. Major = breaking `schemaVersion` bump (none yet — we're still on schemaVersion=1).
- **Project doc schema.** `schemaVersion` is an integer, never omitted. `projectFromJson` handles forward-compat additions (new optional fields auto-default on load, e.g. `meta.mode = "hd"` for pre-v0.3.0 saves). Breaking changes get a dedicated migration function when needed.
- **CHANGELOG.md** — Keep-a-Changelog format. Per-version entries written at the time of tag, covering what shipped + why.

## 10. Known Risks and Open Questions

**Live:**

- **Betaflight schema drift.** BF periodically adds / renames / removes OSD elements. Our `osd-schema/` is a snapshot; drift could cause sample coordinates or codes to go stale. Mitigation: the schema is all data, not code — a manual audit against Betaflight source is a quick fix when needed.
- **Bundled sample-font licensing.** Community analog `.mcm` fonts aren't broadly MIT-licensed; v0.3.0 ships zero bundled analog samples for this reason. HD samples in `public/sample-fonts/` are credited in NOTICE with a "remove-on-request" stance. Future additions need explicit redistributable licensing.
- **IndexedDB quota on mobile.** Large TTFs could blow browser storage. No mitigation shipped yet (users haven't hit it); when they do, a quota-usage bar + "evict unused assets" flow is ready behind the existing `evictUnused` helper.
- **Analog MCM variant coverage.** Our parser handles standard Betaflight/INAV-style MCMs. If upstream ships different header magic or odd line terminators, existing tests should catch it but a fix may be invasive.

**Resolved / no longer a concern:**

- ~~TTF rasterization parity with pygame~~ — our supersampling approach shipped in v0.1.x and has been validated in practice.
- ~~BMP byte-parity with pygame~~ — v0.1.0 roundtrip tests lock byte-level output.
- ~~Service worker cache invalidation~~ — no service worker shipped; cache-busting handled by Vite filename hashing.
- ~~Web access parity with `fetch_icon.py`~~ — not pursued; upload flow works, game-icons.net fetching deferred indefinitely.

## 11. Credits & License

- **License.** MIT. See `LICENSE`.
- **Attribution.** See `NOTICE`.
  - Compositor logic inspired by and reimplemented from the Python tool `ondrascz/HD-OSD-Font-Tools` and the WhiteRqbbit fork. No Python code is copied; the glyph-subset matrix is reimplemented as public-domain data.
  - OSD element schema cross-checked against Betaflight Configurator (GPL-3.0). No code copied; schema is reimplemented as a data table.
  - Icons shipped as samples: CC BY 3.0 from individual authors on game-icons.net; credited per-icon in `NOTICE`.
  - `opentype.js` — MIT.
  - `pixelmatch` — ISC (dev-dep only).
- **Third-party code.** All runtime third-party code listed in `package.json` with license noted in `NOTICE`.

## 12. Glossary

- **Glyph** — one 24×36 image tile. The OSD font has 512 glyphs (16 columns × 32 rows).
- **Glyph code** — the integer index 0–511 that identifies a tile. Firmware emits glyph codes; the font dictates what each code looks like.
- **Tile** — synonym for glyph in this codebase.
- **Subset** — a named range of glyph codes (`BTFL_LETTERS` = 65..90, `BTFL_NUMBERS` = 48..57, `BTFL_LOGO` = 160..255, etc.). The compositor takes a source image (TTF, BMP, MCM, PNG) and blits it into one subset of the output.
- **Base layer** — the first/bottom layer that fills all tiles. Usually a community HD OSD BMP.
- **Override** — a single-glyph bitmap that always wins, applied after all subset compositing. Implements the Python tool's `-glyph <code> <image>`.
- **Palette layer** — a TTF layer whose color argument is a list of hex colors; each glyph gets a random color from the list. Produces the "syntax-highlight scatter" look.
- **Banner / BTFL logo** — the 576×144 slot (glyph codes 160–255) shown by the `BETAFLIGHT_LOGO` OSD element.
- **Mini-logo** — the 120×36 slot mapped onto glyph codes 91–95. Renders inline when a printable ASCII string triggers those codes (e.g. Craft Name = `[\]^_`).
- **MCM** — a text-format analog OSD font from the MAX7456 era. 12×18 1-bit glyphs. We upscale to 24×36 for HD compositing.
- **BTFL_000.bmp** — the final 384×1152 24-bit BMP loaded by HDZero goggles off the SD card at `resource/OSD/FC/BTFL_000.bmp`.
- **Chroma-gray / transparent** — pixel color (127,127,127). Treated as transparent by HDZero firmware.
- **Project document** — the JSON file that captures the entire build (font layers, OSD layout, decorations).
- **Decoration** — a visually-designed arrangement of glyphs that compiles to a freeform ASCII payload the pilot pastes into Betaflight's Craft Name or warning-string fields.
