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

  return (
    <div
      class={[
        "border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors font-mono text-sm",
        hover ? "border-osd-mint bg-slate-800" : "border-slate-600 text-slate-400",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
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
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        class="hidden"
        onChange={(e: Event) => handleFiles((e.target as HTMLInputElement).files)}
      />
      <p>{label ?? "Drop a file or click to choose"}</p>
      <p class="text-xs text-slate-500 mt-1">{accept}</p>
    </div>
  );
}
