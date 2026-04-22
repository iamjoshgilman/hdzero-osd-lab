import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // OSD palette used by the Python tool's chroma-key contract
        "osd-transparent": "#7f7f7f",
        // Accent palette. Values come from CSS custom properties in styles.css
        // so they swap automatically when the mode toggle flips between
        // HDZero (neon/digital) and analog (monochrome CRT).
        "osd-mint": "var(--osd-mint)",
        "osd-cyan": "var(--osd-cyan)",
        "osd-magenta": "var(--osd-magenta)",
        "osd-amber": "var(--osd-amber)",
        "osd-alert": "var(--osd-alert)",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
