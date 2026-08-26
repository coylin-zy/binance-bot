"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="terminal-grid grid min-h-screen min-h-dvh place-items-center bg-[var(--surface-dim)] px-4 py-10">
      <section className="w-full max-w-xl border border-[rgba(255,180,171,0.38)] bg-[var(--surface-low)] p-6 sm:p-8" role="alert">
        <AlertTriangle size={26} className="text-[var(--danger)]" />
        <div className="terminal-label mt-6 text-[var(--danger)]">[ UI.RENDER_INTERRUPTED ]</div>
        <h1 className="font-display mt-3 text-xl font-bold">界面渲染被中断</h1>
        <p className="mt-4 text-xs leading-6 text-[var(--text-soft)]">机器人不会因此执行额外交易。可以重试加载当前页面；若问题持续，请检查服务日志。</p>
        {error.digest && <div className="terminal-kbd mt-4 inline-block">REF {error.digest}</div>}
        <Button className="mt-7" onClick={() => retry()}><RotateCcw size={15} />重新加载页面</Button>
      </section>
    </main>
  );
}
