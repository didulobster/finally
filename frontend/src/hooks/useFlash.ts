"use client";
/** Returns "up" / "down" briefly after `value` rises or falls, then null so the CSS tint fades. */
import { useEffect, useState } from "react";

export const FLASH_HOLD_MS = 120;

export function useFlash(value: number | undefined): "up" | "down" | null {
  const [previous, setPrevious] = useState(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  if (value !== previous) {
    setPrevious(value);
    if (value !== undefined && previous !== undefined) setFlash(value > previous ? "up" : "down");
  }

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_HOLD_MS);
    return () => clearTimeout(timer);
  }, [flash, value]);

  return flash;
}
