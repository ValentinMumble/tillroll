import {type PointerEvent, useId, useState} from 'react';
import {money} from '../format';
import {addDays, dayLabel, type Grain} from '../periods';
import {type Pace, timeAndMoney} from '../report';
import {TimeMoneyText} from './PaceBars';

interface Props {
  pace: Pace;
  ongoing: boolean;
  grain: Grain;
  currency: string;
  /** The period's first day. */
  from: string;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * Time against money as two lines over the period, on one scale where the top line is a usual period: the time gone
 * (a straight grey line, all of it on the last day) and the money spent so far (blue, red above a usual period, a dot
 * on the last day). The blue line above the grey one: spending faster than the period goes. A finger or the mouse on
 * the plot shows any day.
 */
export function PaceLines(props: Props) {
  const {pace, ongoing, grain, currency, from} = props;
  const [hovered, setHovered] = useState<number | null>(null);
  const clip = useId();
  const {whole, moneyShare, word, time, money: spending} = timeAndMoney(pace, ongoing, grain, currency);
  const {days, spent} = pace;
  if (!whole || days < 2) return null;
  const shares = spent.map(value => value / whole);
  const top = Math.max(1, ...shares) * 1.08;
  const x = (index: number) => (index / (days - 1)) * 100;
  const y = (share: number) => 100 - (Math.max(0, share) / top) * 100;
  const timeAt = (index: number) => (index + 1) / days;
  const last = spent.length - 1;
  const moneyPoints = shares.map((share, index) => `${x(index)},${y(share)}`).join(' ');

  function hover(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHovered(Math.round(ratio * (days - 1)));
  }

  const edge = hovered === null ? '' : x(hovered) < 20 ? ' is-start' : x(hovered) > 80 ? ' is-end' : '';
  return (
    <div className="pace pace-lines">
      <figure className="progress">
        <figcaption className="visually-hidden">
          {spending.label}: {spending.value}. {time.label}: {time.value}
        </figcaption>
        <div
          className="progress-plot"
          onPointerDown={hover}
          onPointerMove={hover}
          onPointerLeave={() => setHovered(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <clipPath id={`${clip}-under`}>
                <rect x="0" y={y(1)} width="100" height={100 - y(1)} />
              </clipPath>
              <clipPath id={`${clip}-over`}>
                <rect x="0" y="0" width="100" height={y(1)} />
              </clipPath>
            </defs>
            <line className="progress-whole" x1="0" y1={y(1)} x2="100" y2={y(1)} />
            <polyline className="progress-time" points={`0,${y(timeAt(0))} 100,${y(1)}`} />
            {last > 0 && (
              <>
                <polyline className="progress-spent" points={moneyPoints} clipPath={`url(#${clip}-under)`} />
                <polyline className="progress-over" points={moneyPoints} clipPath={`url(#${clip}-over)`} />
              </>
            )}
          </svg>
          <span className="progress-whole-label" style={{top: `${y(1)}%`}}>
            usual {word} {money(whole, currency)}
          </span>
          {last >= 0 && (
            <span
              className={`progress-dot${shares[last] > 1 ? ' is-over' : ''}`}
              style={{left: `${x(last)}%`, top: `${y(shares[last])}%`}}
            />
          )}
          {hovered !== null && (
            <>
              <span className="progress-cursor" style={{left: `${x(hovered)}%`}} />
              <span
                className={`chart-tip progress-tip${edge}`}
                role="tooltip"
                // Near an edge the tip sticks to it instead (see .chart-tip.is-start and .is-end).
                style={edge ? undefined : {left: `${x(hovered)}%`}}
              >
                <strong>{dayLabel(addDays(from, hovered))}</strong>
                {hovered <= last && (
                  <span>
                    {money(spent[hovered], currency)} spent · {percent(shares[hovered])}
                  </span>
                )}
                <span>
                  {percent(timeAt(hovered))} of the {word} gone
                </span>
              </span>
            </>
          )}
        </div>
        <div className="progress-axis" aria-hidden="true">
          <span>{dayLabel(from)}</span>
          <span>{dayLabel(addDays(from, days - 1))}</span>
        </div>
      </figure>
      <p className="pace-key">
        <span className={`pace-key-dot${moneyShare > 1 ? ' is-over' : ''}`} aria-hidden="true" />
        <strong>{spending.label}</strong> {spending.value}
      </p>
      <p className="pace-key">
        <span className="pace-key-dot is-time" aria-hidden="true" />
        <strong>{time.label}</strong> {time.value}
      </p>
      <TimeMoneyText {...props} />
    </div>
  );
}
