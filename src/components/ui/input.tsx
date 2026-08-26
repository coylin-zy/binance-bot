import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex min-h-11 w-full rounded-[2px] border border-[var(--line)] bg-[var(--surface-dim)] px-3 py-2 text-sm text-[var(--text)]",
        "placeholder:text-[var(--muted)] focus-visible:border-[var(--terminal)] focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
