import {useMemo} from 'react';
import type {Categories} from '../categories';
import {hobbyStats} from '../hobbies';
import {dayLabel, MONTHS, WEEKDAYS} from '../periods';
import type {Row} from '../rows';
import {funStats} from '../stats';
import {BarStrip} from './BarStrip';
import {FactList} from './FactList';

interface Props {
  /** The payments of one currency, all time. */
  rows: Row[];
  currency: string;
  categories: Categories;
}

/**
 * Playful facts about all the spending: weekdays, hours, seasons, records, streaks, friends, hobbies, labels. Then a
 * tile per hobby (the categories marked so). The trips and the trains have their own view (see TripsView).
 */
export function FunStats({rows, currency, categories}: Props) {
  const stats = useMemo(() => funStats(rows, currency, categories), [rows, currency, categories]);
  const hobbies = useMemo(() => hobbyStats(rows, currency, categories), [rows, currency, categories]);
  if (!stats) {
    return (
      <section className="card">
        <p className="empty">No spending yet.</p>
      </section>
    );
  }
  return (
    <>
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
          {stats.seasons && (
            <BarStrip
              caption="An average month, by month of the year"
              values={stats.seasons}
              labels={MONTHS.map(month => month.charAt(0))}
              titles={MONTHS}
              currency={currency}
            />
          )}
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
        <FactList facts={stats.facts} />
      </section>
      <section className="card fun-stats">
        <header className="card-head">
          <h2>Hobbies</h2>
          <span className="hint">
            {hobbies.length > 0
              ? 'what each cost once resales, refunds and paybacks are taken off'
              : 'Tick "Hobby" for your hobby categories in Edit categories: each gets a tile here.'}
          </span>
        </header>
        {hobbies.length > 0 && <FactList facts={hobbies} />}
      </section>
    </>
  );
}
