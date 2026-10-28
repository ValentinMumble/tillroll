interface Props {
  /** Each column's value on the line (see rollingAverage); null leaves the column out. */
  values: (number | null)[];
  /** The value at the top of the plot. */
  top: number;
}

/**
 * A trend over a chart's columns: a dashed line through the middle of each column that has a value, curving smoothly
 * from one to the next (a Catmull-Rom curve), from the first to the last.
 */
export function TrendLine({values, top}: Props) {
  const points = values.flatMap((value, index) =>
    value === null ? [] : [{x: ((index + 0.5) / values.length) * 100, y: 100 - (Math.max(0, value) / top) * 100}],
  );
  if (points.length < 2) return null;
  const at = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  let path = `M ${at(points[0].x, points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] ?? points[index];
    const from = points[index];
    const to = points[index + 1];
    const after = points[index + 2] ?? to;
    path += ` C ${at(from.x + (to.x - before.x) / 6, from.y + (to.y - before.y) / 6)}, ${at(
      to.x - (after.x - from.x) / 6,
      to.y - (after.y - from.y) / 6,
    )}, ${at(to.x, to.y)}`;
  }
  return (
    <svg className="chart-trend" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
