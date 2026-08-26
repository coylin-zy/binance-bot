import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPct(value: number | undefined | null): string {
  if (value === undefined || value === null) return "--";
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatUsd(value: number | undefined | null): string {
  if (value === undefined || value === null) return "--";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)}M`;
  if (abs >= 10000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  if (abs < 1 && abs > 0) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function profitClass(value: number | undefined | null): string {
  if (value === undefined || value === null || value === 0) return "";
  return value > 0 ? "profit-pos" : "profit-neg";
}

export function positionRiskDistance(
  currentRate: number | undefined | null,
  stopLossRate: number | undefined | null,
  isShort: boolean,
): number | null {
  if (!currentRate || !stopLossRate || currentRate <= 0 || stopLossRate <= 0) return null;
  const distance = isShort
    ? (stopLossRate - currentRate) / currentRate
    : (currentRate - stopLossRate) / currentRate;
  return Number.isFinite(distance) ? distance : null;
}
