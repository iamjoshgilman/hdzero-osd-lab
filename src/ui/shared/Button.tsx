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
    "bg-osd-mint text-slate-900 hover:bg-emerald-300 focus-visible:ring-2 focus-visible:ring-osd-mint disabled:bg-slate-700 disabled:text-slate-500 disabled:opacity-60",
  // Disabled secondary used to collapse to the same bg as active — pilots
  // couldn't tell whether an Undo/Redo button was clickable. Darker bg +
  // opacity tells them "not right now" at a glance.
  secondary:
    "bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-500 disabled:bg-slate-900 disabled:text-slate-500 disabled:opacity-60",
  danger:
    "bg-osd-alert text-slate-50 hover:bg-red-400 focus-visible:ring-2 focus-visible:ring-osd-alert disabled:bg-slate-700 disabled:text-slate-500 disabled:opacity-60",
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
