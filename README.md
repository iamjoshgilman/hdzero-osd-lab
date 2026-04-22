# hdzero-osd-lab

Browser-based studio for designing color HD OSD fonts and Craft Name decorations for HDZero FPV goggles running Betaflight.

100% client-side — no server, no accounts, no telemetry. Your fonts and uploads live in your own browser. Bundle is ~41 KB gzipped.

[![build](https://github.com/iamjoshgilman/hdzero-osd-lab/actions/workflows/build.yml/badge.svg)](https://github.com/iamjoshgilman/hdzero-osd-lab/actions/workflows/build.yml)

## What it does

- **Compose a 384×1152 HD OSD font** from any combination of base BMPs, TrueType/OpenType fonts, PNG glyph overrides, and per-glyph color tints. Palette TTF rendering (random color per glyph from a hex list) ships out of the box.
- **Preview on a live 53×20 simulated Betaflight OSD** with all 64 OSD elements drag-positioned over an FPV still background (upload your own DVR frame or pick a preset). Element text (Craft Name, Pilot Name, Custom Messages) is fully editable and auto-uppercases where Betaflight does.
- **Upload logos** for the BTFL banner (576×144) and the inline mini-logo (120×36) — compositor auto-scales and letterboxes onto chroma-gray so transparency stays transparent on-goggle.
- **Copy or download the OSD view as PNG** to share builds on Discord/X/wherever.
- **Download `BTFL_000.bmp`** — goggle-ready 24-bit BMP. Drops straight onto the SD card at `resource/OSD/FC/BTFL_000.bmp`.
- **Project auto-persists** to browser IndexedDB. Close the tab, come back later, your work is still there.

An in-app **How-To tab** walks you through every workflow end-to-end (your first font → install on goggle), and a **Resources tab** links to the community font libraries this tool was built around.

## Quick start (local dev)

Requires Node 20+.

```bash
npm ci
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run typecheck  # TypeScript strict-mode check
npm run test:run   # 148 vitest tests, headless
npm run build      # production build → dist/
npm run preview    # preview the production build
```

## Installing on the goggle

Export a BMP from the app, then drop it on your HDZero Goggles 2 SD card at:

```
resource/OSD/FC/BTFL_000.bmp
```

Requires goggle firmware ≥ 7.66.120. No menu setting — the goggle auto-loads the font the next time it sees an HD OSD feed from a Betaflight FC. Full walkthrough (with troubleshooting checklist) lives in the in-app How-To tab.

## Status

Phase 2 complete (compositor + live OSD preview) + the Phase 2.x follow-up queue (logo uploader, per-glyph tints, realism toggle, project persistence, How-To tab, goggle install guide). See [CHANGELOG.md](CHANGELOG.md) for the per-release detail and [PLAN.md](PLAN.md) for the roadmap ahead.

Next on the list: Phase 4 polish — GitHub Pages deploy, project bundle `.zip` import/export, URL-shareable builds, a11y.

## Tech stack

TypeScript strict mode, Preact + `@preact/signals`, Vite, Tailwind, Vitest + jsdom, `opentype.js` for TTF rasterization, `fake-indexeddb` for testing the asset cache. No backend, no server-side dependencies.

## License & attribution

MIT — see [LICENSE](LICENSE). Full per-source attribution in [NOTICE](NOTICE), including:

- Compositor logic inspired by the Python [HD-OSD-Font-Tools](https://github.com/ondrascz/HD-OSD-Font-Tools) (MIT) — clean-room TypeScript reimplementation, no code copied.
- OSD element schema cross-checked against [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator) (GPL-3.0) — schema is a newly-authored data table, no GPL code included.
- Sample fonts shipped in `public/sample-fonts/` credited to individual authors (ondrascz, Sneaky FPV, Ligen, johhngoblin).
- Icons and game-icons.net assets credited per-asset (CC BY 3.0).
