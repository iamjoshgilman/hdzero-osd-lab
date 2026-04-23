// Curated jump-off point for pilots who want to customize their OSD font but
// don't know where to find assets. Static content — no project state, no
// mutations. Grouped by the kind of thing you're looking for.

interface ResourceLink {
  title: string;
  url: string;
  note: string;
  license?: string;
}

interface ResourceSection {
  id: string;
  title: string;
  blurb: string;
  links: ResourceLink[];
}

const SECTIONS: readonly ResourceSection[] = [
  {
    id: "fonts",
    title: "Community font libraries",
    blurb:
      "Ready-made HD OSD fonts as 384×1152 BMPs. Drop any of these into the Font tab's base picker or upload directly.",
    links: [
      {
        title: "HDZero OSD Font Library",
        url: "https://github.com/hd-zero/hdzero-osd-font-library",
        note:
          "Official HDZero community library. Separate folders per FC variant (BTFL / INAV / ARDU / EMUF / QUIC). Most fonts ship as ready-to-install BMPs.",
      },
      {
        title: "HD OSD Font Tools — ondrascz",
        url: "https://github.com/ondrascz/HD-OSD-Font-Tools",
        note:
          "The original Python font compositor + bundled reference fonts. This project's conceptual parent.",
        license: "MIT",
      },
      {
        title: "Betaflight Configurator",
        url: "https://github.com/betaflight/betaflight-configurator",
        note:
          "The official desktop tool. Has a Font Manager dialog for uploading fonts to non-HD goggles. Source is the canonical reference for OSD element positions and glyph codes.",
        license: "GPL-3.0",
      },
    ],
  },
  {
    id: "icons",
    title: "Icons &amp; sprites for -glyph overrides",
    blurb:
      "Drop any PNG at any glyph code in the Font tab's sidebar. These libraries cover just about every 'I want a skull / lightning / heart icon' case.",
    links: [
      {
        title: "game-icons.net",
        url: "https://game-icons.net/",
        note:
          "4,000+ SVG icons in a consistent style. Occult / tech / animal / weapons / symbols — great for FPV aesthetics. Free color and size editor on-site.",
        license: "CC-BY 3.0 (per author)",
      },
      {
        title: "SVG Repo",
        url: "https://www.svgrepo.com/",
        note:
          "Huge SVG search engine. Filter by 'monocolor' and 'logos' for OSD-friendly shapes.",
        license: "Mixed (per icon; many CC0)",
      },
      {
        title: "OpenGameArt",
        url: "https://opengameart.org/",
        note:
          "Game art with proper licensing metadata. Search 'skull sprite', 'drone sprite', etc. Great for decorative logo art.",
        license: "Mixed (many CC0 / CC-BY)",
      },
      {
        title: "Heroicons",
        url: "https://heroicons.com/",
        note: "Minimal modern icon set. Useful for clean / cyber aesthetics.",
        license: "MIT",
      },
      {
        title: "Iconify",
        url: "https://icon-sets.iconify.design/",
        note:
          "Unified search across dozens of icon packs including game-icons, Tabler, Lucide, Font Awesome Free, Material. One-click SVG copy.",
        license: "Mixed (per pack)",
      },
    ],
  },
  {
    id: "typefaces",
    title: "Typefaces (TTF) for text layers",
    blurb:
      "Good starting points for TTF palette layers. Monospaced typefaces hold up best at 24×36 in HD mode; pixel-designed fonts read best at 12×18 in analog mode.",
    links: [
      {
        title: "Google Fonts",
        url: "https://fonts.google.com/",
        note:
          "Free, direct downloads. Start with JetBrains Mono, Fira Code, Space Mono, VT323, Press Start 2P, Share Tech Mono.",
        license: "OFL (mostly)",
      },
      {
        title: "JetBrains Mono",
        url: "https://www.jetbrains.com/lp/mono/",
        note:
          "The typeface used in the WhiteRqbbit signature font. Excellent at small sizes, free, OFL.",
        license: "OFL",
      },
      {
        title: "DaFont",
        url: "https://www.dafont.com/",
        note:
          "Massive archive of display / pixel / retro typefaces. Many are free for personal use; check each license.",
        license: "Mixed (per font)",
      },
      {
        title: "Font Squirrel",
        url: "https://www.fontsquirrel.com/",
        note: "Commercial-use-friendly free fonts, carefully vetted.",
        license: "Mixed (all commercial-OK)",
      },
    ],
  },
  {
    id: "reference",
    title: "Format &amp; firmware reference",
    blurb: "If you want to understand exactly what's happening at the bitmap / glyph-code layer.",
    links: [
      {
        title: "Betaflight — osd_symbols.h",
        url: "https://github.com/betaflight/betaflight/blob/master/src/main/drivers/osd_symbols.h",
        note:
          "Authoritative table of every SYM_* glyph-code constant Betaflight emits. Source this project's symbol schema was derived from.",
        license: "GPL-3.0 (data reimplemented)",
      },
      {
        title: "Betaflight — osd_elements.c",
        url: "https://github.com/betaflight/betaflight/blob/master/src/main/osd/osd_elements.c",
        note: "The dispatch of every OSD element's rendering. Where to look if an element isn't drawing what you expected.",
        license: "GPL-3.0",
      },
      {
        title: "HDZero goggle firmware docs",
        url: "https://www.hd-zero.com/document",
        note:
          "Official HDZero documentation hub — goggle firmware version table, SD card layout, font requirements.",
      },
      {
        title: "MAX7456 datasheet",
        url: "https://www.analog.com/en/products/max7456.html",
        note:
          "The legacy analog OSD chip whose font format (.mcm) the HD ecosystem inherited. Good reference for why the glyph format is what it is.",
      },
    ],
  },
  {
    id: "community",
    title: "Community",
    blurb:
      "Places to share your builds, get feedback, or troubleshoot. If you make something cool with this tool, these are the places to post it.",
    links: [
      {
        title: "Intofpv Forum",
        url: "https://intofpv.com/",
        note: "Active FPV forum with a dedicated HDZero section. Good for troubleshooting fonts on specific firmware versions.",
      },
      {
        title: "r/fpv",
        url: "https://www.reddit.com/r/fpv/",
        note: "General FPV subreddit. Font screenshots do well here.",
      },
      {
        title: "Betaflight community",
        url: "https://github.com/betaflight/betaflight/discussions",
        note: "GitHub discussions for flight-controller questions.",
      },
    ],
  },
];

