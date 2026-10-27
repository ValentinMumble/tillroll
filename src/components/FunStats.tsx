import {useMemo} from 'react';
import {dayLabel, WEEKDAYS} from '../periods';
import type {Row} from '../rows';
import {funStats} from '../stats';
import {BarStrip} from './BarStrip';

interface Props {
  /** The payments of one currency, all time. */
  rows: Row[];
  currency: string;
}

/** Playful facts about all the spending: weekdays, hours, records, streaks. */
export function FunStats({rows, currency}: Props) {
  const stats = useMemo(() => funStats(rows, currency), [rows, currency]);
  if (!stats) {
    return (
      <section className="card">
        <p className="empty">No spending yet.</p>
      </section>
    );
  }
  return (
    <section className="card fun-stats">
      <header className="card-head">
        <h2>Fun stats</h2>
        <span className="hint">
          all time, {dayLabel(stats.from, true)} to {dayLabel(stats.to, true)}
        </span>
      </header>
      <div className="stat-charts">
        <BarStrip
          caption="An average day, by weekday"
          values={stats.weekdays.map(day => day.average)}
          labels={WEEKDAYS.map(day => day.slice(0, 3))}
          currency={currency}
        />
        {stats.hours && (
          <BarStrip
            caption="Spent by hour of the day"
            values={stats.hours}
            labels={stats.hours.map((_value, hour) => (hour % 3 === 0 ? String(hour) : ''))}
            titles={stats.hours.map((_value, hour) => `${hour}:00 to ${hour + 1}:00`)}
            currency={currency}
          />
        )}
      </div>
      <ul className="facts-grid">
        {stats.facts.map(fact => (
          <li key={fact.title}>
            <span className="fact-icon" aria-hidden="true">
              {fact.icon}
            </span>
            <span className="fact-title">{fact.title}</span>
            <strong className="fact-value">{fact.value}</strong>
            <span className="fact-detail">{fact.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
