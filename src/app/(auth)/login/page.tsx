"use client";

import { type FormEvent, useState } from "react";
import { KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, SquareTerminal, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "凭据验证失败");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("无法连接认证服务，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="scanline-overlay terminal-grid relative grid min-h-screen min-h-dvh place-items-center overflow-hidden bg-[var(--surface-dim)] px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-[17%] mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-[rgba(0,255,65,0.35)] to-transparent" />
      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-[560px] border border-[var(--terminal)] bg-[rgba(19,19,19,0.96)] shadow-[0_0_70px_rgba(0,255,65,0.07)]">
        <header className="flex items-center justify-between border-b border-[rgba(0,255,65,0.32)] px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3 text-[var(--terminal)]">
            <SquareTerminal size={22} strokeWidth={1.6} />
            <div><div className="font-display text-xs font-bold tracking-[0.1em]">QUANT_BOT_ALPHA</div><div className="mt-1 text-[0.55rem] tracking-[0.16em] text-[var(--muted)]">NEURAL TERMINAL ACCESS</div></div>
          </div>
          <div className="flex gap-2" aria-label="安全服务在线"><span className="status-dot text-[var(--terminal)]" /><span className="status-dot text-[var(--terminal)] opacity-70" /><span className="status-dot text-[var(--terminal)] opacity-40" /></div>
        </header>

        <div className="px-5 py-8 sm:px-8 sm:py-10">
          <div className="mb-8">
            <div className="terminal-label text-[var(--terminal)]">[ AUTH.SECURE_GATEWAY ]</div>
            <h1 className="font-display mt-3 text-xl font-bold uppercase tracking-[-0.035em] sm:text-2xl">身份验证终端</h1>
            <p className="mt-3 text-xs leading-6 text-[var(--muted)]">使用 Freqtrade API 凭据建立加密会话。凭据仅由服务端转发，不会写入浏览器存储。</p>
          </div>

          <div className="space-y-6">
            <label className="block" htmlFor="username">
              <span className="terminal-label mb-2 flex items-center gap-2"><UserRound size={13} />Access id</span>
              <span className="relative block"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[var(--terminal)]">&gt;</span><Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required spellCheck={false} className="pl-8" placeholder="freqtrade_user" /></span>
            </label>
            <label className="block" htmlFor="password">
              <span className="terminal-label mb-2 flex items-center gap-2"><KeyRound size={13} />Secret key</span>
              <span className="relative block"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[var(--terminal)]">&gt;</span><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="pl-8" placeholder="••••••••••••" /></span>
            </label>
          </div>

          {error && <div className="mt-6 border border-[rgba(255,180,171,0.4)] bg-[rgba(147,0,10,0.16)] px-4 py-3 text-xs leading-5 text-[var(--danger)]" role="alert">AUTH_ERROR: {error}</div>}

          <Button type="submit" size="lg" disabled={loading} className="mt-7 w-full shadow-[0_0_24px_rgba(0,255,65,0.12)]">
            {loading ? <><LoaderCircle size={16} className="animate-spin" />正在建立会话</> : <><LockKeyhole size={16} />Initialize secure session</>}
          </Button>
        </div>

        <footer className="flex flex-col justify-between gap-3 border-t border-[var(--line-soft)] bg-[var(--surface-dim)] px-5 py-4 text-[0.58rem] tracking-[0.08em] text-[var(--muted)] sm:flex-row sm:items-center sm:px-7">
          <span className="flex items-center gap-2 text-[var(--terminal)]"><ShieldCheck size={13} />BFF PROTECTED · HTTPONLY SESSION</span>
          <span>TERMINAL.V1 / 2026.08</span>
        </footer>
      </form>
    </main>
  );
}
