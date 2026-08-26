import Link from "next/link";
import { ArrowLeft, FileQuestion, SquareTerminal } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main-content" className="terminal-grid grid min-h-screen min-h-dvh place-items-center bg-[var(--surface-dim)] px-4 py-10">
      <section className="terminal-panel w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4 text-[var(--terminal)]">
          <span className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.08em]"><SquareTerminal size={18} />NEURAL_TERMINAL</span>
          <span className="terminal-kbd">HTTP 404</span>
        </div>
        <div className="px-6 py-12 text-center sm:px-10 sm:py-16">
          <FileQuestion size={38} strokeWidth={1.2} className="mx-auto text-[var(--muted)]" />
          <div className="terminal-label mt-6 text-[var(--terminal)]">[ ROUTE.NOT_FOUND ]</div>
          <h1 className="font-display mt-3 text-2xl font-bold sm:text-3xl">找不到这个终端页面</h1>
          <p className="mx-auto mt-4 max-w-md text-xs leading-6 text-[var(--muted)]">请求路径不属于当前监控系统。返回总览后可以继续查看机器人状态和行情。</p>
          <Link href="/" className="mx-auto mt-8 inline-flex min-h-11 items-center gap-2 border border-[var(--terminal)] bg-[var(--terminal)] px-5 text-xs font-bold text-[var(--terminal-ink)] transition-transform active:translate-y-px">
            <ArrowLeft size={15} />返回系统总览
          </Link>
        </div>
      </section>
    </main>
  );
}
