import {useState} from 'react';
import type {Categories} from '../categories';
import {compactMoney, money} from '../format';
import {type Grain, periodLabel} from '../periods';
import {type Report, rollingAverage, trendOf} from '../report';
import {ChartTip} from './ChartTip';
import {TrendLine} from './TrendLine';

interface Props {
  series: Report['series'];
  selected: string;
  grain: Grain;
  currency: string;
  usual: number | null;
  /** For the tooltip's top categories. */
  categories: Categories;
  onSelect: (period: string) => void;
}

/** Round steps for the value axis: 0, 250, 500... */
function ticksFor(max: number) {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find(factor => rough <= factor * magnitude) ?? 10) * magnitude;
  return Array.from({length: Math.ceil(max / step) + 1}, (_value, index) => index * step);
}

/** "€420 more" or "€80 less", or "the same" within a euro. */
function difference(value: number, currency: string) {
  if (Math.abs(value) < 1) return 'the same';
  return `${money(Math.abs(value), currency)} ${value > 0 ? 'more' : 'less'}`;
}

/**
 * Spending per week or month, one column each: its fixed part (decided in advance) darker at the bottom, a tick at
 * what the same period cost a year before, and for the period still going, a dashed outline up to where it should
 * land. The chosen period has a band behind it. The tooltip tells it all, with the period's top categories.
 */
export function PeriodChart({series, selected, grain, currency, usual, categories, onSelect}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  // The trend of the full periods only: its direction in words, its line through each period's average with its
  // neighbours.
  const full = series.map(item => (item.partial ? null : item.total));
  const trend = trendOf(full);
  const ticks = ticksFor(
    Math.max(1, usual ?? 0, ...series.map(item => Math.max(item.total, item.projected ?? 0, item.lastYear ?? 0))),
  );
  const top = ticks[ticks.length - 1];
  const height = (value: number) => `${(Math.max(0, value) / top) * 100}%`;
  const unit = grain === 'all' ? 'year' : grain;
  // Flat when it moves by less than 1% of a usual period each time.
  const trendText =
    trend &&
    (Math.abs(trend.step) < trend.mean * 0.01
      ? `Trend (3-${unit} average): flat`
      : `Trend (3-${unit} average): ${trend.step > 0 ? 'up' : 'down'} about ${money(Math.abs(trend.step), currency)} a ${unit}`);
  return (
    // On a phone, every other label from 9 columns, one in four from 13, so they never run into each other.
    <figure
      className={`chart${series.length > 8 ? ' is-dense' : ''}${series.length > 12 ? ' is-crowded' : ''}${
        series.length > 24 ? ' is-long' : ''
      }`}
    >
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
        {trend && <TrendLine values={rollingAverage(full)} top={top} />}
        <div className="chart-columns" onMouseLeave={() => setHovered(null)}>
          {series.map((item, index) => {
            const top = [...item.categories]
              .filter(([, value]) => value >= 0.5)
              .sort((first, second) => second[1] - first[1])
              .slice(0, 3);
            const landing = item.projected !== null && item.projected > item.total + 1 ? item.projected : null;
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
                {landing !== null && <span className="chart-landing" style={{height: height(landing)}} />}
                <span className={`chart-bar${item.partial ? ' is-partial' : ''}`} style={{height: height(item.total)}}>
                  {item.fixed > 0 && item.total > 0 && (
                    <span
                      className="chart-bar-fixed"
                      style={{height: `${Math.min(100, (item.fixed / item.total) * 100)}%`}}
                    />
                  )}
                </span>
                {item.lastYear !== null && (
                  <span className="chart-year-before" style={{bottom: height(item.lastYear)}} />
                )}
                {hovered === index && (
                  <ChartTip
                    column={index}
                    columns={series.length}
                    bottom={`calc(${height(Math.max(item.total, landing ?? 0))} + 10px)`}
                  >
                    <strong>{periodLabel(item.period, grain)}</strong>
                    <span>
                      {money(item.total, currency)} · {item.payments} payments
                      {item.partial === 'ongoing' ? ' so far' : ''}
                    </span>
                    {landing !== null && <span>Should land around {money(landing, currency)}</span>}
                    {item.partial === 'first' && <span>only partly covered by your data</span>}
                    <span>
                      Fixed {money(item.fixed, currency)} · flexible{' '}
                      {money(Math.max(0, item.total - item.fixed), currency)}
                    </span>
                    {usual !== null && usual > 0 && !item.partial && (
                      <span>{difference(item.total - usual, currency)} than usual</span>
                    )}
                    {item.lastYear !== null && (
                      <span>
                        A year before: {money(item.lastYear, currency)} (
                        {difference((landing ?? item.total) - item.lastYear, currency)} now)
                      </span>
                    )}
                    {top.map(([key, value]) => (
                      <span key={key} className="chart-tip-category">
                        {categories.byKey[key]?.icon} {categories.byKey[key]?.label ?? key} {money(value, currency)}
                      </span>
                    ))}
                  </ChartTip>
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
      <div className="chart-keys">
        {trendText && (
          <p className="chart-key">
            <span className="chart-key-line" aria-hidden="true" />
            {trendText}
          </p>
        )}
        <p className="chart-key">
          <span className="chart-key-swatch is-fixed" aria-hidden="true" />
          Fixed
          <span className="chart-key-swatch is-flexible" aria-hidden="true" />
          flexible
        </p>
        {series.some(item => item.lastYear !== null) && (
          <p className="chart-key">
            <span className="chart-key-tick" aria-hidden="true" />A year before
          </p>
        )}
        {series.some(item => item.projected !== null && item.projected > item.total + 1) && (
          <p className="chart-key">
            <span className="chart-key-landing" aria-hidden="true" />
            Where this {unit} should land
          </p>
        )}
        {series.some(item => item.partial) && (
          <p className="chart-key">
            <span className="chart-key-swatch" aria-hidden="true" />
            Striped: a {unit} still going, or only partly in your data
          </p>
        )}
      </div>
    </figure>
  );
}
