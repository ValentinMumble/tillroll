import {money} from '../format';
import {dayLabel, today} from '../periods';
import type {Upcoming} from '../report';

interface Props {
  upcoming: Upcoming[];
  currency: string;
  /** The bank accounts together at their last sync; null without a bank connection. */
  balance: number | null;
  /** Opens one store's dialog (name and category). */
  onOpenStore: (store: {key: string; name: string}) => void;
}

/**
 * The month going on: its regular payments not charged yet (see stillToCome), what they come to, and the bank
 * accounts once they are paid. Each says when it should come, or that it is late.
 */
export function StillToCome({upcoming, currency, balance, onOpenStore}: Props) {
  if (upcoming.length === 0) return null;
  const total = upcoming.reduce((sum, entry) => sum + entry.item.monthly, 0);
  const now = today();
  return (
    <section className="card regular still-to-come">
      <header className="card-head">
        <h2>Still to come</h2>
        <span className="view-total">{money(total, currency)}</span>
        <span className="hint">
          {upcoming.length === 1 ? 'a regular payment' : `${upcoming.length} regular payments`} not charged yet this
          month
          {balance !== null && `, about ${money(balance - total, currency)} left in your accounts after them`}
        </span>
      </header>
      <ul>
        {upcoming.map(({item, date}) => (
          <li key={item.key}>
            <span className="regular-name">
              <button
                type="button"
                className="payment-store-name"
                title={`Rename ${item.store} or change its category`}
                onClick={() => onOpenStore({key: item.storeKey, name: item.store})}
              >
                {item.name}
              </button>
              {date < now && (
                <span className="tag is-up" title="Its usual day has gone by: it may come late, or have stopped">
                  late
                </span>
              )}
            </span>
            <span className="regular-dates">
              {date < now ? `was due ${dayLabel(date)}` : `about ${dayLabel(date)}`}
            </span>
            <span className="payment-amount">{money(item.monthly, currency, true)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
