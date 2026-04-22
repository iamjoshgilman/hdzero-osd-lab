# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.7] - 2026-04-21

### Removed

- **Grey starter** sample font was pulled. The font is designed as an intentionally low-contrast template (glyph pixels at `(113,113,113)` vs chroma-gray `(127,127,127)` — only 6% contrast) meant to be overlaid with TTF letters. Standalone it's effectively invisible, which was confusing every user who loaded it first. `public/sample-fonts/ondrascz-grey.bmp` deleted.

### Added

- Four sample fonts from the [HDZero community font library](https://github.com/hd-zero/hdzero-osd-font-library), giving users variety on first load:
  - `BTFL_SNEAKY_FPV_Default_V1.0.0.bmp` — by Sneaky FPV
  - `BTFL_Ligen_Rainbow_V1.0.1.bmp` — by Ligen
  - `BTFL_johhngoblin_teamBBL_v1.0.0.bmp` — by johhngoblin
  - `BTFL_ondrascz_minimal_uppercase_color_bf-plain_V1.0.0.bmp` — by ondrascz
- New `SampleFontPicker` component in `LayersPanel` replaces the single button with a dropdown of 5 fonts (4 community + 1 upstream ondrascz MIT). Each entry keeps the author attribution visible.
- New `extractBtflLogoBanner()` helper in `src/compositor/atlas.ts` — reverses the Z-wrap layout to produce the 576×144 banner as it appears in-flight. Currently unused in the UI; saved for Phase 2 OSD preview (or a v0.1.8 "Logo preview" panel).
- `NOTICE` gained a dedicated HDZero community library section with per-font author credit and an explicit removal policy (open an issue, we pull it).

### Notes

- Two additional community fonts (`BTFL_analog_default_v1.0.0.bmp`, `BTFL_slappyfpv_graffiti_v1.0.0.bmp`) were dropped because they ship in the **exploded** 486×1350 format with 6px tile gaps. Our `decodeBmp` currently expects the compact 384×1152 form. Implode/explode round-trip support is a small loader addition slated for a later patch.
- Upstream HDZero library has no explicit `LICENSE` file — redistribution is with community-trust attribution, removable on request (per maintainer preference).

## [0.1.6] - 2026-04-21

### Changed — Preview background simulates goggle output

- `FontPreview` canvas now substitutes the chroma-gray (127,127,127) pixels of the composed atlas with a **dark background** by default, matching what HDZero firmware actually shows when it composites the font over live FPV video. Without this, light-tone fonts like the ondrascz grey starter were almost invisible against the raw chroma-gray background.
- New **BG** dropdown in the preview toolbar: `Dark (goggle-like)` / `Navy sky` / `Black` / `Chroma-gray (raw)`. The chroma-gray option shows the literal atlas bytes for anyone debugging compositor output.
- `InspectorPanel` tile close-up applies the same substitution against slate-900 for consistency.

### Fixed

- Grey starter font was effectively unreadable against its own chroma-gray bg. The font itself is unchanged; only the preview rendering improved. The saved BMP is still chroma-gray in those slots — exactly what the goggles expect.

## [0.1.5] - 2026-04-21

### Added — Sample base fonts

- `public/sample-fonts/ondrascz-grey.bmp` and `public/sample-fonts/ondrascz-color.bmp` — two MIT-licensed starter fonts by ondrascz (both 384×1152 24-bit BMP, 1,327,158 bytes, SD-card-ready format). Bundled so first-time visitors have something to see without having to hunt down a BMP.
- `LayersPanel` base-font section now includes "Grey starter" and "Color starter" buttons next to the drop zone. Click either → fetches `/sample-fonts/<name>.bmp`, puts it in IndexedDB via the same hash-based path user uploads take, adds it as an `ALL`-subset bitmap layer. Attribution link to ondrascz's repo shown underneath.
- `NOTICE` updated with an explicit sample-fonts attribution block.

### Notes

- HDZero library browser (fetch directly from `github.com/hd-zero/hdzero-osd-font-library`) deferred to a future release — needs a mini gallery UI and CORS-safe GitHub API fetch plumbing.

## [0.1.4] - 2026-04-21

### Added — Betaflight symbol schema

- `src/osd-schema/symbols.ts` — 99-entry table mapping every SYM_* constant from Betaflight's `src/main/drivers/osd_symbols.h` (GPL-3.0, data reimplemented in TS, no code copied) to a human label and semantic category (rssi, throttle, unit, heading, ahi, sats, arrow, battery, power, time, speed, stick, progress, lap, gps, misc). Exports `lookupSymbol(code)`, `allSymbols()`, `symbolCount()`. Aliases (`SYM_CURSOR` → `SYM_AH_LEFT`, `SYM_GPS_DEGREE` → `SYM_STICK_OVERLAY_SPRITE_HIGH`) are captured as notes on the primary entry rather than duplicate rows.
- `src/osd-schema/symbols.test.ts` — 5 cases covering count stability, range invariants, unique-code guarantee (catches accidental duplicates when adding new symbols), well-known lookups, and category coverage. 111 → 117 tests.

### Changed — InspectorPanel

- `src/ui/font-editor/InspectorPanel.tsx` — when the selected glyph is a known BF symbol, the panel now shows its role above the subset chips: e.g. selecting code 123 now displays **"Link Quality (LQ) · SYM_LINK_QUALITY"** instead of just "BTFL_VALUES". Silently hides the section for ASCII letters/numbers/logo tiles / unused codes that don't have a semantic mapping.

### Notes

- Full OSD element table (RSSI Value, Craft Name, Battery Voltage, etc. with default positions + widths) is a larger Phase 2 artifact and is deferred. v0.1.4 ships the code-level semantic layer only — enough to meaningfully annotate the font grid.
- `scratch/` pattern in `.gitignore` keeps local copies of the upstream BF GPL source out of this MIT repo.

## [0.1.3] - 2026-04-21

### Added

- `src/ui/font-editor/glyph-metadata.ts` — pure helper mapping a glyph code to its `GlyphMetadata` (ASCII char, containing subsets, best-fit `GlyphCategory`, `isUsable` flag). Exports `CATEGORY_COLORS` and `CATEGORY_LABELS`. Category priority when a code is in multiple subsets: logo > icon > special > number > letter > unused (e.g. code 91 is both `BTFL_MINILOGO` and `BTFL_SPECIALS` → resolves to `logo`).
- `src/ui/font-editor/glyph-metadata.test.ts` — 9 cases covering letters, numbers, specials, icons, logos, unused slots, lowercase-letter routing through `BTFL_LOWLETTERS`, and palette/label completeness.
- `src/ui/font-editor/InspectorPanel.tsx` — new right-side column (~260px) showing the currently-selected glyph: `#NNN` heading tinted by category, ASCII preview, 4× nearest-neighbor tile close-up pulled from the live composed atlas, category label, subset chip list, and a safety note (⚠ for firmware-drawn slots, ✓ for unused, neutral for logo banner).

### Changed

- `src/ui/font-editor/FontPreview.tsx` — new toolbar checkbox **Category overlay**. When on, every tile is tinted at alpha 0.18 with its category color. Drawn UNDER the grid and selection outline so selection stays crisp. Unused tiles skip the fill so the base font reads cleanly.
- `src/ui/shell/AppShell.tsx` — renders `<InspectorPanel />` as a right-side column inside `<main>` on the Font tab. Hidden on the OSD and Decoration tabs.

### Notes

- Category palette uses soft blue (`#9cdcfe`) for letters, `osd-mint` for numbers, `osd-amber` for specials, `osd-magenta` for icons, pink (`#ff6bcb`) for logos, dim slate for unused.
- Test totals: 102 → 111 (+9). Typecheck clean. Production bundle: 49.14 KB JS / 11.50 KB CSS (18.14 / 2.87 KB gzipped).

## [0.1.2] - 2026-04-21

### Added

- `currentView` signal in `src/state/ui-state.ts` tracks which major tab is active (`font` / `osd` / `decoration`).
- `src/ui/shell/TabBar.tsx` — three-tab navigation between Font editor, OSD preview, and Decoration generator. Phase-tag badges (`v0.2`, `v0.3`) mark tabs whose full implementations are scheduled.
- `src/ui/osd-preview/OsdPreviewStub.tsx` and `src/ui/decoration/DecorationStub.tsx` — placeholder screens for the in-flight tabs.
- `AppShell` now renders the tab bar and switches content based on `currentView`. The global `LayersPanel` stays pinned on the left across tabs.

### Notes

- This is scaffolding only: OSD and Decoration tabs show placeholder screens. v0.2 fills OSD; v0.3 fills Decoration.
- Background agents for OSD schema research and FPV background sourcing were launched but both stopped after discovering their sandbox denies network access. Doing that research directly in the main thread next.

## [0.1.1] - 2026-04-21

### Added

- `src/state/ui-state.ts` — ephemeral (non-project) UI signals. First entry: `selectedGlyph` (`Signal<number | null>`).
- Click-to-select on the `FontPreview` canvas: click a tile → sets `selectedGlyph`, draws a neon-mint outline around it; click again to toggle off.
- `LayersPanel` override adder is two-way-bound to `selectedGlyph`: clicking a glyph in the preview auto-fills the code input; typing a number highlights that tile in the preview.
- Selection status shown in the preview toolbar ("▸ Selected glyph #NNN" with a clear button).

## [0.1.0] - 2026-04-21 — Phase 1 "Compositor MVP" complete

### Added — Track D (UI shell)

- `src/ui/shell/AppShell.tsx` — top-bar (Undo / Redo / Download BTFL_000.bmp), status bar, three-panel layout.
- `src/ui/font-editor/LayersPanel.tsx` — base-BMP drop zone, layer list with enable-toggle + delete, glyph-override uploader that takes a numeric code plus a PNG/BMP.
- `src/ui/font-editor/FontPreview.tsx` — live-rendering canvas of the composed 384×1152 atlas. Reactive via `useComputed(() => compose(project.value, assets.value))`. Zoom slider + optional grid overlay.
- `src/ui/hooks/useResolvedAssets.ts` — subscribes to `project` signal, walks referenced assets, fetches from IndexedDB, runs `decodeBmp` / `imageRgbaToTile`, exposes a `ResolvedAssets` signal for the preview + download path.
- `src/ui/shared/Button.tsx` + `src/ui/shared/FileDrop.tsx` — small reusable primitives.

### End-to-end loop working

Drop a 384×1152 BMP → it lands in IndexedDB by hash, becomes an `ALL`-subset bitmap layer → the canvas re-renders within a frame → hit "Download" to get a byte-perfect `BTFL_000.bmp`. Per-glyph PNG overrides work via the sidebar form. Undo/redo for every project mutation.

### Deferred (covered by later v0.1.x / v0.2+ phases)

- TTF palette layers, MCM imports, logo slots, decoration generator, OSD preview, sharing/export bundle.

### Totals

102 tests passing. Typecheck clean. Production build: 41.7 KB JS / 10.35 KB CSS (15.77 / 2.62 KB gzipped).

## [0.0.5] - 2026-04-21

### Added — Track C (state, undo, assets, persistence)

- `src/state/store.ts` — reactive project signal (`@preact/signals`). `mutate(fn)` takes a draft-mutator, auto-updates `meta.updatedAt`, and pushes the previous doc onto the undo stack. Exports `undo`, `redo`, `canUndo`, `canRedo`, `replaceProject`, `resetStore`.
- `src/state/undo.ts` — generic snapshot-based `UndoStack<T>` with configurable limit (default 100 snapshots). `structuredClone` keeps each snapshot independent without an Immer dep.
- `src/state/assets.ts` — IndexedDB-backed blob cache keyed by SHA-256. `hashBytes`, `putAsset`, `getAsset`, `deleteAsset`, `listAssets`, `evictUnused(keep)` for garbage-collecting referenced-but-absent assets. Handles SharedArrayBuffer-hostile TS strict mode.
- `src/state/persistence.ts` — `projectToJson` / `projectFromJson` with `schemaVersion` validation and guard rails for malformed input.
- `fake-indexeddb` wired as a dev dependency; `src/test/setup-indexeddb.ts` polyfills IndexedDB into jsdom for unit tests.
- Test coverage: +26 cases (undo 6, store 7, assets 8, persistence 5). Total project: 102 tests, all green. Typecheck clean.

### Notes

- Phase 1 backend is now complete: compositor + loaders + state all land. Next commit spawns Track D (the UI shell) which wires everything into an interactive editor — that ships as v0.1.0.

## [0.0.4] - 2026-04-21

### Added — Track B (loaders)

- `src/loaders/bmp.ts` — `decodeBmp(ArrayBuffer | Uint8Array) → RgbImage`. Reads 24-bit BI_RGB v3 BMPs, handles both bottom-up and top-down row order, always returns top-down RGB. Round-trip-tested against `writeBmp24` on a 384×1152 atlas byte-for-byte.
- `src/loaders/mcm.ts` — `parseMcm(text, opts)` parses MAX7456 .mcm analog OSD fonts (256 glyphs, 12×18 px at 2 bits/pixel, `"00"`/`"10"`/else → outline/glyph/transparent), upscales each 2× into 24×36 HD tiles. Custom glyph + outline colors via `opts.glyphColor` / `opts.outlineColor` hex.
- `src/loaders/image-to-tile.ts` — `imageRgbaToTile(RgbaImage, opts)` scales any RGBA image to fit 24×36 preserving aspect, centers on chroma-gray, supports optional `tintColor` and alpha compositing. Pure function, fully tested. `imageElementToTile(ImageBitmapSource)` is the browser-only convenience that pipes through an OffscreenCanvas first.
- `src/loaders/ttf.ts` — `rasterizeTtfSubset(ArrayBuffer, opts) → Promise<TileMap>`. Ports fontbuilder.py's supersampled TTF pipeline to the browser via `FontFace` + `OffscreenCanvas` + thickness-disc outline stamping. Vitest coverage is intentionally limited to argument validation — full pixel-level tests require real Canvas and will land with Playwright smokes.
- Test coverage: +24 cases (BMP decoder 6, MCM 6, image-to-tile 6, TTF validation 6). Total project: 76 tests, all green. Typecheck clean.

## [0.0.3] - 2026-04-21

### Added — Track A (compositor core + BMP encoder)

- `src/encoders/bmp.ts` — `writeBmp24(RgbImage) → Uint8Array`. Produces a byte-level-correct 24-bit BMP v3 with proper BITMAPFILEHEADER + BITMAPINFOHEADER, BGR byte order, bottom-up rows, 4-byte row alignment. 384×1152 atlas writes as exactly 1,327,158 bytes (same as pygame's output for SD-card compatibility).
- `src/compositor/palette.ts` — `parseHex(hex)`, `createRng(seed)`, `resolveColor(palette, rng)`. xorshift32 for deterministic seeded RNG; `null` seed falls through to `Math.random` (matches Python fork's default per-build shuffle).
- `src/compositor/atlas.ts` — low-level buffer ops: `createAtlas`, `createTile`, `fillRgb`, `blitTile`, `extractTile`, `blitRgbaRegionIntoAtlas` (with full alpha compositing). `TILE_BYTES=2592`, `ATLAS_BYTES=1,327,104` exported for test assertions.
- `src/compositor/compose.ts` — `compose(ProjectDoc, ResolvedAssets, opts?) → Uint8ClampedArray`. Pure function, no DOM. Applies enabled layers in order; bitmap layers extract subset tiles from 384×1152 sources; mcm/ttf layers consume pre-rendered `TileMap`s produced by Track B; logo layers use the exact strip-wrapping layout from `fontbuilder.py` for `btfl` (576×144), `inav` (240×144), and `mini` (120×36) slots. Overrides always win, applied last.
- Test coverage: 39 new cases (BMP encoder 5, palette 16, atlas 11, compose 7). Total project: 52 tests, all green. Typecheck clean.

## [0.0.2] - 2026-04-21

### Added

- `src/compositor/constants.ts` — HD OSD font geometry (`GLYPH_SIZE`, `FONT_GRID`, `FONT_SIZE`, `LOGO_SIZE`), chroma-key RGB (`COLOR_TRANSPARENT = [127,127,127]`), and the full `GLYPH_SUBSETS` table (ALL / BTFL_CHARACTERS / BTFL_LETTERS / BTFL_LOWLETTERS / BTFL_NUMBERS / BTFL_SPECIALS / BTFL_VALUES / BTFL_UNITS / BTFL_AHI / BTFL_COMPASS / BTFL_BATTERY / BTFL_ARROW / BTFL_FRAME / BTFL_PROGRESS / BTFL_LOGO / BTFL_MINILOGO / INAV_LOGO) ported from `fontbuilder.py`. `SUBSET_TARGET_OFFSET` captures the BTFL_LOWLETTERS -32 shift.
- `src/compositor/types.ts` — shared `Tile`, `RgbImage`, `RgbaImage`, `TileMap` types.
- `src/state/project.ts` — authoritative `ProjectDoc` schema (v1) with discriminated `Layer` union (`bitmap`/`mcm`/`ttf`/`logo`), `OverrideSource`, `AssetRef`, `CraftNameDecoration`, `StatsDecoration`. `createDefaultProject()` factory.
- Unit tests: 12 new cases covering geometry invariants, subset membership, offsets, and the default-project factory. All 13 project tests green.

## [0.0.1] - 2026-04-21

### Added

- Build toolchain: Vite 6, TypeScript 5.7 (strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), Preact 10, Tailwind 3.4, Vitest 3 (jsdom environment).
- Configs: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `.prettierrc.json`.
- Module skeleton with `index.ts` placeholders for each Phase 1 track: `compositor/`, `loaders/`, `encoders/`, `osd-schema/`, `decoration/`, `state/`.
- UI entry point: `index.html`, `src/main.tsx`, `src/app.tsx`, Tailwind `src/styles.css`, basic favicon.
- Smoke test in `src/compositor/smoke.test.ts` verifying the test harness.
- npm scripts: `dev`, `build`, `preview`, `test`, `test:run`, `typecheck`, `format`.

### Verified

- `npm run typecheck` — pass
- `npm run test:run` — 1 passed
- `npm run build` — succeeds, production bundle 5.15 KB gzipped

## [0.0.0] - 2026-04-21

### Added

- Repository scaffolding: MIT `LICENSE`, `.gitignore`, `CHANGELOG.md`, `NOTICE`, `README.md`.
- Comprehensive `PLAN.md` defining the four-phase roadmap (v0.1 compositor MVP, v0.2 OSD live preview, v0.3 decoration generator, v1.0 polish + sharing), module architecture, project-document schema, testing and deployment strategy, versioning policy, known risks, and glossary.
