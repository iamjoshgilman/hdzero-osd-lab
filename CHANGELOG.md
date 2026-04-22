# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-04-22 — Phase 3 "Analog mode" complete

### Added — Analog (MAX7456) mode

The tool now builds either HDZero HD fonts or analog MAX7456 fonts. Pilots pick their target with a toggle above the base-font drop; the whole UI re-themes to a CRT-phosphor aesthetic, file types and dimensions gate per mode, and the download format swaps between `.bmp` and `.mcm`. Modes are fully isolated — work on an HD build and an analog build in parallel, switch back and forth, nothing bleeds.

Primary analog workflow: drop a `.mcm`, build on top with MCM/TTF layers + glyph overrides + logo uploaders at half HD dimensions, position OSD elements on a 30×16 grid over an FPV background, download a new `.mcm` ready to flash from Betaflight Configurator's Font Manager.

**Architecture — parallel paths, shared primitives:**

- `src/compositor/constants.ts` — `ANALOG_GLYPH_SIZE` (12×18), `ANALOG_GLYPH_COUNT` (256), `ANALOG_FONT_GRID` (16×16), `ANALOG_FONT_SIZE` (192×288), `ANALOG_OSD_GRID` (30×16), `ANALOG_LOGO_SIZE` (half of HD's for both btfl and mini slots). Plus `analogCodeToOrigin()` mirroring HD's `codeToOrigin`.
- `src/compositor/atlas.ts` — parallel `createAnalogAtlas`, `blitAnalogTile`, `extractAnalogTile`, `tintAnalogTileInPlace`. HD primitives untouched.
- `src/compositor/compose.ts` — top-level `compose()` dispatches on `project.meta.mode`. `composeHd` is the existing logic renamed; `composeAnalog` handles MCM layers, TTF layers rendered at 12×18, PNG glyph overrides at 12×18, logo layers (mini-logo + BTFL banner tiles at halved dimensions), and tints. The bitmap layer kind no-ops in analog (no BMP format there).
- `src/loaders/mcm.ts` — split into `parseMcm` (existing, 2×-upscaled to HD) and new `parseMcmNative` (native 12×18 for analog mode). `parseMcm` is now a thin wrapper over `parseMcmNative` + the upscale step — they can't desync.
- `src/loaders/ttf.ts` — `rasterizeTtfSubset` now takes an optional `targetSize`. `useResolvedAssets` passes `ANALOG_GLYPH_SIZE` when mode is analog, producing crisp native-res TTF glyphs.
- `src/loaders/image-to-tile.ts` — `imageRgbaToTile` now takes an optional `targetSize`. PNG glyph overrides and logo uploads scale to 12×18 / halved dimensions in analog.
- `src/encoders/mcm.ts` — new `writeMcm(TileMap) → string` encoder. Inverse of `parseMcmNative`, emits standard MAX7456 ASCII with the magic header plus 256 × 64 lines. `pixelToBits` maps arbitrary RGB to the 3-state bit pair (chroma-gray → transparent, luma < 128 → outline, else → glyph fill) so color leaking in from any source flattens to legal 2-bit output.

**Schema — mode isolation via font archive:**

- `src/state/project.ts` — new `OsdMode = "hd" | "analog"` type and required `ProjectDoc.meta.mode` field. Pre-v0.3.0 projects auto-migrate to HD on load.
- New `fontArchive?: { hd?: FontSlice; analog?: FontSlice }` field. When `ModeToggle` flips modes, `switchMode()` archives the current `font` slice under its mode key and swaps in the other mode's archived slice (or a blank). So `doc.font` always represents the currently-active mode's composition — every downstream consumer keeps reading `doc.font` with zero code changes. Two independent projects in one doc.
- Separate `osdLayout.elementsAnalog` map for analog-mode OSD element positions. HD (53×20) and analog (30×16) have different spatial budgets; each mode keeps its own drag-customized layout.

**UI — mode toggle + CRT-phosphor theme:**

- `src/ui/shared/ModeToggle.tsx` — segmented HDZero / Analog switch rendered in the Font tab's left panel, above the base-font drop. Shows each mode's identity: "digital · 53×20 · .bmp" / "MAX7456 · 30×16 · .mcm".
- **Theme swap** — not just accent colors. `:root[data-mode="analog"]` flips all five accents to a phosphor-green palette (`#39ff14` primary, dimmer green secondary, pale-phosphor highlights, warm amber kept for tips), AND rewrites every `bg-slate-950` / `bg-slate-900` / `bg-slate-800` / border-slate to cool-black / faint-green-black neutrals. Commits to the CRT aesthetic rather than just retint. Tailwind's `text-osd-*` / `bg-osd-*` classes resolve through CSS custom properties, so every styled element re-themes without per-file migration.
- **Title swaps** — `hdzero-osd-lab` in HD → `analog-osd-lab` in analog.
- **Font tab** — layers panel: base-drop accept list branches on mode (analog: `.mcm` only), sample dropdown HD-only, tooltip on `+ TTF` explains the 12×18 pixel-font expectation in analog. TTF form shows an analog-mode help block recommending Press Start 2P / PixelOperator / Minogram plus "try Size 10–14". Font preview: canvas dimensions, glyph size, grid overlay, click-to-select all adapt; empty-state copy swaps per mode. Category overlay hidden in analog (the glyph-metadata table is HD-shaped). Zoom is stored **per mode** so switching doesn't carry a 2× analog zoom onto the HD canvas.
- **OSD Preview tab** — renders the mode-appropriate grid. Drag clamping, hit-testing, atlas sprite source all use mode-aware dimensions. `ANALOG_DEFAULT_POSITIONS` map provides a sensible 10-element starter layout for analog (RSSI+LQ top-left, battery stack bottom-left, altitude+timer bottom-right, flight-mode + warnings + crosshairs center) — pilots opt in to more elements and drag them where they want, instead of opening to HD defaults clipping into the smaller grid.
- **Decoration tab** — both logo uploaders (BTFL banner + mini-logo) work in both modes now, with pixel dimensions that swap: 576×144 / 120×36 in HD, 288×72 / 60×18 in analog. Mini-logo is identical in both modes (same Craft Name `[\]^_` trick). BTFL banner tiles land at codes 160..255 in both modes; in analog, on-goggle display requires triggering via Craft Name / Warning text since analog firmware has no `SYM_LOGO` element. The tab header notes this asymmetry.
- **How-To tab** — amber callout at the top in analog mode setting expectations. New "Install on analog (MAX7456 FCs)" section walking through the Configurator Font Manager flow; shown only in analog. The HDZero SD-card install section now shows only in HD mode. "Your first font" section rewritten around the mode-pick step.
- **Top bar download** — label and handler branch on mode. HD writes `BTFL_000.bmp` at the HDZero-expected filename; analog writes `{project-name}.mcm` via the new encoder, sourced by extracting 256 tiles back out of the composed 192×288 atlas.

### Hidden in analog (features that don't apply)

- **Color tints** (per-glyph `TintEditor` in the Glyph Inspector) — MAX7456 is 2-bit monochrome, nothing between black/white/transparent. Tints would preview as color but flatten to monochrome on export, misleading the pilot. Hidden entirely.
- **MCM layer glyph / outline color pickers** — same reason. Analog saves force white/black so the preview matches what the goggle renders.

### Fixed (shipped alongside the analog work)

- **FileDrop file-input doesn't re-fire `change` for the same file.** Classic browser quirk. Clearing `input.value` after each drop so uploading the same `.mcm` into both HD and analog modes (or re-uploading after removing a layer) works. Drag-and-drop already worked; this was the click-to-pick path.
- **`⌫ New` button is now mode-scoped.** Previously wiped the whole `ProjectDoc` including the other mode's archive. Now clears only the active mode's `font` slice + that mode's OSD layout map; the other mode's archived work survives, and `meta.mode` itself is preserved (no kick back to HD from analog).
- **Zoom persists across tab switches and mode switches separately.** Fixed in two steps: first lifted zoom to a signal so switching tabs doesn't unmount it (reported as a general annoyance); then split the signal per mode so an analog 2× zoom doesn't drag HD along at 2×.

### Tests

148 → 182. New cases cover native MCM parse, MCM encoder + round-trip, analog compose (atlas size + layer dispatch + override mismatch behavior), mode field round-trip + migration, `switchMode` isolation, `imageRgbaToTile` analog target. All 21 test files green.

### Bumped

- `package.json` version `0.2.23` → `0.3.0`.

## [0.2.23] - 2026-04-22

### Fixed

- **MCM layers now actually render.** The `+ MCM` button shipped in v0.2.22 created layers correctly, but `useResolvedAssets` was missing a `loadMcmLayers` step — so dropped .mcm files landed in the project as layers but the compositor's MCM case silently skipped them because `assets.mcm` stayed empty. Same "plumbed halfway" shape as the v0.2.12 logo-render bug. Backend support has existed since Phase 1; this release wires the last mile.

### Added — MCM workflow discoverability + empty-state placeholders

- **Base-font drop zone now accepts `.mcm` too.** File-extension branch: `.bmp` → bitmap layer (unchanged), `.mcm` → MCM layer with subset=ALL and default ink colors. Makes whole-font analog → HD conversion discoverable as a first-class action, not a layer trick. The `+ MCM` button in the Layers section stays for partial-subset use cases (letters only, specials only, etc).
- **"No font loaded" placeholder on the Font tab** when the project has zero layers. Dashed-border box occupying roughly the atlas footprint with directions (drop a BMP or MCM, pick a sample) plus a tip pitching the MCM→HD upscale trick so analog-font ports don't stay hidden behind an empty default.
- **"No font loaded" placeholder on the OSD Preview tab** with a tip highlighting the FPV-background feature (DVR still upload or one of four built-in presets — skyscraper dive, mountain surfing, bando, dusk low-light) so pilots know that's available before they even load a font.
- **Removed auto-load of the ondrascz sample font on first visit.** Fresh projects start empty — pilots pick their own base rather than opening to a random default whose relevance isn't obvious. The community sample dropdown in the left panel is still there when they want a starter. `⌫ New` now also lands on the empty state instead of re-seeding a sample.

### Bumped

- `package.json` version `0.2.22` → `0.2.23`.

## [0.2.22] - 2026-04-22

### Added — MCM (analog OSD) layer upload

- **`+ MCM` button in the LayersPanel** opens a file-drop form for .mcm (MAX7456-era analog OSD) fonts. Mirrors the TTF form's shape: file picker, target subset (ALL / characters / letters / lowercase / numbers / specials), glyph color, outline color. Edit pencil on existing MCM layers works the same way as TTF and bitmap.
- **Unlocks MCM → HD BMP conversion** as a one-stop workflow: drop a .mcm, pick "All glyphs", optionally recolor, download `BTFL_000.bmp`. Analog tiles upscale cleanly 2× (nearest-neighbor) into the 24×36 HD slot — no interpolation, pixel-perfect. Means pilots can port a beloved analog aesthetic onto their HDZero goggles without redrawing anything.
- Closes the last unshipped item on the Phase 2.x follow-up queue (originally "MCM layer UI").

### Implementation

- `src/ui/font-editor/McmLayerForm.tsx` — the new form component. Dual-mode (create + edit), structured like `TtfLayerForm` but minus the palette / size / outline-thickness / v-stretch fields since MCM is fixed-size and 2-color.
- `src/ui/font-editor/LayersPanel.tsx` — adds `+ MCM` next to `+ TTF`, tracks `mcmFormOpen` state, renders the form for new + edit flows, includes `layer.kind === "mcm"` in the pencil-edit condition.
- **Zero backend changes.** `parseMcm`, `McmLayer` in the project schema, the `case "mcm"` in `compose()`, and `useResolvedAssets`'s MCM branch have all existed since Phase 1 — this release just hooks a form to the already-wired pipeline. 148 tests still green, no new tests needed since MCM parsing was already covered.

### Bumped

- `package.json` version `0.2.21` → `0.2.22`.

## [0.2.21] - 2026-04-22

### Fixed

- **In-app version tag was hardcoded to `v0.1.0`.** Top bar still displayed the Phase 1 MVP version no matter how far the project had progressed. Wired Vite's `define` to read `package.json`'s version at build time and inject it as `__APP_VERSION__`, which the AppShell top bar now renders. One source of truth — the CHANGELOG, git tag, package.json, and the badge in the UI will never drift again.

### Bumped

- `package.json` version `0.2.20` → `0.2.21`.

## [0.2.20] - 2026-04-22

### Added — Public release prep

- **GitHub Actions build workflow** at `.github/workflows/build.yml`. Runs typecheck + tests + production build on every push and pull request, uploads `dist/` as a downloadable artifact (30-day retention). Unlocks reproducible "deploy a specific commit SHA" for the self-hosted path.
- **README rewritten for a public audience** — status up to date (Phase 2 complete + follow-up queue shipped), quick-start commands, install-on-goggle recipe, tech stack, honest statement of what's next. CI badge links to the new workflow.

### Removed

- `src/ui/decoration/DecorationStub.tsx` — dead placeholder file from early Phase 3 scaffolding. Was never imported; replaced long ago by the real `DecorationPage`. Deleting now so the public repo doesn't ship confusing "coming in v0.3" dead code.

### Bumped

- `package.json` version `0.2.19` → `0.2.20`.

## [0.2.19] - 2026-04-22

### Added

- **Goggle install section in the How-To tab.** Five-step recipe for copying the exported BMP to `resource/OSD/FC/BTFL_000.bmp` on the HDZero Goggles 2 SD card — firmware version check, export, copy, reboot, troubleshooting checklist for the "I did all that and nothing changed" case. Makes the app a one-stop shop from blank canvas to in-flight font without bouncing to another doc.

### Bumped

- `package.json` version `0.2.18` → `0.2.19`.

## [0.2.18] - 2026-04-22

### Added — How-To tab

- **New How-To tab** between Decoration and Resources with a step-by-step walkthrough of the common workflows: your first font, swapping the base font, TTF palette layers, per-glyph overrides + tints, banner + mini-logo, OSD layout + screenshot export, save/reset/undo. Text-first with inline references to actual button and tab names (no screenshots — the UI is small enough that a clear word beats a screenshot that goes stale the first time a label changes). Section anchor links at the top for quick jumps; tab-link buttons inside steps jump straight to the tab being described.

### Cleaned up

- **Decoration tab copy updated** to drop the "Craft Name designer lands with v0.3.0" placeholder. That use case is covered by the existing Craft Name text input on the OSD Preview tab combined with the mini-logo uploader here — no separate visual designer needed. The tab header now points readers at the actual working flow.
- PLAN.md's Phase 2.x follow-up queue marked How-To and project persistence as shipped.

### Bumped

- `package.json` version `0.2.17` → `0.2.18`.

## [0.2.17] - 2026-04-22

### Added — Project persistence across reloads

- **Your project now survives a page refresh.** Layers, OSD layout, custom text (Craft Name etc.), per-glyph tints, logo uploads — everything on the `ProjectDoc` is now serialized to IndexedDB on every mutation and restored on boot. Previously only the binary asset cache persisted; the document itself reverted to the default sample font on every refresh. Closes the last major papercut from the Phase 2.x follow-up queue.
- **New `⌫ New` button in the top bar.** Click it to wipe the current project and persisted state and start fresh on the ondrascz sample font. Requires a confirm — destructive actions need two taps. Uploaded assets stay in the cache so you can re-add them as layers without re-uploading the source files.

### Implementation

- `src/state/project-persist.ts` — separate `hdzero-osd-lab-project` IndexedDB database with a single `project` store keyed by `"current"`. Independent of the `hdzero-osd-lab` assets DB so either can be wiped or migrated without affecting the other.
- `src/state/autosave.ts` — `installAutoSave()` installs a signals `effect()` that debounce-saves on every `mutate()` (300ms default), and `hydrateFromPersistence()` loads the last-saved doc on boot. The effect defers saves until hydration completes so it can't race the load and clobber good data with the in-memory default.
- AppShell's boot sequence now: install autosave → hydrate → only fall back to the sample bootstrap if no saved project was found. Saved projects with zero layers (edge case) still trigger a bootstrap so the canvas isn't blank.
- Corrupt-JSON recovery: if the stored JSON can't parse (e.g. a mid-save crash or a schema mismatch on a downgrade), `loadPersistedProject()` logs a warning and returns null rather than crashing the app on start.

### Tests

- `project-persist.test.ts` — 6 new tests covering empty-store → null, round-trip with layers/tints/custom-text, overwrite semantics, clear, and corrupt-JSON recovery.
- `autosave.test.ts` — 6 new tests covering the hydration flag, pre-hydration save suppression (guards against the clobber race), debounce collapse, and the `resetProjectAndPersistence` path.
- 135 → 148. Build 36.47 KB → 37.23 KB gzipped (+0.76 KB for the persistence + autosave modules and the New button wiring).

### Bumped

- `package.json` version `0.2.16` → `0.2.17`.

## [0.2.16] - 2026-04-22

### Fixed

- **Craft Name and Pilot Name now auto-uppercase**, matching real Betaflight Configurator behavior. HD OSD fonts have letter shapes at codes 65..90 (uppercase) and arrow/icon glyphs at 97..122 (lowercase ASCII). Typing a mixed-case callsign like "WhiteRqbbit" rendered the lowercase letters as arrows — confusing and inconsistent with what a pilot would actually see on their goggles. Now the text input force-uppercases as you type, caret position is preserved so mid-word edits don't jump to the end, and the `effectiveSample()` renderer also uppercases defensively so projects saved before this fix still display correctly.
- Custom Messages stay free-form (no auto-uppercase) — pilots sometimes reach into the 97..122 range on purpose for decoration tricks, and there's no real-hardware parallel to match against.

### Schema

- New `OsdElement.upperCaseOnly?: boolean` flag. Set on `craft_name` and `pilot_name`. Opt-in per element so future additions (serial-driven text etc.) can decide their own case policy.

### Tests

- 135 → 136. New invariant test that `craft_name` and `pilot_name` carry `upperCaseOnly: true` and that Custom Messages don't.

### Bumped

- `package.json` version `0.2.15` → `0.2.16`.

## [0.2.15] - 2026-04-22

### Fixed

- **Dragging an OSD element wiped its `customText`.** The drag-commit mutation rebuilt the element entry with just `{x, y, enabled}`, so any per-element state (Craft Name text, Pilot Name text, Custom Messages) silently reverted to the schema sample when the element was moved. Now spreads `...existing` first so all fields survive a drag. Also future-proofed against any new per-element fields getting silently nuked the same way.

### Bumped

- `package.json` version `0.2.14` → `0.2.15`.

## [0.2.14] - 2026-04-22

### Removed

- INAV logo slot from the Decoration page UI. Almost no HDZero freestyle pilots fly INAV — the slot was page clutter for the common case. **Compositor support stays intact**: `LogoLayer.slot === "inav"` still renders correctly, projects with existing INAV logos will still compose. We just stopped exposing the uploader on the Decoration page. If demand shows up, trivial to re-add as a collapsed "advanced" section.

### Bumped

- `package.json` version `0.2.13` → `0.2.14`.

## [0.2.13] - 2026-04-22

### Added — Banner element in OSD preview + realism toggle

- **BTFL Logo element** (`id: "logo"`, category `decorative`) now available in the OSD element library. Enabling it renders the 24×4 banner from glyph codes 160..255 at its positioned spot on the 53×20 grid. Drag it anywhere, toggle it on/off like any other element. Uploads from the Decoration tab now immediately preview in context.
- **OsdElement.spanRows** optional schema field: elements can declare they occupy multiple tile rows. `sample` stays a flat row-major array (`sample.length === width × spanRows`). The OsdCanvas renderer, drag clamper, hit-tester, and selection-highlight all account for the 2D footprint. Used by the logo element (`spanRows: 4`) and available for any future wide element (e.g. the proper 9×5 artificial horizon down the road).
- **Realism toggle** in the OSD toolbar — a subtle 2px-scanline + deterministic static-noise overlay that approximates FPV goggle video. Off by default. Applied after elements / background but before the selection highlight so the mint outline still reads crisply.

### Added — Tests

- New invariant: every multi-row element's `sample.length` must be divisible by its `spanRows`. 134 → 135.

### Bumped

- `package.json` version `0.2.12` → `0.2.13`.

## [0.2.12] - 2026-04-22

### Fixed

- **Logo layers now actually render.** `useResolvedAssets` was missing a `loadLogoLayers` step, so logo uploads from the Decoration tab would appear in the project's layer list but `compose()`'s `applyLogoLayer` would silently skip them (because `assets.logo.get(layer.id)` was always `undefined`). Classic "plumbed halfway" — backend support has existed since v0.1.0, UI shipped v0.2.11, but the wire between them was missing.
- New `scaleImageToLogoSlot()` helper — decodes the uploaded image via `createImageBitmap`, letterboxes it into the exact slot dimensions (576×144 / 240×144 / 120×36) preserving aspect ratio, letterbox bars are chroma-gray so they stay transparent on-goggle. Handles PNGs with per-pixel alpha by compositing onto chroma-gray first so transparent PNG regions resolve to the goggle's transparent color.
- Logo layer errors now also surface via `layerErrors` the same way bitmap/TTF errors do — missing assets, decode failures, canvas issues all get a red-outlined layer row with the error message.

### Bumped

- `package.json` version `0.2.11` → `0.2.12`.

## [0.2.11] - 2026-04-22

### Added — Decoration tab with logo-slot uploaders

- `DecorationStub` replaced with a real `DecorationPage` that wires up the compositor's existing `LogoLayer` support so users can upload banner / mini / INAV logos:
  - **BTFL Logo (576×144)** — the big BETAFLIGHT-style banner. Shown when Betaflight's Logo OSD element is enabled, typically at startup / disarmed.
  - **Mini Logo (120×36)** — 5-tile inline logo at glyph codes 91..95. Show in flight by setting your Craft Name to <code>[\\]^_</code>.
  - **INAV Logo (240×144)** — INAV firmware equivalent of the BTFL banner.
- Each slot shows size guidance (exact target dimensions, aspect-fit behavior, chroma-gray transparency note, high-contrast-reads-best tip) so users know what they're designing for before they generate an image.
- Upload adds a `LogoLayer` to `project.font.layers`; replacing an image removes the old layer for that slot and pushes the new one (one logo per slot). Clear removes the slot's layer.
- Same IndexedDB asset path as everything else — logos persist across reloads once the project-persistence layer lands.
- Placeholder section for the full Craft Name designer tagged v0.3.0 so users know it's the next headline.

### Fixed

- Sample-font dropdowns in `LayersPanel.SampleFontPicker` and `BitmapLayerForm` no longer use a `disabled` placeholder option. After loading a sample the dropdown still resets to a visible "Pick a font…" label but it's now selectable rather than appearing locked — addresses the "greyed out / looks saved" impression when re-opening the picker.

### Changed

- Decoration tab no longer carries a `v0.3` phase badge. Logo uploaders shipping in this commit means the tab is a live feature, not a scheduled stub.

### Bumped

- `package.json` version `0.2.10` → `0.2.11`.

## [0.2.10] - 2026-04-22

### Added — Edit bitmap layers in place

- **✎ pencil button** now appears on bitmap layer rows (previously TTF-only).
- New `BitmapLayerForm` lets users swap the underlying BMP without losing the layer's stack position. Replace via file drop, via the built-in sample-font dropdown, or change the target subset (ALL / BTFL_LETTERS / BTFL_NUMBERS / BTFL_SPECIALS / BTFL_CHARACTERS / BTFL_LOGO / BTFL_MINILOGO) — all without deleting and re-adding.
- Save only commits when something actually changed (prevents no-op undo entries).
- The source picker shows the "pending" new file before commit, with an **undo** link to revert the replacement choice if the user reconsiders mid-flow.

### Bumped

- `package.json` version `0.2.9` → `0.2.10`.

## [0.2.9] - 2026-04-22

### Added — Layer reordering

- **▲ / ▼ buttons** on every layer row in the Font tab's sidebar. Move layers up (toward the top of the compositing stack — wins more at shared glyph codes) or down (toward the base). Disabled at the boundaries.
- `moveLayerUp()` / `moveLayerDown()` mutations in `LayersPanel` swap adjacent entries in `project.font.layers`. Each move is one undo step.

### Changed

- **Layers list now displays top-of-stack first** (Photoshop / Figma convention). The compose order in the project doc is unchanged — array index 0 is still the base, last index is still the most-visible layer. We only reversed the *display* order so "top of list" and "top of the stack" match intuitively. Previously they were opposite, which is why deleting + re-adding a base font caused it to quietly end up on top of everything else.
- Added a one-line hint above the list when there are ≥ 2 layers: "Top of list = top of the stack (wins over lower layers at shared glyph codes)."

### Bumped

- `package.json` version `0.2.8` → `0.2.9`.

## [0.2.8] - 2026-04-22

### Added — OSD preview export

- **↓ PNG** button in the OSD toolbar — saves the current composed OSD view (font + element layout + optional FPV background + any color tints) as a PNG, named after the project's `meta.name`. Ready-to-share.
- **⧉ Copy** button — copies the same PNG straight to the clipboard via `navigator.clipboard.write(new ClipboardItem(...))`. Paste directly into Discord / Reddit / Photoshop. Falls back gracefully with a message if the browser lacks the ClipboardItem API.
- Transient status message in the toolbar confirms "copied to clipboard" / "PNG downloaded" / error messages for 1.8 s after each action.

### Notes

- Chrome / Edge / Firefox 94+ / Safari 13.4+ all support the Clipboard API image write. On HTTP (not HTTPS) contexts the API is restricted, but localhost is fine.
- PNG export captures the canvas at its native 1272×720 resolution regardless of the "Fit width" display toggle, so shared screenshots are full quality.

### Bumped

- `package.json` version `0.2.7` → `0.2.8`.

## [0.2.7] - 2026-04-22

### Added — Exploded-format BMP support

- `normalizeHdOsdFont()` in `src/loaders/bmp.ts` — transparently implodes the 486×1350 exploded layout (16 cols × 32 rows with 6px gaps + 6px outer border — the format community editors often save to for hand-editing) down to the compact 384×1152 layout the compositor expects. Compact inputs pass through unchanged. Other dimensions throw a descriptive error.
- `useResolvedAssets.loadBitmapLayers` now calls through `normalizeHdOsdFont` for every bitmap layer, so dropping an exploded community font like "HDZero Font Mario.bmp" (486×1350) now just works.
- Bitmap loader also got the same per-layer error routing TTF had in v0.2.3 — dimension-mismatch errors land in `layerErrors[layer.id]` and show up in the LayersPanel as a red row with the message.

### Added — Tests

- 3 new cases for `normalizeHdOsdFont`: compact passthrough (same reference back), exploded implode with per-tile color verification on sampled positions, dimension rejection. Total: 131 → 134.

### Notes

- Dropped two community fonts (`BTFL_analog_default_v1.0.0.bmp` and `BTFL_slappyfpv_graffiti_v1.0.0.bmp`) in v0.1.7 because they shipped in exploded format and we didn't handle it. Those can now be re-added as bundled samples in a future patch.

### Bumped

- `package.json` version `0.2.6` → `0.2.7`.

## [0.2.6] - 2026-04-22

### Changed

- **TTF layer size** now accepts values up to **60** (was 40). The browser Canvas rasterizer handles the extra range fine; past ~60 the supersampled working canvas (`size * 8`) starts clipping characters, which is why the cap isn't higher yet.
- **Auto-bootstrap on first visit**: when the app mounts with no font layers, the `ondrascz-color` sample is loaded automatically as the base. Canvas has something to render right away instead of a chroma-gray blank. The "Load sample" picker still works for swapping to a different starter. Behavior is conditional on `project.font.layers.length === 0` — when persistence lands in v0.3.x this will become a `meta.initialized` flag check so returning users aren't clobbered.
- **`src/state/bootstrap.ts`** — shared `addSampleFontAsBaseLayer(filename, displayName)` helper. Both the `LayersPanel` "Load sample" button and the `AppShell` first-run bootstrap call through it; keeps behavior consistent.

### Added — PLAN.md follow-up roadmap

- New "Phase 2.x — Post-v0.2 follow-ups" section captures the queue of small user-requested improvements: **How-To tab** (in-app step-by-step guide for first-time visitors, sits next to Resources), HDZero library browser, logo/mini-logo uploader, MCM layer UI, project persistence across reloads, palette RNG seed control.

### Bumped

- `package.json` version `0.2.5` → `0.2.6`.

## [0.2.5] - 2026-04-22

### Added — Per-glyph color tints

- Click any glyph on the Font tab → the **Glyph Inspector** panel now has a **Color tint** section with a native color picker + hex input + clear button. Pick a color; the selected glyph's non-transparent pixels get multiplied by it in the final composed atlas. Works regardless of what drew the tile — base bitmap, TTF layer, image override — tints always run last.
- Multiplicative blend model: `(r,g,b) × (tr,tg,tb) / 255` per channel. Outlines stay dark, fills take the hue, mid-gray becomes a darker variant of the target. Feels like actual tint not a flat repaint.
- `ProjectDoc.font.tints?: Record<number, HexColor>` — optional so v0.2.4-and-earlier projects load cleanly.
- `tintTileInPlace()` helper in `src/compositor/atlas.ts` with proper 255-aware rounded divide (classic `(x * 257 + 0x8080) >>> 16` trick) so 255 × 255 = 255 exactly.

### Added — Tests

- 5 new test cases for `tintTileInPlace`: white × red = red, chroma-gray passthrough, black outlines stay black under any tint, mid-gray becomes darker variant, out-of-range codes are ignored. Total: 126 → 131.

### Bumped

- `package.json` version `0.2.4` → `0.2.5`.

## [0.2.4] - 2026-04-22

### Added — Edit existing TTF layers

- Each TTF layer row in the LayersPanel now has a **✎ edit** button next to the × delete button. Clicking it opens the same TTF form inline, pre-filled with that layer's current settings, so users can tweak size / outline / vStretch / glyph & outline colors / palette without re-uploading the font file.
- Save replaces the layer in place (same id, same asset) so the compositor re-renders with the new config. Cancel leaves the layer untouched.
- The "+ TTF" button is context-aware: it toggles the create form and closes any in-progress edit; the edit form closes any in-progress create. Single active form at a time.

### Notes — deferred per-glyph features

User also asked for per-glyph edits within a layer ("change just that letter, or just that color"). That splits into two separate data-model changes we'll ship later:

- **Per-glyph character override** — user selects code 65 (A) and types a replacement character to render there instead. Today this is partially achievable via the existing `-glyph` image-override mechanism (render 'Z' to a PNG somewhere, override code 65 with it), but a native "just type a letter" shortcut would be cleaner.
- **Per-glyph color pin in a palette layer** — in a palette TTF layer, lock specific codes to specific colors while the rest stay random. Needs a `TtfLayer.pinnedColors: Record<number, HexColor>` addition and a click-to-pin UI.

Both are v0.2.5+ — the design for pinning interacts with the RNG seed story and deserves its own commit.

### Bumped

- `package.json` version `0.2.3` → `0.2.4`.

## [0.2.3] - 2026-04-22

### Fixed

- **TTF rasterization wasn't actually using the uploaded font.** `rasterizeTtfSubset` added the `FontFace` to `self.fonts` then immediately set `ctx.font`, but some browsers don't propagate a newly-added face to a canvas context synchronously — so the canvas silently rendered with the default sans-serif fallback, and the "TTF layer" looked like it had no effect. Now explicitly `await fontSet.load("<pxSize>px <family>")` after adding the face, forcing the runtime to finish registering the font before we draw with it. Also switched from `self.fonts` to `document.fonts` on the main thread for clarity (falls back to `self.fonts` inside workers).

### Added — per-layer error surfacing

- `useResolvedAssets` now exposes a `layerErrors: Signal<Record<string, string>>` map. When a layer's asset is missing from IndexedDB or its rasterization throws, the error string goes into the map keyed by layer id.
- `LayersPanel` renders each errored layer with a red outline and an inline `⚠ <message>` line. While a TTF layer is mid-render, it shows an amber "Rendering…" hint so users aren't confused by the ~300–800 ms first-render latency.

### Bumped

- `package.json` version `0.2.2` → `0.2.3`.

## [0.2.2] - 2026-04-22

### Added — TTF palette layer support (the headline WhiteRqbbit feature)

- **"+ TTF" button** in the LayersPanel. Clicking it opens an inline form for adding a TrueType/OpenType layer to the current project.
- Form fields mirror the Python fork's CLI args: target subset (Letters / Numbers / Specials / Lowercase-to-upper / All Characters), font size, outline thickness, vertical stretch, glyph color, outline color. Values have sensible defaults (22 px, 1.0 outline, 1.0 stretch, off-white on black).
- **Comma-separated palette** accepted in the glyph color field: `#00FFAA,#00FFFF,#FF00FF,#FFB000` renders a random color per glyph — the WhiteRqbbit signature scatter look. Single hex still works.
- **"Use WhiteRqbbit palette"** one-click link pre-fills the four-color palette.
- `useResolvedAssets` now loads TTF layers: fetches the TTF bytes from IndexedDB, calls `rasterizeTtfSubset` with the layer's config, caches the resulting `TileMap` in `assets.ttf` keyed by layer id (so the same TTF can be used at multiple sizes/colors across different layers). Failures log to console but don't break the other layers.

### Notes

- TTF rasterization runs in the browser via `FontFace` + `OffscreenCanvas`. First render per layer is ~300-800 ms depending on subset size + supersampling (default 8×); subsequent renders are fast.
- `project.meta.rngSeed` is null by default, so palette layers shuffle fresh every time `useResolvedAssets` re-runs. If you want a deterministic palette roll, a seed UI will land in a future patch.
- Tests unchanged at 126 — TTF rasterization has structural tests only (full pixel-level would need a headless browser harness).

### Bumped

- `package.json` version `0.2.1` → `0.2.2`.

## [0.2.1] - 2026-04-22

### Added — Resources tab

- New fourth tab **Resources** — curated jump-off point for pilots who want to customize their OSD but don't know where to find assets. Groups links into five sections:
  - **Community font libraries** (HDZero library, ondrascz's original Python tool, BF Configurator source)
  - **Icons & sprites** for per-glyph overrides (game-icons.net, SVG Repo, OpenGameArt, Heroicons, Iconify)
  - **Typefaces** for future TTF palette layers (Google Fonts, JetBrains Mono, DaFont, Font Squirrel)
  - **Format & firmware reference** (BF osd_symbols.h, osd_elements.c, HDZero docs, MAX7456 datasheet)
  - **Community** (Intofpv, r/fpv, BF discussions)
- Each link shows a one-line note + license tag where applicable.
- `LayersPanel` and the per-tab right sidebars are hidden on the Resources tab for full-width reading.
- `src/ui/resources/ResourcesPage.tsx` — all static content, no state, zero project dependencies.

### Changed

- Removed the `v0.2` tag badge from the OSD Preview tab in the `TabBar` — Phase 2 shipped, no longer "scheduled".

## [0.2.0] - 2026-04-22 — Phase 2 "OSD Live Preview" complete

Phase 2 is done. The OSD tab is a fully-interactive real-time simulator of what a Betaflight HD OSD will look like over live video, built on top of the v0.1.x compositor. Key wins:

- **63 OSD elements** with author-curated default positions and plausible live-value samples — approaches 1:1 parity with stock Betaflight's OSD tab.
- **Live font rendering** — edits on the Font tab show up immediately in the OSD preview using the composed font as a sprite atlas. Chroma-gray pixels are treated as transparent, matching goggle compositing.
- **Drag-to-reposition** with snap-to-grid, clamping to the 53×20 canvas, one undo entry per drop.
- **Click-to-select** with neon-mint highlight box on the canvas and in the sidebar.
- **Element library sidebar** with 7 categories (RC / Power / Nav / Flight / Timer / Status / Decorative), bulk "All on" / "All off" / "Reset to defaults" buttons.
- **Selected-element inspector panel** at the top of the sidebar with a live text input for freeform slots (Craft Name, Pilot Name, 4 Custom Messages, Serial Text). Type your callsign, watch it render against your font instantly.
- **FPV background upload** — drop any PNG/JPG; persisted via IndexedDB across reloads.
- **4 background presets** (Skyscraper dive / Mountain surfing / Bando / Dusk low-light) — drop AI-generated or user-provided images into `public/fpv-backgrounds/` and click to load.
- **Optional Dim slider** and solid-color bg fallback for when no image is present.

### Final tweaks in this tag commit

- Renamed the `waterfall` preset to `mountain-surfing` to match the user's sourced imagery.
- Bumped `package.json` version `0.0.0` → `0.2.0`.

### Totals

126 tests, typecheck clean, 27.32 KB gzipped production bundle. Source code around 3,800 lines of TypeScript across compositor, loaders, encoders, state, osd-schema, and ui modules.

### Next

- **v0.3.0** — Decoration Generator. Visual Craft Name and post-flight warning-message designers that produce the exact 15-char string to paste into Betaflight Configurator.
- Or minor v0.2.x follow-ups for papercuts + features: TTF palette layer UI (bring the Python fork's headline feature into the web app), HDZero library browser, logo preview panel.

## [0.2.0-alpha.8] - 2026-04-22

### Changed

- **Warnings element re-enabled** by default and repositioned to `(21, 13)` — horizontally centered (sample is 11 chars, `(53-11)/2 = 21`) and vertically between the crosshair at y=9 and the flymode label at y=18. Important to see how a font handles the warning text ("LOW VOLTAGE") against different backgrounds.

### Added

- **FPV background presets** section in the OSD sidebar. Four labeled buttons for the scene archetypes:
  - **Skyscraper dive** — gorilla-whooping big-building descent
  - **Cinematic waterfall** — nature fly-through
  - **Bando** — abandoned warehouse interior
  - **Dusk low-light** — tricky low-contrast readability test
- Each preset fetches `public/fpv-backgrounds/{file}`. If the file isn't present, a helpful alert shows the suggested AI-generation prompt and the expected filename.
- `public/fpv-backgrounds/README.md` — full prompt recipes for each preset, notes on resolution (≥1280×720, 1920×1080 preferred), and a licensing note explaining why the repo doesn't bundle AI-generated imagery.

### Notes

- No images are bundled in the repo. Users generate with their preferred AI tool, drop the files into `public/fpv-backgrounds/`, and the preset buttons light up. Clean licensing story.

## [0.2.0-alpha.7] - 2026-04-22

### Changed — Minimal starter layout

- Reduced default-enabled elements from 17 to **10** and repositioned them as a corner-spread starter layout that exercises every font category without visual clutter:
  - **Top-left**: RSSI (1,1) + Link Quality (1,2)
  - **Top-center**: Craft Name (21,1)
  - **Center**: Crosshairs (25,9)
  - **Bottom-left**: Battery Voltage (1,15), Avg Cell Voltage (1,16), Battery Usage bar (1,17)
  - **Bottom-right**: Altitude (45,15), Timer 1 (46,16)
  - **Bottom-center**: Flight Mode (24,18)
- Turned OFF by default: `current_draw`, `mah_drawn`, `warnings`, `disarmed`. Kept available in the library — one click to re-enable.
- Each category represented: icon-only (crosshairs), icon+digits (voltages, altitude, timer, RSSI), pure text (craft name, flymode), progress bar (battery usage). Makes font-evaluation glance-testable across the full glyph vocabulary in one view.

### Notes

- The existing `mutate((doc) => doc.osdLayout.elements = {})` reset flow in the "Reset to defaults" sidebar button now reverts to this new tighter layout.
- Users with saved projects from earlier v0.2.0-alpha.x builds keep their old layouts; the cleanup is a default-for-new-projects change only.

## [0.2.0-alpha.6] - 2026-04-22

### Fixed

- `main_batt_usage` ("Battery Usage") now renders the **graphical progress-bar** that real Betaflight Configurator ships (codes `SYM_PB_START` 0x8A through `SYM_PB_END` 0x8E). The previous sample used four `SYM_BATT_FULL/EMPTY` cell icons — that combination isn't an OSD element in actual Betaflight; cell icons are used internally as the dynamic prefix for `avg_cell_voltage` only. Default position moved to (10,15) and default-enabled since virtually every BF layout uses this element.

### Notes

- Spotted by a real BF Configurator screenshot comparison. Good example of why v0.2.0 + screenshots-against-truth is the right iteration rhythm.

## [0.2.0-alpha.5] - 2026-04-22

### Added — Full-ish BF element parity + editable text

- **~30 new OSD elements**, bringing total to 63. Covers the remaining common Betaflight slots: artificial horizon + sidebars, pitch/roll angles, vario, G-force, ESC temp/RPM/freq, motor diag, power (W), watt-hours drawn, efficiency, flight distance, yaw PIDs, PID/rate/profile/battery profile names, VTX channel, RSNR, TX uplink power, aux value, RC channels, stick overlays (L/R), up/down reference, remaining flight time, ready mode, total flights, 4 custom messages, serial text.
- **Schema fields** `editableText?: boolean` and `maxTextLen?: number`. Marks craft name (15), pilot name (15), 4 custom messages (20 each), and serial text (30) as freeform text slots.
- **ProjectDoc.osdLayout.elements.customText** — optional per-element text override persisted with the project.
- **Selected-element panel** at the top of the OSD element library (right sidebar). Shows element name, close button, and — for text-editable elements — a live-updating input. Typing the pilot's callsign into Craft Name now reflects in the canvas immediately; clearing the field reverts to the sample.
- `effectiveSample()` helper in `OsdCanvas` — resolves the glyph sequence for an element, honoring `customText` when set. Non-printable characters fall through to space. Drag clamping and hit-testing use the effective width so editing a long custom name still drags correctly.

### Changed

- Renamed `flight_time` → `item_timer_1` and `on_time` → `item_timer_2` to match Betaflight's actual enum naming (`OSD_ITEM_TIMER_1/2`). Pre-1.0 breaking change, but layout data hasn't been persisted across reloads for any long-running projects yet.

### Notes

- Tests: 125 → 126 (+1 editable-text invariant). Count floor bumped from 25 → 60.
- Remaining gaps vs. full BF enum: waypoints (iNav/INAV-leaning), HDZero-specific system stats (goggle voltage, VTX temp, fan speed), lap timers, camera frame, adjustment_range, debug. All niche — will add as users request them.

## [0.2.0-alpha.4] - 2026-04-22

### Added — FPV background image

- `ProjectDoc.osdLayout.background` (optional `AssetRef`) — the OSD preview can now carry a user-supplied FPV still frame that persists via IndexedDB across reloads, same storage path as font bitmaps.
- `useResolvedAssets` now also decodes the background image to an `ImageBitmap` and exposes it as a `bgImage` signal. Cleans up prior bitmaps on replacement to avoid leaks.
- `OsdCanvas` draws the FPV image first (cover-fit, preserves aspect) then the solid-color fallback is behind it, then the OSD elements on top — matches how real goggles composite the font over video. Chroma-gray in the atlas stays alpha-cleared so the FPV image shows through where the OSD would be transparent.
- **Dim slider** (0–85%) appears in the OSD toolbar whenever a bg image is loaded. Pulls the FPV footage down toward black so the OSD text reads cleanly against bright backgrounds.
- `ElementLibrary` gained an "FPV background" section: drop zone to upload, preview of the current file name, Replace / Clear buttons.

### Notes

- Next: v0.2.0 final polish pass — maybe an "element-under-cursor" hover status, a couple of BF-style layout presets, and any last papercuts. Then the tag.

## [0.2.0-alpha.3] - 2026-04-22

### Added — Interactive OSD layout editor

- **Drag-to-reposition** on the OSD canvas. Click-and-drag any rendered element to move it; the new position commits on pointer up as a single undo entry (the intermediate drag frames don't pollute the undo stack). Elements are clamped to the 53×20 grid so they can't be dragged off-screen. Uses pointer events with `setPointerCapture` for smooth behavior and a native "grab" / "grabbing" cursor.
- **Selection highlight** — clicking any element on the canvas (or in the library) draws a neon-mint box around it, matching the Font tab's glyph-selection style.
- **Element library sidebar** (`src/ui/osd-preview/ElementLibrary.tsx`) — right-side panel on the OSD tab, showing all 33 elements grouped by category (RC link / Power / Navigation / Flight / Timers / Status / Decorative). Each row has an enable checkbox, label, and its current grid position. Click the row to select the element on the canvas.
- **Bulk controls:** "All on", "All off", "Reset to defaults" buttons at the top of the library. Reset wipes `project.osdLayout.elements` entirely, falling back to the schema defaults.

### Changed

- `AppShell` now renders `<ElementLibrary />` as the right column on the OSD tab (the slot `InspectorPanel` uses on the Font tab).

### New state

- `selectedOsdElement: Signal<string | null>` added to `src/state/ui-state.ts`. Shared between the library and the canvas so clicking either stays in sync.

### Notes

- Live drag updates a local `drag` state without touching the project doc; the `mutate()` that writes `osdLayout.elements[id]` runs once on pointer-up. This keeps the undo stack clean (one drag = one undo step) and avoids IndexedDB churn during motion.
- alpha.4 work: FPV background image upload + a small status line showing "element under cursor" for better targeting. Then v0.2.0 tag ships.

## [0.2.0-alpha.2] - 2026-04-22

### Added — OSD canvas renderer

- `src/ui/osd-preview/OsdCanvas.tsx` — the OSD tab is now a **live, reactive 53×20 simulator** (1272×720 native, scaled to fit). Each enabled element from `OSD_ELEMENTS` blits its sample glyph sequence against the currently-composed font atlas.
- Chroma-gray pixels in the atlas are treated as transparent so the background color shows through, matching real goggle compositing.
- Background dropdown: `Chroma-gray` (default), `Dark (sky)`, `Trees (dark green)`, `Black` — quick way to preview your font over various FPV conditions without uploading an image.
- "Fit width" toggle so you can view at native 1:1 or scale to container.
- Element count in the status line: "N of 33 elements enabled".
- Effective-position resolver: elements with no entry in `project.osdLayout.elements` fall through to their schema defaults, so a fresh project shows a sensible stock-BF layout immediately.

### Changed

- `AppShell` OSD tab now mounts `<OsdCanvas />` instead of the placeholder stub from v0.1.2.

### Notes

- alpha.2 is read-only: no drag, no selection. alpha.3 adds the element library sidebar + drag-to-reposition so you can tailor the layout.

## [0.2.0-alpha.1] - 2026-04-22

### Added — Phase 2 OSD schema

- `src/osd-schema/elements.ts` — data table of 33 common Betaflight OSD elements (craft name, RSSI, LQ, battery voltage, avg cell voltage, current, mAh, altitude, home dist/dir, GPS sats/speed/lat/lon, heading, compass bar, throttle, flymode, disarmed, warnings, crosshairs, flip arrow, flight time, on time, PID rows, temperature, blackbox log, etc). Each entry has an id matching the upstream `osd_items_e` enum, human label, category, default 53×20-grid position, enabled-by-default flag, and a `sample` glyph-code array that the live preview will blit (e.g. battery voltage's sample is `SYM_MAIN_BATT + "16.4" + SYM_VOLT` = 6 codes).
- `src/osd-schema/elements.test.ts` — 8 cases covering count stability, grid-bounds invariants for every default position, horizontal fit at default, id uniqueness, category coverage, sample-code range invariants, and lookup by id.
- `OSD_GRID` constant (53×20) — the HD OSD simulator dimensions.

### Notes

- This is the data layer of v0.2.0. Next two commits wire it into a live canvas renderer + draggable element library + FPV background. The v0.2.0 tag itself lands when the OSD tab has a working interactive preview.
- Table covers the ~33 most-flown elements; the full Betaflight enum includes another ~70 entries (waypoints, goggle-side stats, lap timers) that are additive and can ship in v0.2.x patches without changing the schema shape.

## [0.1.8] - 2026-04-22

### Changed

- `FontPreview` default BG is now **Chroma-gray (raw)** instead of Dark. Looked better on inspection; the dark/navy/black options remain one click away in the toolbar dropdown.
- `InspectorPanel` tile close-up renders chroma-gray as-is too, matching the preview canvas.

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

## [0.1.1] - 2026-04-21

### Added

- `src/state/ui-state.ts` — ephemeral (non-project) UI signals. First entry: `selectedGlyph` (`Signal<number | null>`).
- Click-to-select on the `FontPreview` canvas: click a tile → sets `selectedGlyph`, draws a neon-mint outline around it; click again to toggle off.
- `LayersPanel` override adder is two-way-bound to `selectedGlyph`: clicking a glyph in the preview auto-fills the code input; typing a number highlights that tile in the preview.
- Selection status shown in the preview toolbar ("▸ Selected glyph #NNN" with a clear button).

## [0.1.0] - 2026-04-21 — Phase 1 "Compositor MVP" complete

### Added — UI shell

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

### Added — State, undo, assets, persistence

- `src/state/store.ts` — reactive project signal (`@preact/signals`). `mutate(fn)` takes a draft-mutator, auto-updates `meta.updatedAt`, and pushes the previous doc onto the undo stack. Exports `undo`, `redo`, `canUndo`, `canRedo`, `replaceProject`, `resetStore`.
- `src/state/undo.ts` — generic snapshot-based `UndoStack<T>` with configurable limit (default 100 snapshots). `structuredClone` keeps each snapshot independent without an Immer dep.
- `src/state/assets.ts` — IndexedDB-backed blob cache keyed by SHA-256. `hashBytes`, `putAsset`, `getAsset`, `deleteAsset`, `listAssets`, `evictUnused(keep)` for garbage-collecting referenced-but-absent assets. Handles SharedArrayBuffer-hostile TS strict mode.
- `src/state/persistence.ts` — `projectToJson` / `projectFromJson` with `schemaVersion` validation and guard rails for malformed input.
- `fake-indexeddb` wired as a dev dependency; `src/test/setup-indexeddb.ts` polyfills IndexedDB into jsdom for unit tests.
- Test coverage: +26 cases (undo 6, store 7, assets 8, persistence 5). Total project: 102 tests, all green. Typecheck clean.

### Notes

- Phase 1 backend is now complete: compositor + loaders + state all land. Next commit brings the UI shell that wires everything into an interactive editor — ships as v0.1.0.

## [0.0.4] - 2026-04-21

### Added — Loaders

- `src/loaders/bmp.ts` — `decodeBmp(ArrayBuffer | Uint8Array) → RgbImage`. Reads 24-bit BI_RGB v3 BMPs, handles both bottom-up and top-down row order, always returns top-down RGB. Round-trip-tested against `writeBmp24` on a 384×1152 atlas byte-for-byte.
- `src/loaders/mcm.ts` — `parseMcm(text, opts)` parses MAX7456 .mcm analog OSD fonts (256 glyphs, 12×18 px at 2 bits/pixel, `"00"`/`"10"`/else → outline/glyph/transparent), upscales each 2× into 24×36 HD tiles. Custom glyph + outline colors via `opts.glyphColor` / `opts.outlineColor` hex.
- `src/loaders/image-to-tile.ts` — `imageRgbaToTile(RgbaImage, opts)` scales any RGBA image to fit 24×36 preserving aspect, centers on chroma-gray, supports optional `tintColor` and alpha compositing. Pure function, fully tested. `imageElementToTile(ImageBitmapSource)` is the browser-only convenience that pipes through an OffscreenCanvas first.
- `src/loaders/ttf.ts` — `rasterizeTtfSubset(ArrayBuffer, opts) → Promise<TileMap>`. Ports fontbuilder.py's supersampled TTF pipeline to the browser via `FontFace` + `OffscreenCanvas` + thickness-disc outline stamping. Vitest coverage is intentionally limited to argument validation — full pixel-level tests require real Canvas and will land with Playwright smokes.
- Test coverage: +24 cases (BMP decoder 6, MCM 6, image-to-tile 6, TTF validation 6). Total project: 76 tests, all green. Typecheck clean.

## [0.0.3] - 2026-04-21

### Added — Compositor core + BMP encoder

- `src/encoders/bmp.ts` — `writeBmp24(RgbImage) → Uint8Array`. Produces a byte-level-correct 24-bit BMP v3 with proper BITMAPFILEHEADER + BITMAPINFOHEADER, BGR byte order, bottom-up rows, 4-byte row alignment. 384×1152 atlas writes as exactly 1,327,158 bytes (same as pygame's output for SD-card compatibility).
- `src/compositor/palette.ts` — `parseHex(hex)`, `createRng(seed)`, `resolveColor(palette, rng)`. xorshift32 for deterministic seeded RNG; `null` seed falls through to `Math.random` (matches Python fork's default per-build shuffle).
- `src/compositor/atlas.ts` — low-level buffer ops: `createAtlas`, `createTile`, `fillRgb`, `blitTile`, `extractTile`, `blitRgbaRegionIntoAtlas` (with full alpha compositing). `TILE_BYTES=2592`, `ATLAS_BYTES=1,327,104` exported for test assertions.
- `src/compositor/compose.ts` — `compose(ProjectDoc, ResolvedAssets, opts?) → Uint8ClampedArray`. Pure function, no DOM. Applies enabled layers in order; bitmap layers extract subset tiles from 384×1152 sources; mcm/ttf layers consume pre-rendered `TileMap`s from the loaders module; logo layers use the exact strip-wrapping layout from `fontbuilder.py` for `btfl` (576×144), `inav` (240×144), and `mini` (120×36) slots. Overrides always win, applied last.
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
