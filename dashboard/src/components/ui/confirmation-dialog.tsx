"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmationDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive" | "outline";
  busy?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  busy = false,
  children,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef({ busy, onCancel });

  useEffect(() => {
    stateRef.current = { busy, onCancel };
  }, [busy, onCancel]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !stateRef.current.busy) {
        event.preventDefault();
        stateRef.current.onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="terminal-dialog-backdrop fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="terminal-dialog w-full max-w-[480px] border border-[var(--line)] bg-[var(--surface-low)] shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <div className="flex items-center gap-3 border-b border-[var(--line-soft)] px-5 py-4 text-[var(--warning)]">
          <AlertTriangle size={19} />
          <span className="terminal-label text-[var(--warning)]">Lifecycle confirmation</span>
        </div>
        <div className="p-5 sm:p-6">
          <h2 id="confirm-title" className="font-display text-lg font-bold">{title}</h2>
          <p id="confirm-description" className="mt-3 text-xs leading-6 text-[var(--text-soft)]">{description}</p>
          {children ? <div className="mt-5">{children}</div> : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} variant="outline" onClick={onCancel} disabled={busy}>取消</Button>
            <Button variant={confirmVariant} onClick={onConfirm} disabled={busy} aria-busy={busy}>
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
              {busy ? "正在发送" : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
