// Placeholder for the Phase 2 OSD live preview. Shown while the OSD tab is
// selected so users can navigate the shell and anticipate the feature.

export function OsdPreviewStub() {
  return (
    <div class="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div class="text-6xl">🎯</div>
      <h2 class="font-mono text-2xl">
        <span class="text-osd-cyan">OSD live preview</span>
      </h2>
      <p class="font-mono text-xs text-slate-400 max-w-md">
        Coming in <span class="text-osd-amber">v0.2</span>. A 53×20 simulated
        Betaflight OSD rendered with your composed font, over an FPV background,
        with draggable elements. Edit the font on the other tab — changes will
        update here in real time.
      </p>
    </div>
  );
}
