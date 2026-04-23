# hdzero-osd-lab

Browser-based studio for designing OSD fonts for Betaflight quads — both color HD fonts for HDZero goggles and monochrome MCM fonts for analog MAX7456 flight controllers. Two builds in one project; flip a toggle to switch.

100% client-side — no server, no accounts, no telemetry. Your fonts and uploads live in your own browser. Bundle is ~53 KB gzipped.

[![build](https://github.com/iamjoshgilman/hdzero-osd-lab/actions/workflows/build.yml/badge.svg)](https://github.com/iamjoshgilman/hdzero-osd-lab/actions/workflows/build.yml)

## What it does

**Mode toggle** — pick HDZero (24×36 color, 53×20 OSD grid, exports `.bmp`) or Analog (12×18 monochrome, 30×16 grid, exports `.mcm`). The whole UI re-themes — HD is neon/digital, analog is phosphor-green CRT. Mode state is isolated per project so you can build both a color HD font and a monochrome analog font in parallel without the layer lists bleeding.

**Font composition** — stack any combination of:
- **Base fonts**: 384×1152 BMPs (HD) or `.mcm` files (either mode).
- **TTF layers**: drop a TrueType/OpenType font, pick a subset (letters, numbers, specials), rasterize with palette colors (random per glyph from a hex list) in HD or native 12×18 in analog.
- **PNG glyph overrides**: per-tile icon replacements, aspect-fit scaled and centered.
- **Logo slots**: BTFL banner + inline mini-logo. Both work in both modes (different pixel dims).
- **Color tints** (HD only): per-glyph multiplicative color pass for recoloring white icons.
- **In-browser pixel editor**: edit any single glyph from the Inspector or draw a mini-logo from Decoration. Pencil / eraser / fill / eyedropper, HSL shade row + presets in HD, three-state palette in analog. Saves through the existing override / logo-layer pipeline.

**Live OSD preview** — 53×20 or 30×16 simulated Betaflight OSD with all 64 elements drag-positionable over an FPV still background (upload your own DVR frame or pick a preset). Element text (Craft Name, Pilot Name, Custom Messages) is fully editable and auto-uppercases where Betaflight does.

**Export** — goggle-ready `BTFL_000.bmp` (HD) or `.mcm` (analog). Drops straight onto the SD card or into Betaflight Configurator's Font Manager.

**Project persistence** — auto-saves to browser IndexedDB. Close the tab, come back later, your work is still there. Both mode archives survive reloads.

The in-app **How-To tab** walks through the common workflows end-to-end (first font → install on goggle or FC) and adapts its copy per mode. The **Resources tab** links to the community font libraries this tool was built around.

## Quick start (local dev)

Requires Node 20+.

```bash
npm ci
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run typecheck  # TypeScript strict-mode check
npm run test:run   # vitest, headless
npm run build      # production build → dist/
npm run preview    # preview the production build
```

## Installing on the goggle / FC

**HDZero Goggles 2** (HD mode): export `BTFL_000.bmp`, drop it on the SD card at `resource/OSD/FC/BTFL_000.bmp`. Requires goggle firmware ≥ 7.66.120. No menu setting — the goggle auto-loads on next boot.

**Analog (MAX7456 FCs)**: export `{project}.mcm`, open Betaflight Configurator → OSD tab → Font Manager, Upload + Flash.

Full walkthroughs (with troubleshooting) live in the in-app How-To tab.

## Status

Current release **v0.3.2**. Both HDZero and analog Betaflight targets are first-class (Phase 3, v0.3.0). v0.3.1 added an in-browser pixel editor for single glyphs and mini-logos. v0.3.2 was an audit-driven polish pass — race-condition fixes, persistent error banner for storage failures, modal focus trap + aria-labels, runtime shape validation on JSON / IndexedDB reads, inline errors throughout (no more `alert()` dialogs).

Earlier phases delivered the HD compositor, live OSD preview with drag-to-position, and the full Phase 2.x polish queue (logo uploader, per-glyph tints, realism toggle, project persistence, How-To tab, MCM workflow).

See [CHANGELOG.md](CHANGELOG.md) for the per-release detail and [PLAN.md](PLAN.md) for the roadmap ahead.

Next on the list: project bundle `.zip` import/export, URL-shareable builds, HDZero font library browser, palette seed control, a11y completeness.

## Tech stack

TypeScript strict mode, Preact + `@preact/signals`, Vite, Tailwind (with CSS custom-property theming for the mode swap), Vitest + jsdom, `opentype.js` for TTF rasterization, `fake-indexeddb` for testing the asset cache. No backend, no server-side dependencies.

## License & attribution

MIT — see [LICENSE](LICENSE). Full per-source attribution in [NOTICE](NOTICE), including:

- Compositor logic inspired by the Python [HD-OSD-Font-Tools](https://github.com/ondrascz/HD-OSD-Font-Tools) (MIT) — clean-room TypeScript reimplementation, no code copied.
- OSD element schema cross-checked against [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator) (GPL-3.0) — schema is a newly-authored data table, no GPL code included.
- HD sample fonts shipped in `public/sample-fonts/` credited to individual authors (ondrascz, Sneaky FPV, Ligen, johhngoblin). No analog samples are bundled — bring your own `.mcm`.
- Icons and game-icons.net assets credited per-asset (CC BY 3.0).
