import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col justify-between gap-5 border-b border-[var(--line-soft)] pb-6 lg:flex-row lg:items-end">
      <div>
        <div className="terminal-label mb-3 text-[var(--terminal)]">{eyebrow}</div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[-0.045em] text-[var(--text)] sm:text-3xl lg:text-[2.35rem] lg:leading-none">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--muted)] sm:text-sm">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
