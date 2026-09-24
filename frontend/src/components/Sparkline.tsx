/** Tiny SVG line of recent prices, green when `rising` else red. */
import type { PricePoint } from "@/hooks/usePriceStream";

export function Sparkline({ points, rising, width = 72, height = 22 }: { points: PricePoint[]; rising: boolean; width?: number; height?: number }) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden />;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const coords = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 1 - ((v - min) / range) * (height - 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} aria-hidden className={rising ? "text-up" : "text-down"}>
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}