export function ResourcesPage() {
  return (
    <div class="max-w-4xl mx-auto w-full p-8 overflow-y-auto">
      <header class="mb-6">
        <h1 class="font-mono text-2xl font-bold mb-2">
          <span class="text-osd-cyan">Resources</span>
        </h1>
        <p class="text-sm text-slate-400 leading-relaxed max-w-2xl">
          Places to source fonts, icons, typefaces, and reference docs when you're customizing
          your OSD. External links; nothing here is bundled into the app.
        </p>
      </header>

      <div class="flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.id}>
            <h2 class="font-mono text-lg text-osd-mint mb-1">{section.title}</h2>
            <p class="text-xs text-slate-500 mb-3 leading-snug max-w-2xl">{section.blurb}</p>
            <ul class="grid grid-cols-1 md:grid-cols-2 gap-3">
              {section.links.map((link) => (
                <li
                  key={link.url}
                  class="bg-slate-900 border border-slate-800 rounded p-3 hover:border-slate-700 transition-colors"
                >
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    class="block"
                  >
                    <div class="flex items-start justify-between gap-2 mb-1">
                      <h3 class="font-mono text-sm font-semibold text-slate-100 hover:text-osd-mint">
                        {link.title}
                      </h3>
                      <span class="text-slate-500 text-xs shrink-0">↗</span>
                    </div>
                    <p class="text-[11px] text-slate-400 leading-snug">{link.note}</p>
                    {link.license && (
                      <p class="mt-1 text-[10px] text-osd-amber font-mono">{link.license}</p>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer class="mt-10 pt-6 border-t border-slate-800">
        <p class="text-xs text-slate-500 leading-relaxed">
          Missing something useful? Open an issue on the repo with a link + one-line description
          and it'll land here.
        </p>
      </footer>
    </div>
  );
}
