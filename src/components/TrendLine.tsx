import {smoothPath} from '../curve';

interface Props {
  /** Each column's value on the line (see rollingAverage); null leaves the column out. */
  values: (number | null)[];
  /** The value at the top of the plot. */
  top: number;
}

/**
 * A trend over a chart's columns: a dashed line through the middle of each column that has a value, curving smoothly
 * from one to the next, from the first to the last.
 */
export function TrendLine({values, top}: Props) {
  const points = values.flatMap((value, index) =>
    value === null ? [] : [{x: ((index + 0.5) / values.length) * 100, y: 100 - (Math.max(0, value) / top) * 100}],
  );
  if (points.length < 2) return null;
  return (
    <svg className="chart-trend" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={smoothPath(points)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
