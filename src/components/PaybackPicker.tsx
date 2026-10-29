import {useState} from 'react';
import {money} from '../format';
import {addDays, dayLabel, today} from '../periods';
import {type Row, searchText} from '../rows';
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
 * Money in that pays back a payment (a friend's share of a flat paid with one's card, or something sold on years
 * later): the payment it pays back, picked among the spending of the months before, newest first, or found by a search
 * at any date. That payment then costs that much less.
 */
export function PaybackPicker({row, rows, onLink}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const linked = row.refundOf?.byHand ? row.refundOf : null;
  const year = today().slice(0, 4);
  const day = (date: string) => dayLabel(date, date.slice(0, 4) !== year);

  if (linked) {
    return (
      <>
        <p className="payback-linked">
          Pays back <strong>{linked.store}</strong>, {day(linked.date)}
          <button type="button" className="link-button" onClick={() => onLink(null)}>
            Unlink
          </button>
        </p>
        {row.beyond > 0 && (
          <p className="hint">
            {money(row.beyond, row.currency, true)} more than was left of it: that lowers the spending of{' '}
            {day(row.date)}'s month instead.
          </p>
        )}
      </>
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
  // Spending with something left to pay back. A search looks at any of it, at any date. Without one, the likely ones
  // in the months around it: about as much as the money in or more (a friend may round up or add a little: a fifth
  // more, or €1 on a small one).
  const options = rows
    .filter(payment => {
      const left = -payment.amount - payment.refunded;
      if (payment.amount >= 0 || !payment.counts || payment.pending || left < 0.005) return false;
      if (words.length > 0) return words.every(word => searchText(payment).includes(word));
      return payment.date >= from && payment.date <= to && row.amount <= left + Math.max(1, left / 5);
    })
    .sort((first, second) => second.date.localeCompare(first.date));
  return (
    <div className="payback-picker">
      <input
        className="text-input"
        type="search"
        aria-label="Search the payment it pays back"
        placeholder="Search a store, a label or an amount, any date"
        value={query}
        autoFocus
        onChange={event => setQuery(event.target.value)}
      />
      {options.length === 0 ? (
        <p className="hint">
          {words.length > 0
            ? 'No payment with something left to pay back matches, at any date.'
            : `No payment of about ${money(row.amount, row.currency)} or more in the months before: search to look further back.`}
        </p>
      ) : (
        <ul className="payback-options">
          {options.slice(0, SHOWN).map(payment => (
            <li key={payment.id}>
              <button type="button" onClick={() => onLink(payment.id)}>
                <span className="payback-store">
                  {payment.store}
                  {/* Its labels, as in the calendar: a search may have found it by one. */}
                  {payment.labels.map(label => (
                    <span key={label} className="label-tag">
                      # {label}
                    </span>
                  ))}
                </span>
                <span className="payback-day">
                  {day(payment.date)}
                  {payment.refunded > 0 &&
                    ` · ${money(-payment.amount - payment.refunded, payment.currency, true)} left`}
                </span>
                <span className="payment-amount">{money(payment.amount, payment.currency, true)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * For a payment: the money in that gave it back, oldest first (see givenBack). A payback linked by hand can be
 * unlinked here too, from the payment's side.
 */
export function PaidBackBy({credits, onUnlink}: {credits: Row[]; onUnlink: (credit: Row) => void}) {
  const year = today().slice(0, 4);
  const day = (date: string) => dayLabel(date, date.slice(0, 4) !== year);
  return (
    <ul className="paid-back-by">
      {credits.map(credit => (
        <li key={credit.id}>
          <span className="payback-store">{credit.store}</span>
          <span className="payback-day">{day(credit.date)}</span>
          <span className="payment-amount">{money(credit.amount, credit.currency, true)}</span>
          {credit.refundOf?.byHand ? (
            <button type="button" className="link-button" onClick={() => onUnlink(credit)}>
              Unlink
            </button>
          ) : (
            <span className="muted">refund</span>
          )}
        </li>
      ))}
    </ul>
  );
}
