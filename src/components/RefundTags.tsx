import {money} from '../format';
import {dayLabel, today} from '../periods';
import {givenTitle, type Row} from '../rows';

interface Props {
  row: Row;
  /** The money in that gave each payment back (see givenBack). */
  givenBack: Map<string, Row[]>;
  /** Opens the payment's sheet, which lists what gave it back. */
  onOpen: () => void;
}

/**
 * What refunds and paybacks change, as tags after the store: money in names the payment it gives back ("refund of
 * 3 Aug", "refund of Amazon, 19 Oct", "pays back Airbnb, 22 Sept") or says none was found ("refund"); a payment says
 * how much came back ("€286 paid back", "refunded"), names who gave it back on hover, and opens its sheet, which lists
 * them. The payment list and the overview's latest payments show the same tags.
 */
export function RefundTags({row, givenBack, onOpen}: Props) {
  const day = (date: string) => dayLabel(date, date.slice(0, 4) !== today().slice(0, 4));
  const credits = givenBack.get(row.id) ?? [];
  const paidBack = credits.some(credit => credit.refundOf?.byHand);
  return (
    <>
      {row.refundOf && (
        <span
          className="tag is-refund"
          title={
            row.beyond > 0
              ? `${money(row.beyond, row.currency, true)} more than was left of it: that lowers this month's spending`
              : 'This payment costs that much less instead'
          }
        >
          {row.refundOf.byHand
            ? `pays back ${row.refundOf.store}, ${day(row.refundOf.date)}`
            : // A refund that does not name its shop (a card refund named after the holder) says which it is.
              `refund of ${row.refundOf.store === row.store ? '' : `${row.refundOf.store}, `}${day(row.refundOf.date)}`}
        </span>
      )}
      {row.refund && !row.refundOf && (
        <span
          className="tag is-refund"
          title="No payment found for it: it lowers the spending of its own week and month"
        >
          refund
        </span>
      )}
      {row.refunded > 0 && (
        <button
          type="button"
          className="tag is-refund"
          title={`${givenTitle(credits)} ${credits
            .map(credit => `${credit.store}, ${day(credit.date)}, ${money(credit.amount, credit.currency, true)}`)
            .join('; ')}`}
          onClick={event => {
            // The row's own tap opens the sheet too: once is enough.
            event.stopPropagation();
            onOpen();
          }}
        >
          {`${row.spend === 0 ? '' : `${money(row.refunded, row.currency, true)} `}${paidBack ? 'paid back' : 'refunded'}`}
        </button>
      )}
    </>
  );
}
