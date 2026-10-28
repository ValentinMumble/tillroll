import {useState} from 'react';
import {money} from '../format';
import {addDays, dayLabel, today} from '../periods';
import {PAYBACK_ROUNDING, type Row, searchText} from '../rows';
import {plain} from '../text';

interface Props {
  /** The money in. */
  row: Row;
  /** Every payment in its currency, from every period: the one it pays back may be in an earlier month. */
  rows: Row[];
  /** The payment it pays back, by id; null takes the link off. */
  onLink: (paymentId: string | null) => void;
}

/** A payback is linked to a payment made at most this many days before it, or this many days after (paid ahead). */
const DAYS_BEFORE = 180;
const DAYS_AFTER = 30;
const SHOWN = 6;

/**
 * Money in that pays back a payment (a friend's share of a flat paid with one's card): the payment it pays back, picked
 * among the spending of the months before, newest first, with a search. That payment then costs that much less.
 */
export function PaybackPicker({row, rows, onLink}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const linked = row.refundOf?.byHand ? row.refundOf : null;
  const year = today().slice(0, 4);
  const day = (date: string) => dayLabel(date, date.slice(0, 4) !== year);

  if (linked) {
    return (
      <p className="payback-linked">
        Pays back <strong>{linked.store}</strong>, {day(linked.date)}
        <button type="button" className="link-button" onClick={() => onLink(null)}>
          Unlink
        </button>
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        Pick the payment it pays back…
      </button>
    );
  }
  const from = addDays(row.date, -DAYS_BEFORE);
  const to = addDays(row.date, DAYS_AFTER);
  const words = plain(query)
    .split(/\s+/)
    .map(word => word.replace(/^[-+−]|€/g, ''))
    .filter(Boolean);
  // Spending it can pay back: what is left of it after refunds is at least this much, give or take rounding up.
  const options = rows
    .filter(
      payment =>
        payment.amount < 0 &&
        payment.counts &&
        !payment.pending &&
        payment.date >= from &&
        payment.date <= to &&
        -payment.amount - payment.refunded > 0 &&
        -payment.amount - payment.refunded >= row.amount - PAYBACK_ROUNDING &&
        words.every(word => searchText(payment).includes(word)),
    )
    .sort((first, second) => second.date.localeCompare(first.date));
  return (
    <div className="payback-picker">
      <input
        className="text-input"
        type="search"
        aria-label="Search the payment it pays back"
        placeholder="Search a store, a label or an amount"
        value={query}
        autoFocus
        onChange={event => setQuery(event.target.value)}
      />
      {options.length === 0 ? (
        <p className="hint">No payment of {money(row.amount, row.currency)} or more in the months before.</p>
      ) : (
        <ul className="payback-options">
          {options.slice(0, SHOWN).map(payment => (
            <li key={payment.id}>
              <button type="button" onClick={() => onLink(payment.id)}>
                <span className="payback-store">{payment.store}</span>
                <span className="payback-day">{day(payment.date)}</span>
                <span className="payment-amount">{money(payment.amount, payment.currency, true)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
