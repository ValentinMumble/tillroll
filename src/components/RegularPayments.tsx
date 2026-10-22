import {money} from '../format';
import {dayLabel} from '../periods';
import {priceChanged, type Subscription} from '../report';

interface Props {
  subscriptions: Subscription[];
  currency: string;
  /** Opens one store's dialog (name and category). */
  onOpenStore: (store: {key: string; name: string}) => void;
}

/**
 * The regular payments: stores charged about the same each month, what they cost a month in all, and for each its
 * latest charge, when the next one should come, and whether it is new or its price changed.
 */
export function RegularPayments({subscriptions, currency, onOpenStore}: Props) {
  if (subscriptions.length === 0) return null;
  const total = subscriptions.reduce((sum, item) => sum + item.monthly, 0);
  return (
    <section className="card regular">
      <header className="card-head">
        <h2>Regular payments</h2>
        <span className="view-total">{money(total, currency)}</span>
        <span className="hint">
          a month, {subscriptions.length === 1 ? '1 store' : `${subscriptions.length} stores`} charged about the same
          each month
        </span>
      </header>
      <ul>
        {subscriptions.map(item => (
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
              {item.isNew && <span className="tag">new</span>}
              {priceChanged(item) && (
                <span
                  className={`tag ${item.change > 0 ? 'is-up' : 'is-down'}`}
                  title="The latest charge against the one before it"
                >
                  {item.change > 0 ? 'up' : 'down'} {money(Math.abs(item.change), currency, true)}
                </span>
              )}
            </span>
            <span className="regular-dates">
              last {dayLabel(item.last.date)} · next about {dayLabel(item.next)}
            </span>
            <span className="payment-amount">{money(item.monthly, currency, true)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
