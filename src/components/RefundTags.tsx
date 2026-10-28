import {money} from '../format';
import {dayLabel, today} from '../periods';
import type {Row} from '../rows';

interface Props {
  row: Row;
  /** The payments some money in was linked to by hand (see paidBackIds): theirs is paid back, not refunded. */
  paidBack: Set<string>;
}

/**
 * What refunds and paybacks change, as tags after the store: money in names the payment it gives back ("refund of
 * 3 Aug", "pays back Airbnb, 22 Sept") or says none was found ("refund"); a payment says how much came back ("€286
 * paid back", "refunded"). The payment list and the overview's latest payments show the same tags.
 */
export function RefundTags({row, paidBack}: Props) {
  const day = (date: string) => dayLabel(date, date.slice(0, 4) !== today().slice(0, 4));
  return (
    <>
      {row.refundOf && (
        <span className="tag is-refund" title="This payment costs that much less instead">
          {row.refundOf.byHand
            ? `pays back ${row.refundOf.store}, ${day(row.refundOf.date)}`
            : `refund of ${day(row.refundOf.date)}`}
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
        <span className="tag is-refund">
          {`${row.spend === 0 ? '' : `${money(row.refunded, row.currency, true)} `}${
            paidBack.has(row.id) ? 'paid back' : 'refunded'
          }`}
        </span>
      )}
    </>
  );
}
