import type {Grain} from '../periods';

interface Props {
  /** The chart's periods: weeks and months only can go further back. */
  grain: Grain;
  /** 1, 2 or 3 times the chart's usual length. */
  span: number;
  onChange: (span: number) => void;
}

/**
 * How far back a chart of the periods goes: 1, 2 or 3 years of months, or 16, 32 or 48 weeks. The month chart and the
 * pay chart share it: changing it in one changes both.
 */
export function ChartSpan({grain, span, onChange}: Props) {
  if (grain !== 'month' && grain !== 'week') return null;
  return (
    <div className="segmented is-small chart-span" role="group" aria-label="How far back">
      {[1, 2, 3].map(item => (
        <button key={item} type="button" aria-pressed={span === item} onClick={() => onChange(item)}>
          {grain === 'week' ? `${item * 16} weeks` : item === 1 ? '1 year' : `${item} years`}
        </button>
      ))}
    </div>
  );
}
