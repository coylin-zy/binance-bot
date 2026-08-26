"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Activity,
  ChartCandlestick,
  Command,
  History,
  LayoutDashboard,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "总览", code: "01", icon: LayoutDashboard },
  { href: "/chart", label: "实时图表", code: "02", icon: ChartCandlestick },
  { href: "/trades", label: "交易历史", code: "03", icon: History },
  { href: "/settings", label: "运行控制", code: "04", icon: Command },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden min-h-screen w-[304px] shrink-0 border-r border-[var(--line-soft)] bg-[var(--surface-dim)] md:flex md:flex-col">
        <div className="border-b border-[var(--line-soft)] px-6 py-7">
          <Link href="/" className="group flex items-center gap-3" aria-label="Neural Terminal 首页">
            <span className="grid h-10 w-10 place-items-center border border-[var(--terminal)] text-[var(--terminal)] shadow-[0_0_18px_rgba(0,255,65,0.12)]">
              <SquareTerminal size={22} strokeWidth={1.6} />
            </span>
            <span>
              <strong className="font-display block text-sm tracking-[0.08em] text-[var(--text)]">NEURAL_TERMINAL</strong>
              <span className="terminal-label text-[0.56rem] text-[var(--terminal)]">Freqtrade monitor</span>
            </span>
          </Link>
        </div>

        <div className="px-6 pb-3 pt-7">
          <div className="terminal-label">System navigation</div>
        </div>
        <nav className="flex-1 px-3" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative mb-1 flex min-h-12 items-center gap-3 border border-transparent px-3 text-sm transition-colors duration-200",
                  active
                    ? "border-[var(--line-soft)] bg-[var(--surface-low)] text-[var(--terminal)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-low)] hover:text-[var(--text)]",
                )}
              >
                {active && <span className="absolute -left-[4px] top-2 bottom-2 w-[2px] bg-[var(--terminal)] shadow-[0_0_10px_var(--terminal)]" />}
                <span className="w-6 text-[0.6rem] text-[var(--line)] group-hover:text-[var(--muted)]">{item.code}</span>
                <item.icon size={18} strokeWidth={1.6} />
                <span className="font-display text-xs font-bold tracking-[0.06em]">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="m-4 border border-[var(--line-soft)] bg-[var(--surface-low)] p-4">
          <div className="flex items-center gap-2 text-[var(--terminal)]">
            <ShieldCheck size={16} strokeWidth={1.6} />
            <span className="terminal-label text-[0.6rem] text-[var(--terminal)]">Protected BFF</span>
          </div>
          <p className="mt-3 text-[0.66rem] leading-5 text-[var(--muted)]">
            仅开放监控与机器人生命周期端点。手动交易接口已在服务端阻断。
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--line-soft)] px-5 py-4 text-[0.6rem] text-[var(--muted)]">
          <span className="flex items-center gap-2"><Activity size={13} />SYS.V1</span>
          <span>BUILD_2026.08</span>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[var(--line)] bg-[rgba(14,14,14,0.97)] pb-[max(env(safe-area-inset-bottom),6px)] md:hidden" aria-label="移动端主导航">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[58px] flex-col items-center justify-center gap-1 border-t-2 px-1 text-[0.58rem] font-bold tracking-[0.04em]",
                active ? "border-[var(--terminal)] text-[var(--terminal)]" : "border-transparent text-[var(--muted)]",
              )}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
