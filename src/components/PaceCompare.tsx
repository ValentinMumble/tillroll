import {type PointerEvent, useId, useState} from 'react';
import {monotonePath} from '../curve';
import {money} from '../format';
import type {Pace} from '../report';
import {ChartTip} from './ChartTip';

interface Props {
  pace: Pace;
  currency: string;
  /** "month", "week" or "year": the period's word for the key and the tooltip. */
  word: string;
}

/** Room above the highest line, in percent of the height, so a line never runs along the top edge. */
const HEADROOM = 8;

/**
 * This period's spending day by day against the period before's, beside the receipt's large number: last period's
 * whole (dashed grey), this one up to today (blue over a fading fill, a dot on today). No key: the spent line under it says
 * "than this point last month", and a day under the pointer, or tapped, names both with their amounts. None without
 * the period before in the data.
 */
export function PaceCompare({pace, currency, word}: Props) {
  const [day, setDay] = useState<number | null>(null);
  // Its own gradient's id: an id the page's other charts never take.
  const fill = `pace-fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const {previous, spent, days} = pace;
  if (!previous || spent.length === 0 || days < 2) return null;
  const top = Math.max(1, ...previous, ...spent) * (1 + HEADROOM / 100);
  const x = (index: number) => (index / (days - 1)) * 100;
  const y = (value: number) => 100 - (value / top) * 100;
  const line = (values: number[]) => monotonePath(values.map((value, index) => ({x: x(index), y: y(value)})));
  const today = spent.length - 1;
  /** The day under the pointer, from where it is across the chart. */
  function pick(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.round(((event.clientX - box.left) / box.width) * (days - 1));
    setDay(Math.min(days - 1, Math.max(0, index)));
  }
  return (
    <figure className="pace-compare">
      <div
        className="pace-compare-plot"
        role="img"
        aria-label={`Spent day by day: ${money(spent[today], currency)} by day ${today + 1} this ${word}, ${money(
          previous[today],
          currency,
        )} by the same day last ${word}`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setDay(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="pace-compare-fill-top" />
              <stop offset="100%" className="pace-compare-fill-bottom" />
            </linearGradient>
          </defs>
          <path className="pace-compare-area" d={`${line(spent)} L ${x(today)} 100 L 0 100 Z`} fill={`url(#${fill})`} />
          <path className="pace-compare-before" d={line(previous)} vectorEffect="non-scaling-stroke" />
          <path className="pace-compare-now" d={line(spent)} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="pace-compare-dot" style={{left: `${x(today)}%`, top: `${y(spent[today])}%`}} />
        {day !== null && (
          <>
            <span className="pace-compare-cursor" style={{left: `${x(day)}%`}} />
            <ChartTip edge={x(day) < 20 ? 'start' : x(day) > 80 ? 'end' : null} left={`${x(day)}%`} bottom="100%">
              <strong>Day {day + 1}</strong>
              {day < spent.length && (
                <span>
                  This {word} {money(spent[day], currency)}
                </span>
              )}
              <span>
                Last {word} {money(previous[day], currency)}
              </span>
            </ChartTip>
          </>
        )}
      </div>
    </figure>
  );
}
