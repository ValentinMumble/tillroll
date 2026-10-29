import {useMemo} from 'react';
import type {Categories} from '../categories';
import {dayLabel, WEEKDAYS} from '../periods';
import type {Row} from '../rows';
import {hobbyStats} from '../hobbies';
import {type Fact, funStats} from '../stats';
import {money} from '../format';
import {trainStats, type TrainStats} from '../trains';
import {BarStrip} from './BarStrip';

interface Props {
  /** The payments of one currency, all time. */
  rows: Row[];
  currency: string;
  categories: Categories;
}

/** The months of the year, for the seasons chart's labels. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The facts as a grid of tiles: an icon, what it is, the big value, a line of detail. */
function FactList({facts}: {facts: Fact[]}) {
  return (
    <ul className="facts-grid">
      {facts.map(fact => (
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
  );
}

function ticketCount(count: number) {
  return `${count} ticket${count === 1 ? '' : 's'}`;
}

/** The lines taken most, as bars: how many tickets, what one cost on average. */
function LineList({lines, currency}: {lines: TrainStats['lines']; currency: string}) {
  const top = Math.max(1, ...lines.map(line => line.count));
  return (
    <figure className="stat-bars train-lines">
      <figcaption>Your lines</figcaption>
      <ul className="bars">
        {lines.map(line => (
          <li key={line.name} className="bar-row is-static">
            <span className="bar-label">
              <span className="bar-name">{line.name}</span>
            </span>
            <span className="bar-value">{ticketCount(line.count)}</span>
            <span className="bar-change muted">{money(line.total / line.count, currency)} each</span>
            <span className="bar-track">
              <span className="bar-fill" style={{width: `${(line.count / top) * 100}%`}} />
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * Playful facts about all the spending: weekdays, hours, seasons, records, streaks, friends, hobbies, labels. Then a
 * tile per hobby (the categories marked so), and the train tickets on their own, when there are some.
 */
export function FunStats({rows, currency, categories}: Props) {
  const stats = useMemo(() => funStats(rows, currency, categories), [rows, currency, categories]);
  const hobbies = useMemo(() => hobbyStats(rows, currency, categories), [rows, currency, categories]);
  const trains = useMemo(() => trainStats(rows, currency), [rows, currency]);
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
      {trains && (
        <section className="card fun-stats">
          <header className="card-head">
            <h2>Trains</h2>
            <span className="hint">from your train tickets and their route labels; distances and CO₂ are rough</span>
          </header>
          <div className="stat-charts">
            <BarStrip
              caption="Spent on train tickets, by year"
              values={trains.years.map(year => year.total)}
              labels={trains.years.map(year => `’${year.year.slice(2)}`)}
              titles={trains.years.map(year => `${year.year}, ${ticketCount(year.count)}`)}
              currency={currency}
            />
            <BarStrip
              caption="By month of the year, every year together"
              values={trains.months}
              labels={MONTHS.map(month => month.charAt(0))}
              titles={MONTHS}
              currency={currency}
            />
          </div>
          {trains.lines.length > 0 && <LineList lines={trains.lines} currency={currency} />}
          <FactList facts={trains.facts} />
        </section>
      )}
    </>
  );
}
