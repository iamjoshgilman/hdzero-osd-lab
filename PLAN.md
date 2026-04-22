# hdzero-osd-lab — Implementation Plan (v0.0.0)

## 1. Elevator Pitch

hdzero-osd-lab is a purely client-side, browser-based studio for designing color HD OSD fonts and Craft Name / stats decorations for HDZero FPV goggles running Betaflight. It reimplements and extends the capabilities of the Python-based `HD-OSD-Font-Tools` fork (palette TTF rendering, per-glyph image overrides, BMP logo composition) with a WYSIWYG glyph-grid editor, a live preview of a simulated Betaflight OSD, and a novel "Decoration Generator" that turns freeform visual arrangements into the exact 15-character Craft Name string a pilot pastes into Betaflight Configurator. Everything runs in the browser, produces a valid 384×1152 BMP, and deploys for free to GitHub Pages.

## 2. Non-Goals

- **Not** a replacement for Betaflight Configurator. We never flash, never talk MSP, never touch the FC.
- **Not** a firmware tool. No goggle firmware flashing, no SD card writing (browsers cannot write arbitrary paths anyway — we emit downloadable BMP / JSON).
- **Not** a general-purpose pixel editor. The glyph editor is constrained to the 24×36 tile grid with the OSD palette semantics (chroma-key gray transparent, with HD color support).
- **Not** an analog MCM font editor. MCM import is supported as a source; MCM export is out of scope.
- **Not** a DVR / VTX / radio tool. Scope is strictly the OSD font tile (`BTFL_000.bmp`) plus the Craft Name/warning string payloads that ride on top of it.
- **Not** a multi-user / cloud-sync service. Projects are local JSON files the user downloads and re-imports.

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

### Phase 1 — v0.1 "Compositor MVP"

**Goal.** A headless, correct reimplementation of the Python tool. You can load a base BMP + a TTF + a logo + overrides and get a downloadable 384×1152 BMP that is byte-level indistinguishable (modulo RNG and TTF rasterizer differences) from what `fontbuilder.py` emits.

**User-visible deliverable.** Single-page app. A sidebar of "layers" you can add (Base bitmap, TTF subset, Logo, Glyph override). A center canvas showing the composed 384×1152 font preview, zoomable. "Download BMP" button.

**Acceptance criteria.**

- `compose(project)` produces an RGB buffer matching the Python tool's output for a fixture project (base + btflletters TTF) within a configurable per-pixel tolerance (≤ 2 in each channel, to allow for antialiasing differences between pygame.font and Canvas 2D text).
- BMP download produces a 1,327,158-byte 24-bit BMP (v3 header), opens correctly in Windows Explorer thumbnail and in Paint.
- MCM loader reads `CrazySkull_Cuffed.mcm` without error and renders its full glyph set.
- Palette mode: a comma-separated hex list scatters random colors per glyph. RNG defaults to unseeded; a "seed" control locks output.
- Glyph override: drag-and-drop PNG onto any tile replaces it, aspect-ratio-preserving scale, centered on chroma-gray (127,127,127).

---

### Phase 2 — v0.2 "OSD Live Preview"

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

### Phase 2.x — Post-v0.2 follow-ups (v0.2.6+)

User-requested papercut fixes and small wins that don't justify their own phase:

- ~~**How-To tab** — dedicated in-app guide with step-by-step directions for first-time visitors. Sits next to `Resources` in the top bar. Sections: "Your first font" (pick sample → drop icon override → download), "Bring your own TTF" (upload → palette → apply per-glyph tints), "Design an OSD screenshot" (layout → bg image → share). All static content, no state. Replaces the need for a modal tutorial popup — discoverable at any time, not intrusive.~~ Shipped in v0.2.18.
- **HDZero library browser** — fetch-and-preview community BTFL fonts inline (github.com/hd-zero/hdzero-osd-font-library) without leaving the app.
- **Logo / mini-logo uploader** — drag a PNG onto the BTFL logo slot or the 120×36 mini-logo zone; compositor already supports both via `-btfllogo`-equivalent code paths.
- **MCM layer UI** — plug the existing `parseMcm` loader into a layer form so users can overlay analog OSD fonts the same way they can TTFs.
- ~~**Project persistence across reloads** — write the `ProjectDoc` + asset manifest to IndexedDB on every mutate (not just assets). Lets the auto-bootstrap sample load only on truly first visit instead of every page load.~~ Shipped in v0.2.17.
- **Seed control for palette layers** — UI for `project.meta.rngSeed` so users can lock a pleasing random roll reproducibly, or shuffle until one looks good.

### Phase 4 — v1.0 "Polish, Sharing, Docs"

**Goal.** A launchable public release.

**User-visible deliverable.**

- Export whole project as `.hdzero-osd-lab.zip` (JSON + user-uploaded assets).
- Import the same.
- Shareable URL shortcode (encode project doc into a `#fragment` for small projects — no server; large projects fall back to "download bundle").
- Undo/redo across all panels.
- Accessibility pass (keyboard nav, ARIA, visible focus).
- "Load sample project" menu showing 2-3 canned builds (WhiteRqbbit, plain JetBrains Mono recolor, icon-only override-on-stock).
- Documentation site generated from `docs/` via a single Markdown-rendered route.
- Full CHANGELOG.md, GitHub Actions deploy to Pages, proper 404 page.
- Crash handler that serializes the project to a downloadable JSON before any unrecoverable error.

**Acceptance criteria.**

- Lighthouse: Performance ≥ 90, Best Practices ≥ 95, A11y ≥ 90.
- Bundle size: main JS < 350 KB gzipped excluding fonts.
- Works offline after first load (service worker).
- Manual e2e checklist executes green.

