import {useState} from 'react';
import {compactMoney, money} from '../format';
import {type Grain, periodLabel} from '../periods';
import type {Report} from '../report';

interface Props {
  series: Report['series'];
  selected: string;
  grain: Grain;
  currency: string;
  usual: number | null;
  onSelect: (period: string) => void;
}

/** Round steps for the value axis: 0, 250, 500... */
function ticksFor(max: number) {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find(factor => rough <= factor * magnitude) ?? 10) * magnitude;
  return Array.from({length: Math.ceil(max / step) + 1}, (_value, index) => index * step);
}

/**
 * The trend of the full periods (one still going or only partly in the data is left out): the straight line closest
 * to their totals, at the first column and the last, and how much it rises or falls from one period to the next.
 * None with fewer than three full periods.
 */
function trendOf(series: Props['series']) {
  const points = series.flatMap((item, index) => (item.partial ? [] : [{x: index, y: item.total}]));
  if (points.length < 3) return null;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const spread = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const step = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / spread;
  const at = (x: number) => meanY + step * (x - meanX);
  return {step, mean: meanY, first: at(0), last: at(series.length - 1)};
}

/** Spending per week or month, one column each; the chosen period is the strong one. */
export function PeriodChart({series, selected, grain, currency, usual, onSelect}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const trend = trendOf(series);
  const ticks = ticksFor(
    Math.max(1, usual ?? 0, trend?.first ?? 0, trend?.last ?? 0, ...series.map(item => item.total)),
  );
  const top = ticks[ticks.length - 1];
  const height = (value: number) => `${(Math.max(0, value) / top) * 100}%`;
  const unit = grain === 'all' ? 'year' : grain;
  // Flat when it moves by less than 1% of a usual period each time.
  const trendText =
    trend &&
    (Math.abs(trend.step) < trend.mean * 0.01
      ? 'Trend: flat'
      : `Trend: ${trend.step > 0 ? 'up' : 'down'} about ${money(Math.abs(trend.step), currency)} a ${unit}`);
  return (
    // On a phone, every other label from 9 columns, one in four from 13, so they never run into each other.
    <figure className={`chart${series.length > 8 ? ' is-dense' : ''}${series.length > 12 ? ' is-crowded' : ''}`}>
      <figcaption className="visually-hidden">Spending per {grain}</figcaption>
      <div className="chart-plot">
        {ticks.map(tick => (
          <div key={tick} className="chart-gridline" style={{bottom: height(tick)}}>
            <span>{compactMoney(tick, currency)}</span>
          </div>
        ))}
        {usual !== null && usual > 0 && (
          <div className="chart-usual" style={{bottom: height(usual)}}>
            <span>usual {money(usual, currency)}</span>
          </div>
        )}
        {/* Over the columns, from the middle of the first to the middle of the last. */}
        {trend && (
          <svg className="chart-trend" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line
              x1={(0.5 / series.length) * 100}
              y1={100 - (Math.max(0, trend.first) / top) * 100}
              x2={((series.length - 0.5) / series.length) * 100}
              y2={100 - (Math.max(0, trend.last) / top) * 100}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        <div className="chart-columns" onMouseLeave={() => setHovered(null)}>
          {series.map((item, index) => {
            const edge = index < 2 ? ' is-start' : index > series.length - 3 ? ' is-end' : '';
            return (
              <button
                key={item.period}
                type="button"
                className={`chart-column${item.period === selected ? ' is-selected' : ''}`}
                aria-pressed={item.period === selected}
                aria-label={`${periodLabel(item.period, grain)}: ${money(item.total, currency)}${
                  item.partial === 'ongoing' ? ' so far' : item.partial === 'first' ? ', partly covered' : ''
                }`}
                onClick={() => onSelect(item.period)}
                onMouseEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
              >
                <span
                  className={`chart-bar${item.partial ? ' is-partial' : ''}`}
                  style={{height: height(item.total)}}
                />
                {hovered === index && (
                  <span
                    className={`chart-tip${edge}`}
                    role="tooltip"
                    style={{bottom: `calc(${height(item.total)} + 10px)`}}
                  >
                    <strong>{periodLabel(item.period, grain)}</strong>
                    <span>
                      {money(item.total, currency)} · {item.payments} payments
                    </span>
                    {item.partial && (
                      <span>{item.partial === 'ongoing' ? 'so far' : 'only partly covered by your data'}</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="chart-axis" aria-hidden="true">
        {series.map(item => (
          <span key={item.period} className={item.period === selected ? 'is-selected' : undefined}>
            {periodLabel(item.period, grain, true)}
          </span>
        ))}
      </div>
      {trendText && (
        <p className="chart-key">
          <span className="chart-key-line" aria-hidden="true" />
          {trendText}
        </p>
      )}
      {series.some(item => item.partial) && (
        <p className="chart-key">
          <span className="chart-key-swatch" aria-hidden="true" />
          Striped: a {unit} still going, or only partly in your data
        </p>
      )}
    </figure>
  );
}
