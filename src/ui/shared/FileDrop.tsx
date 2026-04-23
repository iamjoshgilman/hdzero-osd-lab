import type { JSX } from "preact";
import { useCallback, useRef, useState } from "preact/hooks";

export interface FileDropProps {
  accept: string;
  onFile: (file: File) => void | Promise<void>;
  label?: string;
  class?: string;
}

export function FileDrop({ accept, onFile, label, class: className }: FileDropProps): JSX.Element {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const f = files[0]!;
      void onFile(f);
    },
    [onFile],
  );

  // Rendered as a <button> so it's keyboard-focusable and activates with
  // Enter/Space. A native file-input sits hidden inside; clicking the
  // button forwards to it. Drag-and-drop still works because we attach the
  // DragEvent handlers to the button element itself.
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setHover(false);
        handleFiles(e.dataTransfer?.files ?? null);
      }}
      class={[
        "w-full border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors font-mono text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-osd-mint",
        hover ? "border-osd-mint bg-slate-800" : "border-slate-600 text-slate-400",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        class="hidden"
        // Kept hidden but tab-excluded so only the visible button is
        // reachable via keyboard; Enter/Space on the button clicks it.
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e: Event) => {
          const input = e.target as HTMLInputElement;
          handleFiles(input.files);
          // Clear the input value so picking the same file again (e.g.
          // uploading the same .mcm into both HD and analog modes)
          // still fires `change` next time. Without this the browser
          // sees "value unchanged" and skips the event.
          input.value = "";
        }}
      />
      <p>{label ?? "Drop a file or click to choose"}</p>
      <p class="text-xs text-slate-500 mt-1">{accept}</p>
    </button>
  );
}
