import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // OSD palette used by the Python tool's chroma-key contract
        "osd-transparent": "#7f7f7f",
        // hacker / syntax-highlight palette we default to
        "osd-mint": "#00ffaa",
        "osd-cyan": "#00ffff",
        "osd-magenta": "#ff00ff",
        "osd-amber": "#ffb000",
        "osd-alert": "#ff3333",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
