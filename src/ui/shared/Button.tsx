import type { ComponentChildren, JSX } from "preact";

type Variant = "primary" | "secondary" | "danger";

type BaseProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: Variant;
  children: ComponentChildren;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
};

const CLASSES: Record<Variant, string> = {
  primary:
    "bg-osd-mint text-slate-900 hover:bg-emerald-300 focus:ring-2 focus:ring-osd-mint disabled:bg-slate-600 disabled:text-slate-400",
  secondary:
    "bg-slate-800 text-slate-100 hover:bg-slate-700 focus:ring-2 focus:ring-slate-500 disabled:bg-slate-800 disabled:text-slate-500",
  danger:
    "bg-osd-alert text-slate-50 hover:bg-red-400 focus:ring-2 focus:ring-osd-alert disabled:bg-slate-700 disabled:text-slate-500",
};

export function Button({ variant = "primary", class: className, children, ...rest }: BaseProps) {
  return (
    <button
      {...rest}
      class={[
        "px-4 py-2 rounded font-mono text-sm font-semibold transition-colors",
        "focus:outline-none disabled:cursor-not-allowed",
        CLASSES[variant],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}
