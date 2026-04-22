import { useEffect } from "preact/hooks";
import { useComputed } from "@preact/signals";
import { project, undo, redo, canUndo, canRedo } from "@/state/store";
import { addSampleFontAsBaseLayer } from "@/state/bootstrap";
import {
  hydrateFromPersistence,
  installAutoSave,
  resetProjectAndPersistence,
} from "@/state/autosave";
import { currentView } from "@/state/ui-state";
import { compose } from "@/compositor/compose";
import { writeBmp24 } from "@/encoders/bmp";
import { FONT_SIZE } from "@/compositor/constants";
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

  // Boot sequence: install auto-save first (it skips until hydration completes,
  // so it can't race the load), then try to restore the last-saved project
  // from IndexedDB. Only if there's no saved project do we fall back to the
  // MIT-safe ondrascz sample so the canvas has something to render instead
  // of a blank chroma-gray atlas.
  useEffect(() => {
    installAutoSave();
    hydrateFromPersistence().then((restored) => {
      if (!restored && project.value.font.layers.length === 0) {
        addSampleFontAsBaseLayer("ondrascz-color.bmp", "ondrascz color (default)").catch(
          (err) => console.error("auto-bootstrap failed:", err),
        );
      }
    });
  }, []);

  const handleNewProject = async () => {
    const ok = window.confirm(
      "Start a new project? This clears your current layers, OSD layout, tints, and custom text. Uploaded assets stay in your browser cache and can be re-added as layers.",
    );
    if (!ok) return;
    await resetProjectAndPersistence();
    // Re-seed with the sample so the first render has a base layer, mirroring
    // the fresh-install path.
    await addSampleFontAsBaseLayer(
      "ondrascz-color.bmp",
      "ondrascz color (default)",
    ).catch((err) => console.error("post-reset bootstrap failed:", err));
  };

  const downloadBmp = () => {
    const atlas = compose(project.value, assets.value);
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
        onDownload={downloadBmp}
        canDownload={hasLayers.value}
        onNewProject={handleNewProject}
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
}: {
  onDownload: () => void;
  canDownload: boolean;
  onNewProject: () => void;
}) {
  return (
    <header class="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900">
      <h1 class="font-mono text-lg font-bold">
        <span class="text-osd-mint">hdzero-</span>
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
          ↓ Download BTFL_000.bmp
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
