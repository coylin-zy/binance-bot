"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RealtimeProvider } from "@/hooks/use-realtime";

function DashboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="scanline-overlay terminal-grid flex min-h-screen bg-[var(--surface)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[70px] md:pb-0">
        <Topbar />
        <main id="main-content" className="flex-1 px-4 py-6 md:px-7 md:py-8 xl:px-10">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RealtimeProvider>
      <DashboardChrome>{children}</DashboardChrome>
    </RealtimeProvider>
  );
}
