"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useRealtime } from "@/hooks/use-realtime";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { connected } = useRealtime();

  return (
    <div className="scanline-overlay terminal-grid flex min-h-screen bg-[var(--surface)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[70px] md:pb-0">
        <Topbar connected={connected} />
        <main className="flex-1 px-4 py-6 md:px-7 md:py-8 xl:px-10">{children}</main>
      </div>
    </div>
  );
}
