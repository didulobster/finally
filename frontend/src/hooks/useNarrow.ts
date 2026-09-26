"use client";
/** True when the viewport is narrower than Tailwind's `lg` breakpoint (1024px). */
import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 1023.98px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