---

## 7. Testing Strategy

### Unit tests (Vitest)

- `compositor/matrix.test.ts`: every row of `SWITCH_EXT_SUBSET_OFFSET_MATRIX` produces the expected glyph-subset tile-write list. Compare directly to hand-computed expectations.
- `encoders/bmp.test.ts`: write a 2×2 red pixel, parse with an independent BMP reader, assert bytes match. Also check the 1,327,158-byte total for 384×1152 (file header 14 + DIB 40 + 3 bytes/pixel + row padding to 4-byte boundary; 384×3 = 1152, already aligned, so no padding rows).
- `loaders/bmp.test.ts`: BMP round-trip (write → read → write) is byte-stable.
- `loaders/mcm.test.ts`: `BTFL_analog_default.mcm` loads to the expected tile count and a few hand-verified pixels.
- `decoration/craft-name.test.ts`: slot-to-payload resolver handles letters, digits, `[\]^_`, and invalid codes.

### Golden image tests

- For each fixture project, compose the font and compare its pixel buffer to a committed `.golden.bmp` file with a per-pixel tolerance of ±2 per channel. TTF differences between browser canvas and pygame.font are the biggest known source of drift; fixtures use bitmap layers only for strict equality, and a separate set of TTF fixtures with looser tolerance.
- Visual regression via `vitest` + `pixelmatch`. Fixture inputs live in `src/test/fixtures/`.

### Manual e2e

- Playwright script walks the happy path: load sample project → swap one glyph → change Craft Name decoration → export BMP → read exported file back → assert byte equality to a committed reference.
- Smoke-tested manually on Chrome, Firefox, Edge. No Safari guarantee in v1.0 (noted as a known limitation; the BMP / Canvas code is standards-compliant, but we don't block on Safari-specific bugs).

### CI gates

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Playwright smoke, Lighthouse budget check on a headless build. All four must pass to merge.

## 8. Deployment Pipeline

- **CI (`.github/workflows/ci.yml`).** On every PR: install, lint, typecheck, test, build, upload build artifact.
- **Pages (`.github/workflows/pages.yml`).** On push to `main`: build, then `actions/deploy-pages@v4` with the `dist/` directory. Vite base path set to `/hdzero-osd-lab/` via an env-driven `vite.config.ts`.
- **Releases.** Each phase tag (`v0.1`, `v0.2`, `v0.3`, `v1.0`) triggers a release workflow that attaches the built `dist.zip` to the release and writes a dated section to `CHANGELOG.md` via `release-please` or a hand script.
- **Branch protection.** `main` protected, PRs required, CI required.

## 9. Versioning

- **SemVer.** Major = breaking project-document schema change. Minor = feature. Patch = fixes.
- **Project doc schema.** `schemaVersion` is an integer, never omitted. Loaders include a migration switch; every new major version must provide an automated migration from the previous version, covered by tests.
- **Git tags per phase.** `v0.1` (MVP), `v0.2` (OSD preview), `v0.3` (decoration), `v1.0` (polish). Hotfix tags `v0.1.1` etc.
- **CHANGELOG.md.** Keep-a-Changelog format. Every user-visible change lands under `## [Unreleased]` during development, gets cut on tag.

## 10. Known Risks and Open Questions

- **TTF rasterization parity with pygame.** Our Phase 1 parity test allows ±2 per channel tolerance for TTF layers. If parity is too low, options: (a) ship a WASM build of FreeType, (b) accept the drift and document it, (c) render via canvas with a configurable "super-sampling" parameter that mimics the Python tool's 8x approach. Current bet: (c) gets us to acceptable.
- **SVG rasterization in the browser.** The Python tool uses PyMuPDF. In the browser the recipe is: parse SVG text with `DOMParser`, serialize, load via `<img src="data:image/svg+xml;utf8,..." />`, draw to canvas with `drawImage` at the target size. Catch: some SVG features (filters, masks) render inconsistently across browsers. We'll ship a "preview in Chrome/Firefox" note and document unsupported constructs.
- **BMP byte-parity with pygame.** Pygame writes 24-bit BMPs with default v3 header; we match that. Risk: pygame may write row padding and color space metadata differently. Mitigated by writing a canonical v3 header ourselves and comparing only pixel data, not header bytes, in tests.
- **MCM parser coverage.** We've only seen Betaflight- and INAV-style MCM files. If upstream ships variants (different header magic, odd line terminators), tests will catch but fixes may be invasive.
- **Craft Name length in HDZero.** Betaflight's Craft Name is canonically 15 chars; HDZero firmware renders up to some length we need to confirm. Open question: do we surface a per-firmware length hint, or a global 15? Plan: configurable in the decoration panel with a sensible default of 15.
- **IndexedDB quota on mobile.** Large user TTFs could blow browser storage. Plan: show a quota usage bar; offer "evict unused assets".
- **Service worker cache invalidation.** Classic Pages-hosted SPA gotcha. Use Vite's filename hashing + a tiny `sw.ts` that network-firsts `index.html`.
- **Betaflight schema drift.** BF adds/renames OSD elements over time. We version `osd-schema/` and document the BF version it targets.
- **Licensing of bundled sample fonts.** Anything shipped in `public/sample-fonts/` must have a license we can redistribute. Default shipped font is one we author from scratch or a permissively-licensed community font with explicit credit.
- **Web access parity with the Python `fetch_icon.py` helper.** Fetching game-icons.net from the browser requires CORS. Plan: provide an "upload SVG" flow instead of fetching; optionally a tiny documented PowerShell script in `tools/` that does what `fetch_icon.py` did.

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
