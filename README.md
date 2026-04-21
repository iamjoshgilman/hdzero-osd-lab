# hdzero-osd-lab

Browser-based studio for designing color HD OSD fonts and Craft Name decorations for HDZero FPV goggles running Betaflight.

**Status:** Pre-implementation. See [PLAN.md](PLAN.md) for the full roadmap and architecture.

## What it does (when finished)

- Compose a 384×1152 HD OSD font from any combination of base BMPs, TTFs (with per-glyph random color palettes), MCM analog fonts, and per-glyph image overrides — all in-browser, no Python.
- Preview the result on a live simulated Betaflight OSD so you can see exactly how your numbers, battery icons, logo, and warnings will look over an FPV background before you ever put the SD card back in the goggles.
- Design inline glyph-based decorations (custom logos, symbols, ASCII art) and export the exact 15-character Craft Name string to paste into Betaflight Configurator.
- Download a goggle-ready `BTFL_000.bmp` that drops straight onto the SD card at `resource/OSD/FC/`.

## Roadmap

- **v0.1** — Compositor MVP: font layers + BMP export. ([plan](PLAN.md#phase-1--v01-compositor-mvp))
- **v0.2** — Live OSD preview with draggable Betaflight elements. ([plan](PLAN.md#phase-2--v02-osd-live-preview))
- **v0.3** — Decoration Generator for Craft Name and stats strings. ([plan](PLAN.md#phase-3--v03-decoration-generator))
- **v1.0** — Polish, sharing, offline support, docs. ([plan](PLAN.md#phase-4--v10-polish-sharing-docs))

## License

MIT — see [LICENSE](LICENSE). Attributions in [NOTICE](NOTICE).

Inspired by the Python [HD-OSD-Font-Tools](https://github.com/ondrascz/HD-OSD-Font-Tools) and the WhiteRqbbit fork that added palette TTF rendering and `-glyph` overrides. This is a clean-room TypeScript reimplementation with a visual editor on top.
