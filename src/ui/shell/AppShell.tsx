import { useEffect } from "preact/hooks";
import { useComputed } from "@preact/signals";
import { project, mutate, undo, redo, canUndo, canRedo } from "@/state/store";
import {
  hydrateFromPersistence,
  installAutoSave,
} from "@/state/autosave";
import { emptyFontSlice } from "@/state/project";
import { currentView } from "@/state/ui-state";
import { compose } from "@/compositor/compose";
import { writeBmp24 } from "@/encoders/bmp";
import { writeMcm } from "@/encoders/mcm";
import { FONT_SIZE, ANALOG_GLYPH_COUNT } from "@/compositor/constants";
import { extractAnalogTile } from "@/compositor/atlas";
import { useResolvedAssets } from "@/ui/hooks/useResolvedAssets";
import { Button } from "@/ui/shared/Button";
import { LayersPanel } from "@/ui/font-editor/LayersPanel";
import { FontPreview } from "@/ui/font-editor/FontPreview";
import { InspectorPanel } from "@/ui/font-editor/InspectorPanel";
import { TabBar } from "@/ui/shell/TabBar";
import { OsdCanvas } from "@/ui/osd-preview/OsdCanvas";
import { ElementLibrary } from "@/ui/osd-preview/ElementLibrary";
import { ResourcesPage } from "@/ui/resources/ResourcesPage";
import { DecorationPage } from "@/ui/decoration/DecorationPage";
import { HowToPage } from "@/ui/howto/HowToPage";

export function AppShell() {
  const { assets } = useResolvedAssets();
  const hasLayers = useComputed(() => project.value.font.layers.length > 0);
  const mode = useComputed(() => project.value.meta.mode);

  // Boot sequence: install auto-save first (skips until hydration completes so
  // it can't race the load), then try to restore the last-saved project from
  // IndexedDB. If nothing's saved, the canvas shows an empty-state placeholder
  // (see FontPreview) rather than auto-loading a random font — pilots showed
  // up not knowing what the default meant, so we let them pick.
  useEffect(() => {
    installAutoSave();
    void hydrateFromPersistence();
  }, []);

  // Theme swap: mirror project.meta.mode onto <html data-mode="..."> so the
  // CSS custom properties in styles.css pick the right palette. Runs once on
  // mount plus whenever mode changes.
  useEffect(() => {
    document.documentElement.dataset.mode = mode.value;
  }, [mode.value]);

  const handleNewProject = () => {
    const currentMode = project.value.meta.mode;
    const modeLabel = currentMode === "analog" ? "analog" : "HDZero";
    const ok = window.confirm(
      `Start a new ${modeLabel} project? This clears this mode's layers, OSD layout, tints, and custom text. Your work in the other mode is untouched, and uploaded assets stay cached.`,
    );
    if (!ok) return;
    mutate((doc) => {
      // Scoped reset: only the currently-active mode's font slice + OSD
      // element layout. The archived other-mode font + its element map stay
      // so pilots hacking both modes in parallel don't lose the other side.
      // Mode itself is preserved — you're not being kicked back to HD.
      doc.font = emptyFontSlice();
      if (doc.meta.mode === "analog") {
        doc.osdLayout.elementsAnalog = {};
      } else {
        doc.osdLayout.elements = {};
      }
    });
  };

  const downloadFont = () => {
    const atlas = compose(project.value, assets.value);
    if (project.value.meta.mode === "analog") {
      // Analog: extract 256 tiles from the composed 192×288 atlas and write
      // as an MCM text file. Configurator's Font Manager reads this directly.
      const tiles = new Map<number, Uint8ClampedArray>();
      for (let code = 0; code < ANALOG_GLYPH_COUNT; code++) {
        tiles.set(code, extractAnalogTile(atlas, code));
      }
      const text = writeMcm(tiles);
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (project.value.meta.name || "font")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .toLowerCase() || "font";
      a.download = `${safeName}.mcm`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // HD: write a 384×1152 BMP named BTFL_000.bmp per HDZero's SD-card convention.
    const bytes = writeBmp24({ width: FONT_SIZE.w, height: FONT_SIZE.h, data: atlas });
    const blob = new Blob([bytes as unknown as BlobPart], { type: "image/bmp" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "BTFL_000.bmp";
    a.click();
    URL.revokeObjectURL(url);
  };

  const view = useComputed(() => currentView.value);

  return (
    <div class="flex flex-col h-full bg-slate-950 text-slate-100">
      <TopBar
        onDownload={downloadFont}
        canDownload={hasLayers.value}
        onNewProject={handleNewProject}
        mode={mode.value}
      />
      <TabBar />
      <main class="flex flex-1 overflow-hidden">
        {/* LayersPanel pinned left on project-editing tabs; hidden on Resources and
            How-To (both read-only content). */}
        {view.value !== "resources" && view.value !== "howto" && <LayersPanel />}
        <section class="flex-1 overflow-auto p-6 flex justify-center">
          {view.value === "font" && <FontPreview />}
          {view.value === "osd" && <OsdCanvas />}
          {view.value === "decoration" && <DecorationPage />}
          {view.value === "howto" && <HowToPage />}
          {view.value === "resources" && <ResourcesPage />}
        </section>
        {view.value === "font" && <InspectorPanel />}
        {view.value === "osd" && <ElementLibrary />}
      </main>
      <StatusBar />
    </div>
  );
}

function TopBar({
  onDownload,
  canDownload,
  onNewProject,
  mode,
}: {
  onDownload: () => void;
  canDownload: boolean;
  onNewProject: () => void;
  mode: "hd" | "analog";
}) {
  const downloadLabel =
    mode === "analog" ? "↓ Download .mcm" : "↓ Download BTFL_000.bmp";
  const prefix = mode === "analog" ? "analog-" : "hdzero-";
  return (
    <header class="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900">
      <h1 class="font-mono text-lg font-bold">
        <span class="text-osd-mint">{prefix}</span>
        <span class="text-osd-cyan">osd-</span>
        <span class="text-osd-magenta">lab</span>
        <span class="text-slate-500 text-xs ml-2 font-normal">v{__APP_VERSION__}</span>
      </h1>
      <div class="flex gap-2">
        <Button
          variant="secondary"
          onClick={onNewProject}
          title="Start a new project. Clears layers, layout, and custom text. Assets stay cached."
        >
          ⌫ New
        </Button>
        <Button variant="secondary" onClick={undo} disabled={!canUndo()}>
          ↶ Undo
        </Button>
        <Button variant="secondary" onClick={redo} disabled={!canRedo()}>
          ↷ Redo
        </Button>
        <Button variant="primary" onClick={onDownload} disabled={!canDownload}>
          {downloadLabel}
        </Button>
      </div>
    </header>
  );
}

function StatusBar() {
  const layerCount = useComputed(() => project.value.font.layers.length);
  const overrideCount = useComputed(() => Object.keys(project.value.font.overrides).length);
  const name = useComputed(() => project.value.meta.name);
  return (
    <footer class="flex items-center justify-between border-t border-slate-800 px-4 py-1 bg-slate-900 text-xs font-mono text-slate-400">
      <span>{name.value}</span>
      <span>
        {layerCount.value} layer{layerCount.value === 1 ? "" : "s"} · {overrideCount.value}{" "}
        override{overrideCount.value === 1 ? "" : "s"}
      </span>
    </footer>
  );
}
