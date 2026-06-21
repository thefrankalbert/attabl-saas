interface SparklineProps {
  /** Series of numeric samples drawn left to right. */
  data: number[];
  className?: string;
  width?: number;
  height?: number;
  ariaLabel?: string;
}

/**
 * Small presentational SVG area + line sparkline.
 * Normalizes the series to the box height. When the series is empty or all
 * zeros it falls back to a flat baseline so the cell never looks broken.
 *
 * Pure SVG, no hooks - safe to render inside a server component.
 */
export function Sparkline({ data, className, width = 56, height = 20, ariaLabel }: SparklineProps) {
  const max = data.length > 0 ? Math.max(...data) : 0;
  const min = data.length > 0 ? Math.min(...data) : 0;
  const isFlat = data.length < 2 || max === min;

  if (isFlat) {
    const midY = height / 2;
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1={0}
          y1={midY}
          x2={width}
          y2={midY}
          stroke="var(--cc-soft)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const span = max - min;
  const stepX = width / (data.length - 1);
  const points = data.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / span) * height;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <path d={areaPath} fill="var(--cc-accent-ink)" fillOpacity={0.12} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--cc-accent-ink)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
