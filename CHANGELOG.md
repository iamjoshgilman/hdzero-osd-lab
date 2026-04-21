# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
