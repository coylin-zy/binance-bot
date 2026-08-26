"use client";

import { LogOut, Radio, SquareTerminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useRealtime } from "@/hooks/use-realtime";

export function Topbar() {
  const router = useRouter();
  const { connected, lastEventAt } = useRealtime();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const stateLabel = connected === null ? "同步中" : connected ? "实时链路在线" : "实时链路离线";
  const stateColor = connected === null ? "var(--muted)" : connected ? "var(--terminal)" : "var(--danger)";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line-soft)] bg-[rgba(19,19,19,0.92)] backdrop-blur-md">
      {connected === false && (
        <div className="border-b border-[rgba(255,180,171,0.22)] bg-[rgba(147,0,10,0.16)] px-4 py-2 text-center text-[0.68rem] font-bold tracking-[0.06em] text-[var(--danger)]" role="status">
          REALTIME_LINK_DOWN — 页面仍会定时拉取数据
        </div>
      )}
      <div className="flex min-h-14 items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3 md:hidden">
          <SquareTerminal size={20} className="text-[var(--terminal)]" />
          <span className="font-display text-[0.7rem] font-bold tracking-[0.08em]">NEURAL_TERMINAL</span>
        </div>
        <div className="hidden items-center gap-3 md:flex" style={{ color: stateColor }}>
          <span className="status-dot" />
          <Radio size={15} strokeWidth={1.6} />
          <span className="terminal-label text-[0.62rem]" style={{ color: stateColor }}>{stateLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[0.62rem] text-[var(--muted)] xl:inline">
            {lastEventAt ? `LAST EVENT ${new Date(lastEventAt).toLocaleTimeString("zh-CN", { hour12: false })}` : "WAITING FOR EVENTS"}
          </span>
          <span className="hidden text-[0.62rem] text-[var(--muted)] lg:inline">HTTPONLY SESSION</span>
          <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="退出登录">
            <LogOut size={15} />
            <span className="hidden sm:inline">退出</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
