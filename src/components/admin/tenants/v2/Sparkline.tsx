interface SparklineProps {
  /** Series of numeric samples drawn left to right. */
  data: number[];
  className?: string;
  width?: number;
  height?: number;
  ariaLabel?: string;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Builds a smooth cubic-bezier path through the points (Catmull-Rom), so the
 * sparkline reads as a clean curve instead of a jagged polyline.
 */
function smoothLine(points: Point[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Small presentational SVG area + line sparkline. Renders a smooth curve; when
 * the series is empty or flat it falls back to a centered baseline so the cell
 * never looks broken. Pure SVG, no hooks - safe in a server component.
 * A small vertical inset keeps the 1.5px stroke from clipping at the box edges.
 */
export function Sparkline({ data, className, width = 64, height = 24, ariaLabel }: SparklineProps) {
  const pad = 2;
  const innerH = height - pad * 2;
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
  const points: Point[] = data.map((value, index) => ({
    x: index * stepX,
    y: pad + (innerH - ((value - min) / span) * innerH),
  }));

  const linePath = smoothLine(points);
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      <path d={areaPath} fill="var(--cc-viz)" fillOpacity={0.1} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="var(--cc-viz)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
