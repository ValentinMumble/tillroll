import {useState} from 'react';
import {monotonePath} from '../curve';
import {compactMoney, money} from '../format';
import {addDays, dayLabel} from '../periods';
import type {SavingsValue} from '../types';
import {ChartTip} from './ChartTip';

/** The least room between two dots, in percent of the chart's width. */
const MIN_DOT_GAP = 4;

/** How far back the chart goes, counted from the latest value. */
const RANGES = [
  {key: 'quarter', label: '3 months', days: 92},
  {key: 'year', label: '1 year', days: 366},
  {key: 'all', label: 'All', days: null},
] as const;
type Range = (typeof RANGES)[number]['key'];

interface Props {
  /** The values typed by hand, oldest first. */
  values: SavingsValue[];
  currency: string;
}

/**
 * A savings account's value over time: a smooth line through the values typed by hand, placed by their day, between
 * its lowest and highest value (not from zero, so a few percent show). It goes back 3 months, 1 year or all the way:
 * a year-end value from a statement would squeeze the values typed lately into one corner. It opens on the shortest
 * range with two values, and offers only the ranges that show more. Each value is a dot with a tooltip: its day, the
 * value, and the change since the one before. None with fewer than two values.
 */
export function ValueChart({values, currency}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Range | null>(null);
  if (values.length < 2) return null;
  const latest = values[values.length - 1].date;
  // Where each range starts in the list, keeping a range only when it shows two values and more than the one before.
  const starts = new Map<Range, number>();
  let previous = -1;
  for (const range of RANGES) {
    const from = range.days === null ? '' : addDays(latest, -range.days);
    const start = values.findIndex(item => item.date >= from);
    if (values.length - start >= 2 && start !== previous) {
      starts.set(range.key, start);
      previous = start;
    }
  }
  const range = chosen && starts.has(chosen) ? chosen : (starts.keys().next().value ?? 'all');
  const start = starts.get(range) ?? 0;
  const shown = values.slice(start);
  const times = shown.map(item => Date.parse(item.date));
  const [first, last] = [times[0], times[times.length - 1]];
  const lowest = Math.min(...shown.map(item => item.value));
  const highest = Math.max(...shown.map(item => item.value));
  // A little room above and below, so the line never sits on the edge.
  const room = Math.max((highest - lowest) * 0.15, highest * 0.002, 1);
  const [low, high] = [lowest - room, highest + room];
  const x = (index: number) => (last === first ? 50 : ((times[index] - first) / (last - first)) * 100);
  const y = (value: number) => ((value - low) / (high - low)) * 100;
  const path = monotonePath(shown.map((item, index) => ({x: x(index), y: 100 - y(item.value)})));
  // A dot for each value at least 4% of the width from the next one kept, so values typed days apart do not pile up:
  // the latest always has one, and the list under the chart has them all.
  const dotted = new Set<number>();
  for (let index = shown.length - 1, kept = Infinity; index >= 0; index -= 1) {
    if (kept - x(index) >= MIN_DOT_GAP) {
      dotted.add(index);
      kept = x(index);
    }
  }
  return (
    <figure className="value-chart">
      <figcaption>
        Value over time
        {starts.size > 1 && (
          <span className="segmented is-small" role="group" aria-label="How far back">
            {RANGES.filter(item => starts.has(item.key)).map(item => (
              <button
                key={item.key}
                type="button"
                aria-pressed={item.key === range}
                onClick={() => {
                  setChosen(item.key);
                  setHovered(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </span>
        )}
      </figcaption>
      <div className="value-plot">
        <span className="value-axis is-top">{compactMoney(highest, currency)}</span>
        <span className="value-axis is-bottom">{compactMoney(lowest, currency)}</span>
        <svg className="value-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={path} vectorEffect="non-scaling-stroke" />
        </svg>
        {shown.map((item, index) => {
          if (!dotted.has(index)) return null;
          // The change since the value typed before it, even one before the range.
          const before = values[start + index - 1];
          return (
            <span
              key={item.date}
              className={`value-dot${hovered === index ? ' is-hovered' : ''}`}
              style={{left: `${x(index)}%`, bottom: `${y(item.value)}%`}}
              onPointerEnter={() => setHovered(index)}
              onPointerLeave={() => setHovered(null)}
              // A tap shows it on a phone, and hides it again.
              onClick={() => setHovered(open => (open === index ? null : index))}
            >
              {hovered === index && (
                <ChartTip edge={x(index) < 15 ? 'start' : x(index) > 85 ? 'end' : null} bottom="14px">
                  <strong>{dayLabel(item.date, true)}</strong>
                  <span>{money(item.value, currency, true)}</span>
                  {before && (
                    <span>
                      {item.value >= before.value ? '+' : '−'}
                      {money(Math.abs(item.value - before.value), currency, true)} since {dayLabel(before.date, true)}
                    </span>
                  )}
                </ChartTip>
              )}
            </span>
          );
        })}
      </div>
      <div className="value-dates" aria-hidden="true">
        <span>{dayLabel(shown[0].date, true)}</span>
        <span>{dayLabel(shown[shown.length - 1].date, true)}</span>
      </div>
    </figure>
  );
}
