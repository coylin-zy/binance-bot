import { AlertTriangle, LoaderCircle } from "lucide-react";

export function PanelLoading({ label = "正在同步数据" }: { label?: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center gap-3 text-xs text-[var(--muted)]" role="status">
      <LoaderCircle size={17} className="animate-spin text-[var(--terminal)]" />
      <span>{label}...</span>
    </div>
  );
}

export function PanelError({ message = "数据读取失败，请检查 Freqtrade 服务连接" }: { message?: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center gap-3 px-5 text-center text-xs text-[var(--danger)]" role="alert">
      <AlertTriangle size={17} />
      <span>{message}</span>
    </div>
  );
}
