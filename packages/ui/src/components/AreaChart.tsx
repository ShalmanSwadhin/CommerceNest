import { cn } from '../cn';

export interface AreaChartPoint {
  label: string;
  value: number;
}

export interface AreaChartProps {
  points: AreaChartPoint[];
  className?: string;
  height?: number;
  color?: string;
}

/** Lightweight SVG area chart for admin dashboards (no chart lib). */
export function AreaChart({
  points,
  className,
  height = 220,
  color = 'var(--cn-color-primary)',
}: AreaChartProps) {
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

  const coords = points.map((p, i) => {
    const x =
      padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = padY + innerH - (p.value / max) * innerH;
    return { x, y, ...p };
  });

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const area = `${line} L ${coords[coords.length - 1]!.x} ${padY + innerH} L ${coords[0]!.x} ${padY + innerH} Z`;

  return (
    <div className={cn('w-full', className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img">
        <defs>
          <linearGradient id="cn-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#cn-area-fill)" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c) => (
          <circle key={c.label} cx={c.x} cy={c.y} r="3.5" fill={color} />
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
