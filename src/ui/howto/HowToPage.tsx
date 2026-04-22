// How-To tab — a static, self-contained walkthrough for first-time users.
// Ordered by workflow rather than by feature: "what do I do first?", "how do
// I change the letters?", "how do I get it on my goggle?". Each section
// references the actual button / tab names so readers can follow along
// without screenshots. Kept text-first on purpose — the UI is small enough
// that a clear word beats a screenshot that rots the first time a button
// moves.

import { currentView } from "@/state/ui-state";

interface Step {
  title: string;
  body: preact.ComponentChildren;
}

interface Section {
  id: string;
  title: string;
  blurb?: string;
  steps: Step[];
}

/** Quick inline UI token — styled to match in-app labels so steps feel grounded. */
function UI({ children }: { children: preact.ComponentChildren }) {
  return (
    <span class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-osd-mint whitespace-nowrap">
      {children}
    </span>
  );
}

/** Jump link to another tab in the app. */
function TabLink({ view, label }: { view: "font" | "osd" | "decoration" | "resources"; label: string }) {
  return (
    <button
      onClick={() => (currentView.value = view)}
      class="text-osd-cyan hover:text-osd-mint underline underline-offset-2 font-mono text-[11px]"
    >
      {label}
    </button>
  );
}

const SECTIONS: readonly Section[] = [
  {
    id: "first-font",
    title: "Your first font",
    blurb:
      "The app auto-loads a sample font on first visit so you can see the full flow without uploading anything.",
    steps: [
      {
        title: "Explore the default",
        body: (
          <>
            Open <TabLink view="font" label="Font" /> to see the 16×32 glyph atlas. Every
            one of the 512 tiles is a glyph the goggle firmware can draw. The sample
            ondrascz font is loaded as a base layer — you can delete it and start with
            your own, or build on top of it.
          </>
        ),
      },
      {
        title: "Download for your goggle",
        body: (
          <>
            Click <UI>↓ Download BTFL_000.bmp</UI> in the top bar. Drop the file onto
            your HDZero Goggles 2 SD card at <code>resource/OSD/FC/BTFL_000.bmp</code>
            {" "}(create the folders if they're missing). The goggle picks it up on next
            boot when connected to a Betaflight FC — no menu toggle required. Requires
            goggle firmware ≥ 7.66.120.
          </>
        ),
      },
    ],
  },
  {
    id: "base-font",
    title: "Swap the base font",
    blurb:
      "Don't like the default letter shapes? Drop a community BMP in as the base layer.",
    steps: [
      {
        title: "Find a font",
        body: (
          <>
            The <TabLink view="resources" label="Resources" /> tab links to the
            HDZero community font library on GitHub. Download any 384×1152 BMP, or an
            exploded 486×1350 (the app auto-implodes those).
          </>
        ),
      },
      {
        title: "Replace the base layer",
        body: (
          <>
            On the left <UI>Layers</UI> panel, delete the existing base layer with its
            trash icon, then click <UI>+ Bitmap</UI> and pick the file. The atlas
            re-renders instantly.
          </>
        ),
      },
    ],
  },
  {
    id: "ttf-palette",
    title: "Colorful text with a TTF",
    blurb:
      "Overlay any TrueType / OpenType font in the palette of your choice. Uppercase, lowercase, numbers — pick which subset to render.",
    steps: [
      {
        title: "Add the layer",
        body: (
          <>
            <UI>+ Add Layer</UI> → TTF. Upload your .ttf or .otf. Pick the subset —
            usually <UI>Letters</UI> for A–Z or <UI>Numbers</UI> for digits.
          </>
        ),
      },
      {
        title: "Set colors",
        body: (
          <>
            In the <UI>Glyph Color</UI> field, enter a single hex (<code>#00FFAA</code>)
            for one color, or a comma-separated palette
            (<code>#00FFAA,#00FFFF,#FF00FF,#FFB000</code>) for the "syntax-highlight
            scatter" look where each glyph picks a random color from the list. The{" "}
            <UI>WhiteRqbbit palette</UI> button drops in the mint/cyan/magenta/amber set.
          </>
        ),
      },
      {
        title: "Tune size & outline",
        body: (
          <>
            Adjust the font size (most HD fonts land between 18 and 28) and outline
            thickness (1.0–1.5 reads cleanly). Click <UI>Apply</UI>. The atlas
            re-composes showing your letters over the base.
          </>
        ),
      },
    ],
  },
  {
    id: "glyph-overrides",
    title: "Override individual glyphs with a PNG icon",
    blurb:
      "Swap a single tile for a custom icon without replacing the whole font.",
    steps: [
      {
        title: "Pick a glyph",
        body: (
          <>
            On the <TabLink view="font" label="Font" /> tab, click any tile in the
            atlas. The <UI>Inspector</UI> panel on the right shows its glyph code and
            preview.
          </>
        ),
      },
      {
        title: "Drop a PNG",
        body: (
          <>
            Drop any PNG into the Inspector's override zone. It's aspect-scaled to fit
            the 24×36 tile and centered on chroma-gray (transparent). Use a transparent
            PNG so non-icon pixels stay see-through on-goggle.
          </>
        ),
      },
      {
        title: "Tint it",
        body: (
          <>
            Below the override, the <UI>Tint</UI> picker multiplies the tile by the
            chosen color. Great for colorizing a white icon — pick red for a burning
            embers, red for the LQ skull-and-bolt, etc. Tints apply after all layers so
            they always win.
          </>
        ),
      },
    ],
  },
  {
    id: "banner-logo",
    title: "BTFL banner + inline mini-logo",
    blurb:
      "Two logo slots ship with every font: a big 576×144 startup banner and a 120×36 inline mini-logo.",
    steps: [
      {
        title: "Upload images",
        body: (
          <>
            Open the <TabLink view="decoration" label="Decoration" /> tab. Drop a
            576×144 image into the <UI>BTFL Logo</UI> slot and a 120×36 image into the{" "}
            <UI>Mini Logo</UI> slot. Transparent PNGs read best — anything fully
            transparent becomes chroma-gray (transparent on-goggle).
          </>
        ),
      },
      {
        title: "See the big banner",
        body: (
          <>
            On <TabLink view="osd" label="OSD Preview" />, find <UI>Betaflight Logo</UI>
            {" "}in the right-side element library (under Decorative) and toggle it on.
            It's a 24×4 tile banner rendered from glyph codes 160..255 — whatever you
            uploaded shows there.
          </>
        ),
      },
      {
        title: "Inline the mini-logo via Craft Name",
        body: (
          <>
            Still on <TabLink view="osd" label="OSD Preview" />, click <UI>Craft Name</UI>
            {" "}in the element library. In the text field, type{" "}
            <code class="text-osd-mint">[\]^_</code> (five characters — left bracket,
            backslash, right bracket, caret, underscore). Those ASCII codes (91..95)
            map to the mini-logo tiles, so your callsign line renders as the mini-logo
            in flight.
          </>
        ),
      },
      {
        title: "Paste into Betaflight",
        body: (
          <>
            The real payload is whatever you typed verbatim. Open Betaflight Configurator
            → <UI>Configuration</UI> → <UI>Personalization</UI> → <UI>Craft Name</UI>,
            paste <code>[\]^_</code> in there, save. The goggle OSD renders those five
            bytes as your mini-logo — same as the preview.
          </>
        ),
      },
    ],
  },
  {
    id: "osd-layout",
    title: "Lay out your OSD like the real thing",
    blurb:
      "Drag elements on a 53×20 grid, preview over an FPV still, export as a PNG.",
    steps: [
      {
        title: "Enable / disable elements",
        body: (
          <>
            The right sidebar lists every Betaflight OSD element by category. Toggle
            checkboxes to show/hide; click a label to select and see a text input for
            editable ones (Craft Name, Pilot Name, Custom Messages).
          </>
        ),
      },
      {
        title: "Drag to position",
        body: (
          <>
            Click-and-drag any enabled element on the canvas to reposition. The live
            mint outline shows the selection; coordinates update in the sidebar. Drop
            anywhere on the 53×20 grid.
          </>
        ),
      },
      {
        title: "Add a real background",
        body: (
          <>
            Under <UI>FPV background</UI>, drop an image of your own (try a still from
            a DVR clip) or pick one of the four built-in presets. The OSD renders over
            it exactly how the goggle would frame live video — adjust the <UI>Dim</UI>
            {" "}slider if your elements are getting lost over a bright sky.
          </>
        ),
      },
      {
        title: "Share a screenshot",
        body: (
          <>
            Click <UI>⧉ Copy</UI> top-right of the preview to copy the rendered OSD as
            a PNG to your clipboard (paste into Discord / X / wherever). Or{" "}
            <UI>↓ PNG</UI> for a local download. The <UI>Realism</UI> checkbox adds
            subtle scanlines + grain so it reads like a DVR frame, not a digital mockup.
          </>
        ),
      },
    ],
  },
  {
    id: "install-goggle",
    title: "Install on your HDZero Goggles 2",
    blurb:
      "The one-stop recipe for getting your exported BMP onto the goggle. Takes about 30 seconds once the file is downloaded.",
    steps: [
      {
        title: "Check your goggle firmware",
        body: (
          <>
            HD OSD font support landed in goggle firmware{" "}
            <span class="text-osd-mint">7.66.120</span> (June 2024). Anything newer
            works. If you're on an older build, update from the HDZero side first — the
            font file will be silently ignored otherwise.
          </>
        ),
      },
      {
        title: "Export the BMP",
        body: (
          <>
            On <TabLink view="font" label="Font" />, click <UI>↓ Download BTFL_000.bmp</UI>
            {" "}in the top bar. The file is always named exactly{" "}
            <code>BTFL_000.bmp</code> — don't rename it or the goggle won't find it.
          </>
        ),
      },
      {
        title: "Copy to the goggle SD card",
        body: (
          <>
            Pull the SD card out of your goggle and into your computer, or connect the
            goggle in SD reader mode. Copy the BMP to:{" "}
            <code class="text-osd-mint">resource/OSD/FC/BTFL_000.bmp</code>. Create the
            <code> resource</code>, <code>OSD</code>, and <code>FC</code> folders if
            they don't exist. Overwrite the existing file if there is one. Filenames
            and folders are case-sensitive.
          </>
        ),
      },
      {
        title: "Boot and fly",
        body: (
          <>
            Eject the SD, reinsert into the goggle, power on. No goggle menu setting —
            activation is automatic the first time the goggle sees an HD OSD feed from
            a Betaflight FC. Your new font renders the next time you arm.
          </>
        ),
      },
      {
        title: "Didn't change? Quick checklist",
        body: (
          <>
            <span class="block">
              • File path exactly <code>resource/OSD/FC/BTFL_000.bmp</code> (not{" "}
              <code>resources/</code>, not <code>BTFL_0.bmp</code>)
            </span>
            <span class="block">
              • FC is Betaflight, not INAV (INAV uses a different slot)
            </span>
            <span class="block">
              • Goggle firmware ≥ 7.66.120
            </span>
            <span class="block">
              • Goggle is actually receiving an HD OSD feed — stock canvas fonts
              render if it falls back to SD/analog OSD
            </span>
          </>
        ),
      },
    ],
  },
  {
    id: "save-and-reset",
    title: "Saving your work",
    blurb:
      "Your project — layers, layout, Craft Name text, tints, logo uploads — persists across page reloads automatically.",
    steps: [
      {
        title: "Auto-save",
        body: (
          <>
            Everything saves to your browser's IndexedDB on every change. Close the tab,
            come back later, your project is there. Binary uploads (BMPs, TTFs, PNGs)
            live in a separate asset cache so even heavy files don't bloat the save.
          </>
        ),
      },
      {
        title: "Start over",
        body: (
          <>
            Click <UI>⌫ New</UI> in the top bar to wipe the current project and reset
            to the sample font. Requires a confirm — destructive actions need two taps.
            Uploaded assets stay cached, so you can re-add them as layers without
            re-uploading the source files.
          </>
        ),
      },
      {
        title: "Undo / redo",
        body: (
          <>
            <UI>↶ Undo</UI> and <UI>↷ Redo</UI> in the top bar step through every
            mutation you've made this session. Undo history doesn't persist across
            reloads by design — once you refresh, the current state is your new
            starting point.
          </>
        ),
      },
    ],
  },
];

export function HowToPage() {
  return (
    <div class="max-w-4xl mx-auto w-full p-8 overflow-y-auto">
      <header class="mb-6">
        <h1 class="font-mono text-2xl font-bold mb-2">
          <span class="text-osd-mint">How-</span>
          <span class="text-osd-cyan">to</span>
        </h1>
        <p class="text-sm text-slate-400 leading-relaxed max-w-2xl">
          A quick tour of the common workflows. Read in order on a first visit, or jump
          to whichever section covers what you're stuck on. The steps reference the
          actual button and tab names in the UI — click the tab links to jump around.
        </p>
      </header>

      <nav class="mb-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            class="text-[11px] font-mono text-slate-400 hover:text-osd-mint bg-slate-900 border border-slate-800 rounded px-2 py-1"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div class="flex flex-col gap-6">
        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            class="bg-slate-900 border border-slate-800 rounded-lg p-5 scroll-mt-4"
          >
            <h2 class="font-mono text-lg text-osd-amber mb-1">{section.title}</h2>
            {section.blurb && (
              <p class="text-[12px] text-slate-400 leading-snug max-w-2xl mb-4">
                {section.blurb}
              </p>
            )}
            <ol class="flex flex-col gap-3 list-none">
              {section.steps.map((step, idx) => (
                <li key={idx} class="flex gap-3">
                  <span class="shrink-0 font-mono text-osd-mint text-[11px] w-5 text-right">
                    {idx + 1}.
                  </span>
                  <div class="flex-1">
                    <p class="font-mono text-[12px] text-slate-200 mb-1">{step.title}</p>
                    <p class="text-[12px] text-slate-400 leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <section class="border border-dashed border-slate-700 rounded-lg p-5 text-[12px] text-slate-500 leading-relaxed">
          <p>
            Something still confusing? File an issue — or if you want to riff on font
            design, the <TabLink view="resources" label="Resources" /> tab has the
            community libraries and icon sources this tool was built around.
          </p>
        </section>
      </div>
    </div>
  );
}
