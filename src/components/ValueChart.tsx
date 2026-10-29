import {useState} from 'react';
import {compactMoney, money} from '../format';
import {dayLabel} from '../periods';
import type {SavingsValue} from '../types';

interface Props {
  /** The values typed by hand, oldest first. */
  values: SavingsValue[];
  currency: string;
}

/**
 * A savings account's value over time: a line through the values typed by hand, placed by their day, between its
 * lowest and highest value (not from zero, so a few percent show). Each value is a dot with a tooltip: its day, the
 * value, and the change since the one before. None with fewer than two values.
 */
export function ValueChart({values, currency}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (values.length < 2) return null;
  const times = values.map(item => Date.parse(item.date));
  const [first, last] = [times[0], times[times.length - 1]];
  const lowest = Math.min(...values.map(item => item.value));
  const highest = Math.max(...values.map(item => item.value));
  // A little room above and below, so the line never sits on the edge.
  const room = Math.max((highest - lowest) * 0.15, highest * 0.002, 1);
  const [low, high] = [lowest - room, highest + room];
  const x = (index: number) => (last === first ? 50 : ((times[index] - first) / (last - first)) * 100);
  const y = (value: number) => ((value - low) / (high - low)) * 100;
  const path = values
    .map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${(100 - y(item.value)).toFixed(2)}`)
    .join(' ');
  return (
    <figure className="value-chart">
      <figcaption>Value over time</figcaption>
      <div className="value-plot">
        <span className="value-axis is-top">{compactMoney(highest, currency)}</span>
        <span className="value-axis is-bottom">{compactMoney(lowest, currency)}</span>
        <svg className="value-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={path} vectorEffect="non-scaling-stroke" />
        </svg>
        {values.map((item, index) => {
          const change = index > 0 ? item.value - values[index - 1].value : null;
          const edge = x(index) < 15 ? ' is-start' : x(index) > 85 ? ' is-end' : '';
          return (
            <span
              key={item.date}
              className={`value-dot${hovered === index ? ' is-hovered' : ''}`}
              style={{left: `${x(index)}%`, bottom: `${y(item.value)}%`}}
              onPointerEnter={() => setHovered(index)}
              onPointerLeave={() => setHovered(null)}
              // A tap shows it on a phone, and hides it again.
              onClick={() => setHovered(shown => (shown === index ? null : index))}
            >
              {hovered === index && (
                <span className={`chart-tip${edge}`} role="tooltip" style={{bottom: '14px'}}>
                  <strong>{dayLabel(item.date, true)}</strong>
                  <span>{money(item.value, currency, true)}</span>
                  {change !== null && (
                    <span>
                      {change >= 0 ? '+' : '−'}
                      {money(Math.abs(change), currency, true)} since {dayLabel(values[index - 1].date, true)}
                    </span>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div className="value-dates" aria-hidden="true">
        <span>{dayLabel(values[0].date, true)}</span>
        <span>{dayLabel(values[values.length - 1].date, true)}</span>
      </div>
    </figure>
  );
}
