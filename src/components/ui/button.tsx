import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "destructive" | "outline" | "ghost" | "quiet";

type Size = "sm" | "default" | "lg" | "icon";

const variantClasses: Record<Variant, string> = {
  default: "border border-[var(--terminal)] bg-[var(--terminal)] text-[var(--terminal-ink)] hover:bg-transparent hover:text-[var(--terminal)]",
  destructive: "border border-[var(--danger-strong)] bg-[var(--danger-strong)] text-white hover:bg-transparent hover:text-[var(--danger)]",
  outline: "border border-[var(--line)] text-[var(--text-soft)] hover:border-[var(--terminal)] hover:text-[var(--terminal)]",
  ghost: "border border-transparent text-[var(--muted)] hover:bg-[var(--surface-high)] hover:text-[var(--text)]",
  quiet: "border border-[var(--line-soft)] bg-[var(--surface-mid)] text-[var(--text)] hover:border-[var(--muted)]",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-colors duration-200",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" && "min-h-9 px-3 text-[0.68rem]",
        size === "lg" && "min-h-12 px-6",
        size === "icon" && "h-11 w-11 px-0",
        variantClasses[variant],
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button };
