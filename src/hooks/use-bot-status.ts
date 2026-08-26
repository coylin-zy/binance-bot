"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/api";
import type { ShowConfig } from "@/lib/freqtrade/types";

export function useBotStatus() {
  const { data, error, isLoading, mutate } = useSWR<ShowConfig>("/api/ft/show_config", apiFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });
  return { config: data, error, isLoading, mutate };
}
