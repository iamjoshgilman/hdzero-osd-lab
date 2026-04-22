# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
