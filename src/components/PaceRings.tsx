import {money as formatMoney} from '../format';
import type {Grain} from '../periods';
import {type Pace, timeAndMoney} from '../report';

interface Props {
  pace: Pace;
  ongoing: boolean;
  grain: Grain;
  currency: string;
}

/** Under the rings: what is left of a usual period for each day left, or how far past it the period is. */
function TimeMoneyText({pace, ongoing, grain, currency}: Props) {
  const {spent, whole, left, word} = timeAndMoney(pace, ongoing, grain, currency);
  if (!whole) return null;
  const remaining = whole - spent;
  return (
    <p className="pace-text">
      {remaining < 0
        ? `Over a usual ${word} by ${formatMoney(-remaining, currency)}`
        : !ongoing
          ? `Under a usual ${word} by ${formatMoney(remaining, currency)}`
          : left === 0
            ? `${formatMoney(remaining, currency)} left for the last day`
            : `About ${formatMoney(remaining / left, currency)} a day for the ${left === 1 ? 'day' : `${left} days`} left`}
      {ongoing && remaining < 0 && left > 0 && (
        <span className="muted"> · {left === 1 ? '1 day left' : `${left} days left`}</span>
      )}
    </p>
  );
}

/** The two rings, outside in: the money, then the time, with a gap between them. */
const MONEY_RADIUS = 42;
const TIME_RADIUS = 30;

/** A share of a ring, from the top clockwise, as a dash: 0 to 1. */
function arc(radius: number, share: number) {
  const circumference = 2 * Math.PI * radius;
  return `${Math.min(1, Math.max(0, share)) * circumference} ${circumference}`;
}

/**
 * Time against money as two rings, like an activity tracker: outside, how much of a usual period was spent (blue, a
 * red arc going round again past it); inside, how much of the period has gone (grey). The outer ring further round
 * than the inner one: spending faster than the period goes.
 */
export function PaceRings(props: Props) {
  const {whole, timeShare, moneyShare, time, money} = timeAndMoney(
    props.pace,
    props.ongoing,
    props.grain,
    props.currency,
  );
  if (!whole) return null;
  const ring = (className: string, radius: number, share: number) => (
    <circle
      className={className}
      cx="50"
      cy="50"
      r={radius}
      strokeDasharray={arc(radius, share)}
      transform="rotate(-90 50 50)"
    />
  );
  return (
    <div className="pace pace-ring">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${money.label}: ${money.value}. ${time.label}: ${time.value}`}>
        <circle className="pace-ring-track" cx="50" cy="50" r={MONEY_RADIUS} />
        <circle className="pace-ring-track" cx="50" cy="50" r={TIME_RADIUS} />
        {ring('pace-ring-fill', MONEY_RADIUS, moneyShare)}
        {moneyShare > 1 && ring('pace-ring-over', MONEY_RADIUS, moneyShare - 1)}
        {ring('pace-ring-time', TIME_RADIUS, timeShare)}
      </svg>
      <div className="pace-ring-words">
        <p className="pace-key">
          <span className={`pace-key-dot${moneyShare > 1 ? ' is-over' : ''}`} aria-hidden="true" />
          <strong>{money.label}</strong> {money.value}
        </p>
        <p className="pace-key">
          <span className="pace-key-dot is-time" aria-hidden="true" />
          <strong>{time.label}</strong> {time.value}
        </p>
        <TimeMoneyText {...props} />
      </div>
    </div>
  );
}
