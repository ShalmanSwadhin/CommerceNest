import { cn } from '../cn';

export interface BarChartPoint {
  label: string;
  value: number;
}

export interface BarChartProps {
  points: BarChartPoint[];
  className?: string;
  height?: number;
  color?: string;
}

/** Lightweight SVG bar chart for admin dashboards (no chart lib) — same
 * conventions as AreaChart (viewBox 0 0 640 height, same label-thinning
 * footer), for discrete counts (orders/day, signups/day) where a smooth
 * area implies a continuity the underlying data doesn't have. */
export function BarChart({
  points,
  className,
  height = 220,
  color = 'var(--cn-color-primary)',
}: BarChartProps) {
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const w = 640;
  const h = height;
  const padX = 8;
  const padY = 12;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  if (points.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-[var(--cn-color-text-secondary)]',
          className,
        )}
        style={{ height }}
      >
        No chart data
      </div>
    );
  }

  const gap = 4;
  const barW = Math.max(1, innerW / points.length - gap);

  const bars = points.map((p, i) => {
    const barH = (p.value / max) * innerH;
    const x = padX + i * (innerW / points.length) + gap / 2;
    const y = padY + innerH - barH;
    return { x, y, barH, ...p };
  });

  return (
    <div className={cn('w-full', className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img">
        {bars.map((b) => (
          <rect
            key={b.label}
            x={b.x}
            y={b.y}
            width={barW}
            height={Math.max(0, b.barH)}
            rx={2}
            fill={color}
            fillOpacity={0.85}
          />
        ))}
      </svg>
      <div className="mt-2 flex justify-between gap-1 px-1">
        {points
          .filter((_, i) => i % Math.ceil(points.length / 6) === 0 || i === points.length - 1)
          .map((p) => (
            <span key={p.label} className="text-[10px] text-[var(--cn-color-text-tertiary)]">
              {p.label.slice(5)}
            </span>
          ))}
      </div>
    </div>
  );
}
