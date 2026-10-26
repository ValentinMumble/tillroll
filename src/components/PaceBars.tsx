import {money} from '../format';
import type {Grain} from '../periods';
import {type Pace, timeAndMoney} from '../report';

interface Props {
  pace: Pace;
  ongoing: boolean;
  grain: Grain;
  currency: string;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Under the bars or the rings: what is left of a usual period for each day left, or how far past it the period is. */
export function TimeMoneyText({pace, ongoing, grain, currency}: Props) {
  const {spent, whole, left, word} = timeAndMoney(pace, ongoing, grain, currency);
  if (!whole) return null;
  const remaining = whole - spent;
  return (
    <p className="pace-text">
      {remaining < 0
        ? `Over a usual ${word} by ${money(-remaining, currency)}`
        : !ongoing
          ? `Under a usual ${word} by ${money(remaining, currency)}`
          : left === 0
            ? `${money(remaining, currency)} left for the last day`
            : `About ${money(remaining / left, currency)} a day for the ${left === 1 ? 'day' : `${left} days`} left`}
      {ongoing && remaining < 0 && left > 0 && (
        <span className="muted"> · {left === 1 ? '1 day left' : `${left} days left`}</span>
      )}
    </p>
  );
}

/**
 * Time against money: two bars on one scale, how much of the period has gone and how much of a usual period was spent
 * (red past it). The money bar longer than the time bar: spending faster than the period goes.
 */
export function PaceBars(props: Props) {
  const {
    whole,
    timeShare,
    moneyShare,
    time,
    money: spending,
  } = timeAndMoney(props.pace, props.ongoing, props.grain, props.currency);
  if (!whole) return null;
  return (
    <div className="pace pace-time">
      <div className="pace-row">
        <span className="pace-row-label">{time.label}</span>
        <span className="pace-row-value">{time.value}</span>
        <span className="pace-track" aria-hidden="true">
          <span className="pace-time-fill" style={{width: percent(timeShare)}} />
        </span>
      </div>
      <div className="pace-row">
        <span className="pace-row-label">{spending.label}</span>
        <span className="pace-row-value">{spending.value}</span>
        <span className="pace-track" aria-hidden="true">
          <span
            className={`pace-money-fill${moneyShare > 1 ? ' is-over' : ''}`}
            style={{width: percent(Math.min(1, moneyShare))}}
          />
        </span>
      </div>
      <TimeMoneyText {...props} />
    </div>
  );
}
