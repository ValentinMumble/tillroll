import type {ReactNode} from 'react';

interface Props {
  /** Its column and how many there are: by the first two or the last two, it sits inside the chart. */
  column?: number;
  columns?: number;
  /** Or the side it sits against, worked out by a chart with no columns; null centres it. */
  edge?: 'start' | 'end' | null;
  /** How high it starts, from the bottom of what holds it (a CSS length). */
  bottom?: string;
  /** Where its middle is, from the left of what holds it, when it is not against a side (a CSS length). */
  left?: string;
  /** A chart's own look on top of the shared one. */
  className?: string;
  children: ReactNode;
}

/**
 * Every chart's tooltip: dark, over the chart, centred on what it is about, and kept inside the chart near either
 * side. The first line (`<strong>`) says which period or part it is, then one line per fact.
 */
export function ChartTip({column, columns, edge, bottom, left, className, children}: Props) {
  const side =
    edge !== undefined
      ? edge
      : column === undefined || columns === undefined
        ? null
        : column < 2
          ? 'start'
          : column > columns - 3
            ? 'end'
            : null;
  return (
    <span
      className={`chart-tip${className ? ` ${className}` : ''}${side ? ` is-${side}` : ''}`}
      role="tooltip"
      style={{bottom, left: side ? undefined : left}}
    >
      {children}
    </span>
  );
}
